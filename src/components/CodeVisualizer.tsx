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
import { Play, Pause, StepForward, StepBack, Sparkles, Loader2 } from "lucide-react";
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

// Fluid spring used everywhere
const SPRING = { type: "spring" as const, bounce: 0.5, duration: 0.6 };

// ---------- Action color palette ----------
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
const COLORS: Record<ColorKind, { bg: string; border: string; fg: string; glow: string }> = {
  compare:       { bg: "oklch(0.78 0.17 80)",  border: "oklch(0.68 0.2 75)",  fg: "oklch(0.2 0.05 80)",  glow: "oklch(0.78 0.17 80)" },
  swapError:     { bg: "oklch(0.65 0.22 25)",  border: "oklch(0.55 0.24 25)", fg: "oklch(0.98 0 0)",     glow: "oklch(0.65 0.22 25)" },
  successInsert: { bg: "oklch(0.72 0.19 145)", border: "oklch(0.6 0.21 145)", fg: "oklch(0.18 0.04 145)",glow: "oklch(0.72 0.19 145)" },
  readWrite:     { bg: "oklch(0.7 0.15 230)",  border: "oklch(0.6 0.18 230)", fg: "oklch(0.98 0 0)",     glow: "oklch(0.7 0.15 230)" },
  default:       { bg: "#FFFFFF",             border: "#D1D5DB",             fg: "#111827",              glow: "oklch(0.7 0.15 230)" },
};

// ---------- Pointer detection ----------
const POINTER_NAME_RE = /^(i|j|k|l|m|n|p|q|r|s|x|y|idx|index|pos|left|right|lo|hi|mid|start|end|ptr|cur|prev|slow|fast)$/i;
function isPointerName(name: string) {
  return POINTER_NAME_RE.test(name);
}
// Distinct neon colors for pointers, cycled by name
const POINTER_COLORS = [
  "#22d3ee", // cyan   -> i
  "#ec4899", // pink   -> j
  "#a3e635", // lime
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#f472b6", // rose
];
function pointerColor(name: string, allNames: string[]) {
  const idx = allNames.indexOf(name);
  return POINTER_COLORS[(idx >= 0 ? idx : 0) % POINTER_COLORS.length];
}

