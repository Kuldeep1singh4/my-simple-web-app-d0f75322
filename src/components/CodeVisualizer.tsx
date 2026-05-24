import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Play, Pause, StepForward, StepBack, Sparkles, Loader2, Clock, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { traceCode, type TraceStep, type JsonValue, type Complexity } from "@/lib/trace.functions";
import { cn } from "@/lib/utils";

type Language = "javascript" | "python" | "java" | "c" | "cpp";

const LANGUAGE_LABELS: Record<Language, string> = {
  javascript: "JavaScript",
  python: "Python",
  java: "Java",
  c: "C",
  cpp: "C++",
};

const DEFAULT_CODE: Record<Language, string> = {
  javascript: `let arr = [5, 2, 4, 1, 3];
for (let i = 1; i < arr.length; i++) {
  let key = arr[i];
  let j = i - 1;
  while (j >= 0 && arr[j] > key) {
    arr[j + 1] = arr[j];
    j = j - 1;
  }
  arr[j + 1] = key;
}
`,
  python: `arr = [5, 2, 4, 1, 3]
for i in range(1, len(arr)):
    key = arr[i]
    j = i - 1
    while j >= 0 and arr[j] > key:
        arr[j + 1] = arr[j]
        j = j - 1
    arr[j + 1] = key
`,
  java: `int[] arr = {5, 2, 4, 1, 3};
for (int i = 1; i < arr.length; i++) {
  int key = arr[i];
  int j = i - 1;
  while (j >= 0 && arr[j] > key) {
    arr[j + 1] = arr[j];
    j = j - 1;
  }
  arr[j + 1] = key;
}
`,
  c: `int arr[] = {5, 2, 4, 1, 3};
for (int i = 1; i < 5; i++) {
  int key = arr[i];
  int j = i - 1;
  while (j >= 0 && arr[j] > key) {
    arr[j + 1] = arr[j];
    j = j - 1;
  }
  arr[j + 1] = key;
}
`,
  cpp: `int arr[] = {5, 2, 4, 1, 3};
for (int i = 1; i < 5; i++) {
  int key = arr[i];
  int j = i - 1;
  while (j >= 0 && arr[j] > key) {
    arr[j + 1] = arr[j];
    j = j - 1;
  }
  arr[j + 1] = key;
}
`,
};

function languageExtension(lang: Language): Extension {
  switch (lang) {
    case "python":
      return python();
    case "java":
      return java();
    case "c":
    case "cpp":
      return cpp();
    default:
      return javascript();
  }
}