// ---------- Active variable parsing ----------
type ActiveSet = {
  names: Set<string>;
  indices: Map<string, Set<number>>;
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

type PointerInfo = { var: string; index: number; color: string };

// ---------- Animated array row with pointers underneath ----------
function ArrayRow({
  name,
  value,
  active,
  pointers,
}: {
  name: string;
  value: JsonValue[];
  active: ActiveSet;
  pointers: PointerInfo[];
}) {
  const activeIdx = active.indices.get(name) ?? new Set<number>();
  const nameActive = active.names.has(name) && activeIdx.size === 0;

  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
        {name}
      </div>
      <div className="relative pb-12">
        <LayoutGroup id={`arr-${name}`}>
          <motion.div layout className="flex gap-1.5 overflow-x-auto pb-1">
            {value.map((item, i) => {
              const isActive = activeIdx.has(i) || nameActive;
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
                    scale: isActive ? 1.1 : 1,
                    boxShadow: isActive
                      ? "0 0 15px var(--cell-active-glow), 0 0 30px color-mix(in oklab, var(--cell-active-glow) 40%, transparent)"
                      : "0 0 0 transparent",
                  }}
                  className="relative flex flex-col items-center justify-center rounded-md border-2 font-mono font-semibold text-sm min-w-12 h-12 px-2"
                  style={{ backgroundColor: COLORS.default.bg, borderColor: COLORS.default.border }}
                >
                  <span>{formatPrimitive(item)}</span>
                  <span className="absolute -bottom-4 text-[10px] font-mono text-muted-foreground">
                    {i}
                  </span>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Pointer track */}
          <LayoutGroup id={`ptrs-${name}`}>
            <div className="absolute left-0 right-0 top-full mt-4 h-8 pointer-events-none">
              <div className="relative flex gap-1.5">
                {value.map((_, i) => (
                  <div key={i} className="min-w-12 px-2 relative">
                    <AnimatePresence>
                      {pointers
                        .filter((p) => p.index === i)
                        .map((p, k) => (
                          <motion.div
                            key={p.var}
                            layoutId={`ptr-${name}-${p.var}`}
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={SPRING}
                            style={{
                              top: k * 18,
                              color: p.color,
                              textShadow: `0 0 8px ${p.color}, 0 0 16px ${p.color}`,
                              filter: `drop-shadow(0 0 6px ${p.color})`,
                            }}
                            className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center font-mono font-bold"
                          >
                            <span className="text-lg leading-none">↑</span>
                            <span className="text-[10px]">{p.var}</span>
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          </LayoutGroup>
        </LayoutGroup>
      </div>
    </div>
  );
}

// ---------- Holding cells (stored values like key / temp) ----------
function HoldingCells({
  cells,
  active,
  actionColor,
}: {
  cells: { name: string; value: JsonValue }[];
  active: ActiveSet;
  actionColor: { bg: string; border: string; fg: string; glow: string };
}) {
  if (cells.length === 0) return null;
  return (
    <div className="flex flex-wrap items-end gap-3">
      {cells.map(({ name, value }) => {
        const isActive = active.names.has(name);
        const isEmpty = value === null || value === undefined;
        const display = isEmpty ? "" : formatPrimitive(value);
        return (
          <div key={name} className="flex flex-col items-center gap-1">
            <span
              className="text-[10px] font-mono uppercase tracking-wider"
              style={{ color: isActive ? actionColor.glow : "var(--color-muted-foreground)" }}
            >
              {name}
            </span>
            <motion.div
              layout
              data-active-key={name}
              transition={SPRING}
              animate={{
                scale: isActive ? 1.1 : 1,
                backgroundColor: isActive
                  ? actionColor.bg
                  : isEmpty
                    ? "transparent"
                    : COLORS.default.bg,
                borderColor: isActive ? actionColor.border : COLORS.default.border,
                color: isActive ? actionColor.fg : COLORS.default.fg,
                boxShadow: isActive
                  ? `0 0 15px ${actionColor.glow}, 0 0 32px color-mix(in oklab, ${actionColor.glow} 50%, transparent)`
                  : "0 0 0 transparent",
              }}
              className={
                "flex items-center justify-center rounded-md font-mono font-semibold text-sm min-w-12 h-12 px-2 border-2 " +
                (isEmpty ? "border-dashed" : "")
              }
              style={{ borderStyle: isEmpty ? "dashed" : "solid" }}
            >
              {display || <span className="opacity-40 text-xs">empty</span>}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Linked List / Tree ----------
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

// ---------- Floating Tooltip (glassmorphism, anchored below) ----------
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
    const tipW = tipRef.current?.offsetWidth ?? 240;
    const tipH = tipRef.current?.offsetHeight ?? 50;
    // Anchor below the element + pointer track (~40px buffer)
    let x = eR.left - cR.left + eR.width / 2 - tipW / 2 + cont.scrollLeft;
    let y = eR.bottom - cR.top + 48 + cont.scrollTop;
    const maxX = cont.clientWidth - tipW - 8;
    if (x < 8) x = 8;
    if (x > maxX) x = Math.max(8, maxX);
    // If overflowing bottom, flip above
    if (y + tipH > cont.scrollTop + cont.clientHeight - 8) {
      y = eR.top - cR.top - tipH - 12 + cont.scrollTop;
    }
    setPos({ x, y });
  }, [visible, targetKey, text, containerRef]);

  return (
    <AnimatePresence>
      {visible && pos && (
        <motion.div
          ref={tipRef}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1, x: pos.x, y: pos.y }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={SPRING}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            maxWidth: 300,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            background: "color-mix(in oklab, black 55%, transparent)",
          }}
          className="z-20 pointer-events-none rounded-xl px-3.5 py-2 text-xs text-white shadow-2xl border border-white/15"
        >
          <div className="leading-snug">{text}</div>
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
  const actionColor = COLORS[actionKind(current?.actionType)];

  const canvasStyle = {
    ["--cell-active-bg" as string]: actionColor.bg,
    ["--cell-active-border" as string]: actionColor.border,
    ["--cell-active-fg" as string]: actionColor.fg,
    ["--cell-active-glow" as string]: actionColor.glow,
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
  const entries = Object.entries(variables);
  const arrays = entries.filter(([, v]) => Array.isArray(v)) as [string, JsonValue[]][];
  const trees = entries.filter(([, v]) => isTreeNode(v));
  const linked = entries.filter(([, v]) => !isTreeNode(v) && isLinkedNode(v));
  const scalars = entries.filter(
    ([, v]) => !Array.isArray(v) && !isLinkedNode(v) && !isTreeNode(v)
  );

  // Pointer scalars: name matches and value is a valid integer index of some array
  const pointerScalarNames = useMemo(() => {
    const names: string[] = [];
    for (const [sName, sVal] of scalars) {
      if (!isPointerName(sName)) continue;
      if (typeof sVal !== "number" || !Number.isInteger(sVal)) continue;
      names.push(sName);
    }
    return names;
  }, [scalars]);

  const pointersByArray = useMemo(() => {
    const map = new Map<string, PointerInfo[]>();
    for (const [aName, aVal] of arrays) {
      const len = aVal.length;
      const list: PointerInfo[] = [];
      for (const pName of pointerScalarNames) {
        const v = variables[pName];
        if (typeof v === "number" && v >= 0 && v < len) {
          list.push({ var: pName, index: v, color: pointerColor(pName, pointerScalarNames) });
        }
      }
      map.set(aName, list);
    }
    return map;
  }, [arrays, pointerScalarNames, variables]);

  // Scalars that are NOT pointers -> render as holding cells (if primitive) or scalar cards (if complex)
  const nonPointerScalars = scalars.filter(([n]) => !pointerScalarNames.includes(n));
  const holdingCells = nonPointerScalars
    .filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))
    .map(([name, value]) => ({ name, value }));

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
          className="relative flex-1 overflow-y-auto p-4 pt-6 space-y-6"
        >
          {/* Complexity badge */}
          {complexity && (
            <div
              className="absolute top-3 right-3 z-30 px-3 py-1.5 rounded-full text-[11px] font-mono font-medium text-white/90 border border-white/15 shadow-lg"
              style={{
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                background: "color-mix(in oklab, black 45%, transparent)",
              }}
            >
              Time: <span className="text-primary font-semibold">{complexity.time}</span>
              <span className="mx-1.5 opacity-40">|</span>
              Space: <span className="text-primary font-semibold">{complexity.space}</span>
            </div>
          )}

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

          {/* Holding cells floating above the array */}
          {holdingCells.length > 0 && (
            <HoldingCells cells={holdingCells} active={active} actionColor={actionColor} />
          )}

          {/* Arrays */}
          {arrays.length > 0 && (
            <div className="space-y-6">
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

          {/* Floating tooltip */}
          {current && (
            <FloatingTooltip
              containerRef={canvasRef}
              targetKey={tooltipTarget}
              text={current.explanation}
              visible={!!tooltipTarget}
            />
          )}

          {/* Fallback explanation when no active target */}
          {current && !tooltipTarget && (
            <div
              className="rounded-xl px-3.5 py-2 text-xs text-white/90 border border-white/15"
              style={{
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                background: "color-mix(in oklab, black 55%, transparent)",
              }}
            >
              <span className="text-primary font-semibold mr-2">Line {current.line}</span>
              {current.explanation}
            </div>
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