// CodeMirror highlight extension for the active line
const setActiveLine = StateEffect.define<number | null>();
const activeLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setActiveLine)) {
        if (e.value == null) return Decoration.none;
        const lineNum = Math.max(1, Math.min(e.value, tr.state.doc.lines));
        const line = tr.state.doc.line(lineNum);
        return Decoration.set([
          Decoration.line({ class: "cm-active-trace-line" }).range(line.from),
        ]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const lineTheme = EditorView.baseTheme({
  ".cm-active-trace-line": {
    backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
    boxShadow: "inset 3px 0 0 0 var(--primary)",
  },
});

function formatPrimitive(value: JsonValue): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function isPlainObject(v: JsonValue): v is { [k: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isLinkedNode(v: JsonValue): v is { [k: string]: JsonValue } {
  return isPlainObject(v) && "next" in v;
}
function isTreeNode(v: JsonValue): v is { [k: string]: JsonValue } {
  return isPlainObject(v) && ("left" in v || "right" in v);
}

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

// ---------- Color palette by action ----------
type ColorKind = "compare" | "swapError" | "successInsert" | "readWrite" | "default";
function actionKind(action?: string): ColorKind {
  switch (action) {
    case "compare":
      return "compare";
    case "swap":
    case "error":
      return "swapError";
    case "insert":
    case "success":
      return "successInsert";
    case "read":
    case "write":
      return "readWrite";
    default:
      return "default";
  }
}
const COLORS: Record<ColorKind, { bg: string; border: string; fg: string }> = {
  compare: { bg: "oklch(0.78 0.17 80)", border: "oklch(0.68 0.2 75)", fg: "oklch(0.2 0.05 80)" },
  swapError: { bg: "oklch(0.65 0.22 25)", border: "oklch(0.55 0.24 25)", fg: "oklch(0.98 0 0)" },
  successInsert: { bg: "oklch(0.72 0.19 145)", border: "oklch(0.6 0.21 145)", fg: "oklch(0.18 0.04 145)" },
  readWrite: { bg: "oklch(0.7 0.15 230)", border: "oklch(0.6 0.18 230)", fg: "oklch(0.98 0 0)" },
  default: { bg: "oklch(0.32 0.04 250)", border: "oklch(0.45 0.05 250)", fg: "oklch(0.95 0.01 250)" },
};

// ---------- Active variable parsing ----------
type ActiveSet = {
  names: Set<string>;            // "total", "i", "arr"
  indices: Map<string, Set<number>>; // arr -> {0,1}
};
function parseActive(list: string[] | undefined): ActiveSet {
  const names = new Set<string>();
  const indices = new Map<string, Set<number>>();
  for (const raw of list ?? []) {
    const m = raw.match(/^([A-Za-z_$][\w$]*)\s*\[\s*(-?\d+)\s*\]$/);
    if (m) {
      const [, n, i] = m;
      names.add(n);
      if (!indices.has(n)) indices.set(n, new Set());
      indices.get(n)!.add(parseInt(i, 10));
    } else {
      names.add(raw.trim());
    }
  }
  return { names, indices };
}

// ---------- Animated array row ----------
function ArrayRow({
  name,
  value,
  active,
  pointers,
}: {
  name: string;
  value: JsonValue[];
  active: ActiveSet;
  pointers: { var: string; index: number }[];
}) {
  const activeIdx = active.indices.get(name) ?? new Set<number>();
  const nameActive = active.names.has(name) && activeIdx.size === 0;

  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
        {name}
      </div>
      <div className="relative pb-10">
        <LayoutGroup id={`arr-${name}`}>
          <motion.div layout className="flex gap-1.5 overflow-x-auto pb-1">
            {value.map((item, i) => {
              const isActive = activeIdx.has(i) || nameActive;
              const kind: ColorKind = isActive ? "default" : "default";
              // active cells get the current action color; pulled via parent via CSS var override below
              return (
                <motion.div
                  key={`${name}-${typeof item === "number" || typeof item === "string" ? item : i}-${i}`}
                  layout
                  data-active-key={`${name}[${i}]`}
                  transition={SPRING}
                  animate={{
                    backgroundColor: isActive ? "var(--cell-active-bg)" : COLORS.default.bg,
                    borderColor: isActive ? "var(--cell-active-border)" : COLORS.default.border,
                    color: isActive ? "var(--cell-active-fg)" : COLORS.default.fg,
                    scale: isActive ? 1.08 : 1,
                  }}
                  className="relative flex flex-col items-center justify-center rounded-md border-2 font-mono font-semibold text-sm min-w-12 h-12 px-2"
                  style={{ backgroundColor: COLORS.default.bg, borderColor: COLORS.default.border }}
                >
                  <span>{formatPrimitive(item)}</span>
                  <span className="absolute -bottom-4 text-[10px] font-mono text-muted-foreground">
                    {i}
                  </span>
                  {/* Pointers */}
                  <AnimatePresence>
                    {pointers
                      .filter((p) => p.index === i)
                      .map((p, k) => (
                        <motion.div
                          key={p.var}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={SPRING}
                          style={{ top: `calc(100% + ${14 + k * 18}px)` }}
                          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
                        >
                          <span className="text-primary text-lg leading-none font-bold">↑</span>
                          <span className="text-[10px] font-mono text-primary font-bold">{p.var}</span>
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        </LayoutGroup>
      </div>
    </div>
  );
}

// ---------- Scalar card ----------
function ScalarCard({
  name,
  value,
  active,
  actionColor,
}: {
  name: string;
  value: JsonValue;
  active: boolean;
  actionColor: { bg: string; border: string; fg: string };
}) {
  const display = useMemo(() => {
    try {
      return typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : formatPrimitive(value);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <motion.div
      layout
      data-active-key={name}
      transition={SPRING}
      animate={{
        backgroundColor: active ? actionColor.bg : "var(--color-card)",
        borderColor: active ? actionColor.border : "var(--color-border)",
        scale: active ? 1.04 : 1,
      }}
      className="rounded-lg border-2 p-3"
    >
      <div
        className="text-xs uppercase tracking-wider font-mono"
        style={{ color: active ? actionColor.fg : "var(--color-muted-foreground)" }}
      >
        {name}
      </div>
      <motion.div
        key={display}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="mt-1 font-mono text-lg font-semibold break-all"
        style={{ color: active ? actionColor.fg : "var(--color-foreground)" }}
      >
        {display}
      </motion.div>
    </motion.div>
  );
}

// ---------- Linked List / Tree (kept simple) ----------
function LinkedListView({ head }: { head: { [k: string]: JsonValue } }) {
  const nodes: { [k: string]: JsonValue }[] = [];
  let cur: JsonValue = head;
  let guard = 0;
  while (isLinkedNode(cur) && guard < 50) {
    nodes.push(cur);
    cur = cur.next;
    guard++;
  }
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {nodes.map((n, i) => {
        const valueKey = Object.keys(n).find((k) => k !== "next");
        const display = valueKey ? formatPrimitive(n[valueKey]) : "{…}";
        return (
          <motion.div key={i} layout transition={SPRING} className="flex items-center gap-1">
            <div className="px-3 py-2 rounded-md bg-card border border-border font-mono text-sm">
              {display}
            </div>
            <span className="text-primary font-mono text-lg">→</span>
          </motion.div>
        );
      })}
      <span className="font-mono text-xs text-muted-foreground">
        {cur === null ? "null" : "…"}
      </span>
    </div>
  );
}
function TreeView({ node }: { node: { [k: string]: JsonValue } }) {
  const valueKey = Object.keys(node).find((k) => k !== "left" && k !== "right");
  const display = valueKey ? formatPrimitive(node[valueKey]) : "•";
  const left = node.left;
  const right = node.right;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="px-3 py-1.5 rounded-md bg-card border border-primary/40 font-mono text-sm">
        {display}
      </div>
      {(isPlainObject(left) || isPlainObject(right)) && (
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center">
            <div className="text-[10px] text-muted-foreground font-mono">L</div>
            {isPlainObject(left) ? (
              <TreeView node={left} />
            ) : (
              <div className="text-xs font-mono text-muted-foreground">
                {left === undefined ? "—" : formatPrimitive(left as JsonValue)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center">
            <div className="text-[10px] text-muted-foreground font-mono">R</div>
            {isPlainObject(right) ? (
              <TreeView node={right} />
            ) : (
              <div className="text-xs font-mono text-muted-foreground">
                {right === undefined ? "—" : formatPrimitive(right as JsonValue)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Floating Tooltip ----------
function FloatingTooltip({
  containerRef,
  targetKey,
  text,
  visible,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  targetKey: string | null;
  text: string;
  visible: boolean;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!visible || !targetKey || !containerRef.current) {
      setPos(null);
      return;
    }
    const cont = containerRef.current;
    const cells = cont.querySelectorAll<HTMLElement>(`[data-active-key="${CSS.escape(targetKey)}"]`);
    const cell = cells[0];
    if (!cell) {
      setPos(null);
      return;
    }
    const cR = cont.getBoundingClientRect();
    const eR = cell.getBoundingClientRect();
    const tipW = tipRef.current?.offsetWidth ?? 220;
    const tipH = tipRef.current?.offsetHeight ?? 50;
    let x = eR.left - cR.left + eR.width / 2 - tipW / 2 + cont.scrollLeft;
    let y = eR.top - cR.top - tipH - 12 + cont.scrollTop;
    const maxX = cont.clientWidth - tipW - 8;
    if (x < 8) x = 8;
    if (x > maxX) x = Math.max(8, maxX);
    if (y < 4) y = eR.bottom - cR.top + 12 + cont.scrollTop; // flip below
    setPos({ x, y });
  }, [visible, targetKey, text, containerRef]);

  return (
    <AnimatePresence>
      {visible && pos && (
        <motion.div
          ref={tipRef}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, x: pos.x, y: pos.y }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={SPRING}
          style={{ position: "absolute", top: 0, left: 0, maxWidth: 280 }}
          className="z-20 pointer-events-none rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs shadow-xl shadow-primary/30 border border-primary/50"
        >
          <div className="leading-snug">{text}</div>
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45 bg-primary border-r border-b border-primary/50" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- Main ----------
export function CodeVisualizer() {
  const [language, setLanguage] = useState<Language>("javascript");
  const [codeByLang, setCodeByLang] = useState<Record<Language, string>>(DEFAULT_CODE);
  const code = codeByLang[language];
  const setCode = (v: string) => setCodeByLang((prev) => ({ ...prev, [language]: v }));
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [complexity, setComplexity] = useState<Complexity | null>(null);
  const [idx, setIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const editorRef = useRef<EditorView | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const trace = useServerFn(traceCode);

  const current = idx >= 0 && idx < steps.length ? steps[idx] : null;
  const active = useMemo(() => parseActive(current?.activeVariables), [current]);
  const kind = actionKind(current?.actionType);
  const actionColor = COLORS[kind];

  // CSS vars for active cells (used by ArrayRow children)
  const canvasStyle = {
    ["--cell-active-bg" as string]: actionColor.bg,
    ["--cell-active-border" as string]: actionColor.border,
    ["--cell-active-fg" as string]: actionColor.fg,
  } as React.CSSProperties;

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.dispatch({
      effects: setActiveLine.of(current ? current.line : null),
    });
  }, [current]);

  useEffect(() => {
    if (!playing) return;
    if (idx >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, steps.length - 1)), 2000);
    return () => clearTimeout(t);
  }, [playing, idx, steps.length]);

  const handleVisualize = async () => {
    setLoading(true);
    setError(null);
    setTraceError(null);
    setComplexity(null);
    setPlaying(false);
    setIdx(-1);
    try {
      const res = await trace({ data: { code, language } });
      if (res.error) {
        setError(res.error);
        setSteps([]);
      } else if (res.traceError) {
        setTraceError(res.traceError);
        setSteps([]);
        setComplexity(res.complexity);
      } else {
        setSteps(res.steps);
        setComplexity(res.complexity);
        setIdx(res.steps.length > 0 ? 0 : -1);
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const stepForward = () => setIdx((i) => Math.min(i + 1, steps.length - 1));
  const stepBack = () => setIdx((i) => Math.max(i - 1, 0));

  const variables = current?.variables ?? {};

  // Partition variables
  const entries = Object.entries(variables);
  const arrays = entries.filter(([, v]) => Array.isArray(v)) as [string, JsonValue[]][];
  const trees = entries.filter(([, v]) => isTreeNode(v));
  const linked = entries.filter(([, v]) => !isTreeNode(v) && isLinkedNode(v));
  const scalars = entries.filter(
    ([, v]) => !Array.isArray(v) && !isLinkedNode(v) && !isTreeNode(v)
  );

  // Pointers: scalar numeric vars whose value is a valid index of an array
  const pointersByArray = useMemo(() => {
    const map = new Map<string, { var: string; index: number }[]>();
    for (const [aName, aVal] of arrays) {
      const len = aVal.length;
      const list: { var: string; index: number }[] = [];
      for (const [sName, sVal] of scalars) {
        if (typeof sVal === "number" && Number.isInteger(sVal) && sVal >= 0 && sVal < len) {
          // Heuristic: short single-letter or common index names
          if (/^[a-z]$/i.test(sName) || /^(idx|index|pos|left|right|lo|hi|mid)$/i.test(sName)) {
            list.push({ var: sName, index: sVal });
          }
        }
      }
      map.set(aName, list);
    }
    return map;
  }, [arrays, scalars]);

  // Tooltip target: first active key found in the DOM
  const tooltipTarget = useMemo(() => {
    if (!current?.activeVariables?.length) return null;
    return current.activeVariables[0];
  }, [current]);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-background text-foreground">
      {/* Editor */}
      <div className="flex flex-col w-full md:w-1/2 h-[40vh] md:h-full border-b md:border-b-0 md:border-r border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <h1 className="font-semibold truncate">Code Visualizer</h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
                  <SelectItem key={l} value={l} className="text-xs">
                    {LANGUAGE_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleVisualize} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Tracing…
                </>
              ) : (
                "Visualize"
              )}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <CodeMirror
            value={code}
            onChange={setCode}
            theme="dark"
            extensions={[languageExtension(language), activeLineField, lineTheme]}
            basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
            onCreateEditor={(view) => {
              editorRef.current = view;
            }}
            height="100%"
            className="h-full text-sm"
          />
        </div>
      </div>

      {/* Canvas */}
      <div className="flex flex-col w-full md:w-1/2 h-[60vh] md:h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
          <h2 className="font-semibold">Visualization</h2>
          <div className="text-xs text-muted-foreground font-mono">
            {steps.length > 0 ? `Step ${idx + 1} / ${steps.length}` : "No trace yet"}
          </div>
        </div>

        <div
          ref={canvasRef}
          style={canvasStyle}
          className="relative flex-1 overflow-y-auto p-4 space-y-5"
        >
          {error && (
            <Card className="p-3 border-destructive/40 bg-destructive/10 text-destructive text-sm">
              {error}
            </Card>
          )}

          {traceError && (
            <Card className="p-4 border-2 border-destructive bg-destructive/10">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-destructive/20 text-destructive flex items-center justify-center font-bold text-lg shrink-0">
                  !
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-destructive font-bold mb-1">
                    Syntax Error
                  </div>
                  <div className="text-sm text-destructive font-mono leading-relaxed break-words">
                    {traceError}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {!error && !traceError && steps.length === 0 && !loading && (
            <div className="h-full flex items-center justify-center text-center text-muted-foreground text-sm">
              <div>
                Write some code and click <span className="text-primary font-medium">Visualize</span>{" "}
                to trace its execution step by step.
              </div>
            </div>
          )}

          {complexity && (
            <Card className="p-4 bg-gradient-to-br from-primary/10 via-card to-card border-primary/30">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                Complexity Analysis
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Time
                    </span>
                    <span className="inline-flex items-center self-start mt-0.5 px-2 py-0.5 rounded-md bg-primary/15 text-primary font-mono text-sm font-semibold border border-primary/30">
                      {complexity.time}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Space
                    </span>
                    <span className="inline-flex items-center self-start mt-0.5 px-2 py-0.5 rounded-md bg-primary/15 text-primary font-mono text-sm font-semibold border border-primary/30">
                      {complexity.space}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Arrays */}
          {arrays.length > 0 && (
            <div className="space-y-4">
              {arrays.map(([name, val]) => (
                <ArrayRow
                  key={name}
                  name={name}
                  value={val}
                  active={active}
                  pointers={pointersByArray.get(name) ?? []}
                />
              ))}
            </div>
          )}

          {/* Trees */}
          {trees.map(([name, val]) => (
            <div key={name} className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                {name}
              </div>
              <div className="overflow-x-auto">
                <TreeView node={val as { [k: string]: JsonValue }} />
              </div>
            </div>
          ))}

          {/* Linked lists */}
          {linked.map(([name, val]) => (
            <div key={name} className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                {name}
              </div>
              <LinkedListView head={val as { [k: string]: JsonValue }} />
            </div>
          ))}

          {/* Scalars */}
          {scalars.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                Variable Watch
              </div>
              <LayoutGroup id="scalars">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {scalars.map(([k, v]) => (
                    <ScalarCard
                      key={k}
                      name={k}
                      value={v}
                      active={active.names.has(k)}
                      actionColor={actionColor}
                    />
                  ))}
                </div>
              </LayoutGroup>
            </div>
          )}

          {/* Floating tooltip */}
          {current && (
            <FloatingTooltip
              containerRef={canvasRef}
              targetKey={tooltipTarget}
              text={current.explanation}
              visible={!!tooltipTarget}
            />
          )}

          {/* Fallback explanation if no active target */}
          {current && !tooltipTarget && (
            <Card className="p-3 bg-primary/5 border-primary/30">
              <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">
                Line {current.line}
              </div>
              <div className="text-sm leading-relaxed">{current.explanation}</div>
            </Card>
          )}
        </div>

        {/* Controls */}
        {!traceError && (
          <div className="border-t border-border bg-card/50 p-3 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={stepBack}
              disabled={steps.length === 0 || idx <= 0}
              aria-label="Step backward"
            >
              <StepBack className="h-4 w-4" />
            </Button>
            {playing ? (
              <Button
                size="icon"
                onClick={() => setPlaying(false)}
                disabled={steps.length === 0}
                aria-label="Pause"
              >
                <Pause className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => {
                  if (idx >= steps.length - 1) setIdx(0);
                  setPlaying(true);
                }}
                disabled={steps.length === 0}
                aria-label="Play"
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={stepForward}
              disabled={steps.length === 0 || idx >= steps.length - 1}
              aria-label="Step forward"
            >
              <StepForward className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
