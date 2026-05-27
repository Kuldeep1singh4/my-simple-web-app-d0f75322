import { useEffect, useMemo, useRef, useState } from "react";
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
import { traceCode, type TraceStep, type JsonValue, type Complexity, type StructureType } from "@/lib/trace.functions";

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
  // Flat pastels — no neon, no glow
  compare:       { bg: "#FFF3B0", border: "#333333", fg: "#1a1a1a", glow: "transparent" }, // pastel yellow
  swapError:     { bg: "#FFCDD2", border: "#333333", fg: "#1a1a1a", glow: "transparent" }, // pastel red
  successInsert: { bg: "#C8E6C9", border: "#333333", fg: "#1a1a1a", glow: "transparent" }, // mint green
  readWrite:     { bg: "#BBDEFB", border: "#333333", fg: "#1a1a1a", glow: "transparent" }, // pastel blue
  default:       { bg: "#FFFFFF", border: "#333333", fg: "#1a1a1a", glow: "transparent" },
};

// ---------- Pointer detection ----------
const POINTER_NAME_RE = /^(i|j|k|l|m|n|p|q|r|s|x|y|idx|index|pos|left|right|lo|hi|mid|start|end|ptr|cur|prev|slow|fast)$/i;
function isPointerName(name: string) {
  return POINTER_NAME_RE.test(name);
}
// Flat dark colors for pointers — no neon
const POINTER_COLORS = ["#1a1a1a", "#444444", "#2d3748", "#4a5568", "#555555", "#222222"];
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
    <div className="space-y-1" style={{ overflow: "visible" }}>
      <div className="text-xs uppercase tracking-wider font-mono" style={{ color: "#333" }}>
        {name}
      </div>
      <div className="relative" style={{ overflow: "visible", paddingBottom: "3rem" }}>
        <LayoutGroup id={`arr-${name}`}>
          <motion.div layout className="flex gap-1.5" style={{ overflow: "visible" }}>
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
                    color: isActive ? "var(--cell-active-fg)" : COLORS.default.fg,
                  }}
                  className="relative flex flex-col items-center justify-center font-mono font-semibold text-sm min-w-12 h-12 px-2"
                  style={{
                    backgroundColor: COLORS.default.bg,
                    border: "1px solid #333",
                    borderRadius: 4,
                    boxShadow: "none",
                  }}
                >
                  <span>{formatPrimitive(item)}</span>
                  <span
                    className="absolute text-[10px] font-mono"
                    style={{ bottom: "-18px", color: "#555" }}
                  >
                    {i}
                  </span>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Pointer track */}
          <LayoutGroup id={`ptrs-${name}`}>
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{ top: "100%", marginTop: "20px", height: "32px", overflow: "visible" }}
            >
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
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={SPRING}
                            style={{ top: k * 18, color: p.color }}
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
              style={{ color: "#333" }}
            >
              {name}
            </span>
            <motion.div
              layout
              data-active-key={name}
              transition={SPRING}
              animate={{
                backgroundColor: isActive
                  ? actionColor.bg
                  : isEmpty
                    ? "transparent"
                    : COLORS.default.bg,
                color: isActive ? actionColor.fg : COLORS.default.fg,
              }}
              className="flex items-center justify-center font-mono font-semibold text-sm min-w-12 h-12 px-2"
              style={{
                border: "1px solid #333",
                borderStyle: isEmpty ? "dashed" : "solid",
                borderRadius: 4,
                boxShadow: "none",
              }}
            >
              {display || <span className="opacity-40 text-xs">empty</span>}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Linked List (flat Python-Tutor style) ----------
function collectListNodes(head: JsonValue): { value: JsonValue; raw: { [k: string]: JsonValue } }[] {
  const out: { value: JsonValue; raw: { [k: string]: JsonValue } }[] = [];
  let cur: JsonValue = head;
  let guard = 0;
  while (isLinkedNode(cur) && guard < 50) {
    const valueKey =
      "value" in cur ? "value" : Object.keys(cur).find((k) => k !== "next") ?? "value";
    out.push({ value: cur[valueKey] as JsonValue, raw: cur });
    cur = cur.next;
    guard++;
  }
  return out;
}

function LinkedListView({ head }: { head: { [k: string]: JsonValue } }) {
  const nodes = collectListNodes(head);
  return (
    <div className="flex items-center" style={{ gap: 0 }}>
      {nodes.map((n, i) => (
        <div key={i} className="flex items-center">
          {/* Node: [ Data | Next ] */}
          <div
            className="flex font-mono text-sm"
            style={{
              border: "1px solid #333",
              borderRadius: 4,
              background: "#FFFFFF",
              color: "#111",
              overflow: "hidden",
            }}
          >
            <div
              className="px-3 py-1.5 font-semibold flex items-center justify-center min-w-10"
              style={{ borderRight: "1px solid #333" }}
            >
              {formatPrimitive(n.value)}
            </div>
            <div
              className="px-2 py-1.5 text-[10px] uppercase tracking-wider flex items-center"
              style={{ background: "#F1F3F5", color: "#555" }}
            >
              next
            </div>
          </div>
          {/* Arrow */}
          <svg
            width="34"
            height="14"
            viewBox="0 0 34 14"
            style={{ display: "block" }}
            aria-hidden
          >
            <defs>
              <marker
                id={`ll-arrow-${i}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#333" />
              </marker>
            </defs>
            <line
              x1="0"
              y1="7"
              x2="28"
              y2="7"
              stroke="#333"
              strokeWidth="1.5"
              markerEnd={`url(#ll-arrow-${i})`}
            />
          </svg>
        </div>
      ))}
      <span
        className="font-mono text-xs px-2 py-1"
        style={{ border: "1px dashed #999", color: "#555", borderRadius: 4, background: "#FAFAFA" }}
      >
        null
      </span>
    </div>
  );
}

// ---------- Binary Tree (strict level-balanced layout) ----------
type LayoutTreeNode = {
  x: number;
  y: number;
  label: string;
  children: LayoutTreeNode[];
};

const TREE_NODE_R = 18;
const TREE_LEVEL_H = 70;
const TREE_LEAF_W = 56;

function layoutTree(
  node: JsonValue,
  depth: number,
  cursor: { x: number },
): LayoutTreeNode | null {
  if (!isPlainObject(node)) return null;
  const valueKey =
    "value" in node ? "value" : Object.keys(node).find((k) => k !== "left" && k !== "right");
  const label = valueKey ? formatPrimitive(node[valueKey] as JsonValue) : "•";

  const left = layoutTree((node.left as JsonValue) ?? null, depth + 1, cursor);
  // y is purely a function of depth -> strict horizontal baselines per level
  const y = depth * TREE_LEVEL_H + TREE_NODE_R + 8;

  let x: number;
  const children: LayoutTreeNode[] = [];
  if (left) children.push(left);

  const right = layoutTree((node.right as JsonValue) ?? null, depth + 1, cursor);
  if (right) children.push(right);

  if (left && right) {
    x = (left.x + right.x) / 2;
  } else if (left) {
    x = left.x + TREE_LEAF_W / 2;
  } else if (right) {
    x = right.x - TREE_LEAF_W / 2;
  } else {
    x = cursor.x + TREE_LEAF_W / 2;
    cursor.x += TREE_LEAF_W;
  }

  return { x, y, label, children };
}

function flatten(n: LayoutTreeNode, out: LayoutTreeNode[] = []) {
  out.push(n);
  n.children.forEach((c) => flatten(c, out));
  return out;
}

function TreeView({ node }: { node: { [k: string]: JsonValue } }) {
  const layout = layoutTree(node, 0, { x: 0 });
  if (!layout) return null;
  const all = flatten(layout);
  const minX = Math.min(...all.map((n) => n.x));
  // normalize so leftmost node sits at padding
  const PAD = TREE_NODE_R + 8;
  const dx = PAD - minX;
  all.forEach((n) => (n.x += dx));
  const width = Math.max(...all.map((n) => n.x)) + TREE_NODE_R + 8;
  const height = Math.max(...all.map((n) => n.y)) + TREE_NODE_R + 8;

  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const walk = (n: LayoutTreeNode) => {
    n.children.forEach((c) => {
      edges.push({ x1: n.x, y1: n.y, x2: c.x, y2: c.y });
      walk(c);
    });
  };
  walk(layout);

  return (
    <svg width={width} height={height} style={{ display: "block" }} aria-hidden>
      {edges.map((e, i) => (
        <line
          key={i}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke="#333"
          strokeWidth="1.25"
        />
      ))}
      {all.map((n, i) => (
        <g key={i}>
          <circle
            cx={n.x}
            cy={n.y}
            r={TREE_NODE_R}
            fill="#FFFFFF"
            stroke="#333"
            strokeWidth="1.25"
          />
          <text
            x={n.x}
            y={n.y + 4}
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
            fontSize="12"
            fontWeight="600"
            fill="#111"
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------- Memory Board (primitives view) ----------
function MemoryBoard({
  vars,
  active,
  actionColor,
}: {
  vars: { name: string; value: JsonValue }[];
  active: ActiveSet;
  actionColor: { bg: string; border: string; fg: string; glow: string };
}) {
  if (vars.length === 0) return null;
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(110px, max-content))`,
        justifyContent: "center",
      }}
    >
      {vars.map(({ name, value }) => {
        const isActive = active.names.has(name);
        const display = value === null || value === undefined ? "—" : formatPrimitive(value);
        return (
          <motion.div
            key={name}
            layout
            transition={SPRING}
            animate={{
              backgroundColor: isActive ? actionColor.bg : "#FFFFFF",
              color: isActive ? actionColor.fg : "#111",
            }}
            className="flex flex-col items-center justify-center px-4 py-3 min-w-[110px]"
            style={{
              border: "1px solid #333",
              borderRadius: 6,
              boxShadow: "none",
            }}
          >
            <span
              className="text-[10px] font-mono uppercase tracking-wider mb-1"
              style={{ color: "#555" }}
            >
              {name}
            </span>
            <span className="font-mono font-semibold text-lg leading-tight">{display}</span>
          </motion.div>
        );
      })}
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
  const [structureType, setStructureType] = useState<StructureType | null>(null);
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
    setStructureType(null);
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
        setStructureType(res.structureType);
      } else {
        setSteps(res.steps);
        setComplexity(res.complexity);
        setStructureType(res.structureType);
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
  // structureType acts as the routing hint. Fall back to value-shape detection.
  const forceList = structureType === "linked_list";
  const forceTree = structureType === "binary_tree";
  const forceArray = structureType === "array";
  const arrays = entries.filter(([, v]) => Array.isArray(v)) as [string, JsonValue[]][];
  const trees = forceList
    ? []
    : entries.filter(([, v]) => (forceTree ? isPlainObject(v) && !isLinkedNode(v) : isTreeNode(v)));
  const linked = forceTree
    ? []
    : entries.filter(([, v]) =>
        forceList ? isPlainObject(v) : !isTreeNode(v) && isLinkedNode(v),
      );
  const scalars = entries.filter(
    ([n, v]) =>
      !Array.isArray(v) &&
      !linked.some(([ln]) => ln === n) &&
      !trees.some(([tn]) => tn === n),
  );
  // Mark forceArray to satisfy linter and reserve future use
  void forceArray;

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
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* ===== Editor (Mobile: top 35% / Desktop: left 50%, full height) ===== */}
      <div className="flex flex-col w-full md:w-1/2 h-[35%] md:h-full border-b md:border-b-0 md:border-r border-border min-h-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50 gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <h1 className="font-semibold truncate text-sm">Code Visualizer</h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Language">
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
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#1e1e2e]">
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

      {/* ===== Right column: Canvas + Controls ===== */}
      <div className="flex flex-col w-full md:w-1/2 h-[65%] md:h-full min-h-0">
        {/* Canvas: Mobile 50/(50+15)=~76.9% of right col; Desktop 85% */}
        <div
          ref={canvasRef}
          style={canvasStyle}
          className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center p-3 md:p-6"
        >
          {/* Whiteboard background */}
          <div className="absolute inset-0 bg-[#F8F9FA]" aria-hidden />

          {/* Complexity badge */}
          {complexity && (
            <div
              className="absolute top-2 right-2 z-30 px-2.5 py-1 rounded-full text-[10px] md:text-[11px] font-mono font-medium text-white/95 border border-white/15 shadow-lg"
              style={{
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                background: "color-mix(in oklab, black 55%, transparent)",
              }}
            >
              Time: <span className="text-cyan-300 font-semibold">{complexity.time}</span>
              <span className="mx-1.5 opacity-40">|</span>
              Space: <span className="text-cyan-300 font-semibold">{complexity.space}</span>
            </div>
          )}

          {/* Step counter */}
          {steps.length > 0 && (
            <div className="absolute top-2 left-2 z-30 px-2.5 py-1 rounded-full text-[10px] md:text-[11px] font-mono text-gray-700 bg-white/80 border border-gray-200 shadow-sm">
              Step {idx + 1} / {steps.length}
            </div>
          )}

          {/* Centered stage content */}
          <div
            className="relative z-10 flex flex-col items-center justify-center gap-4 w-full max-h-full"
            style={{
              fontSize: "clamp(0.7rem, 1.6vmin, 1rem)",
              overflow: "visible",
            }}
          >
            {error && (
              <Card className="p-3 border-destructive/40 bg-destructive/10 text-destructive text-sm max-w-md">
                {error}
              </Card>
            )}

            {traceError && (
              <Card className="p-4 border-2 border-destructive bg-destructive/10 max-w-md">
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
              <div className="text-center text-gray-500 text-sm max-w-xs">
                Write some code and click{" "}
                <span className="text-gray-900 font-medium">Visualize</span> to trace its
                execution step by step.
              </div>
            )}

            {/* Holding cells */}
            {holdingCells.length > 0 && (
              <HoldingCells cells={holdingCells} active={active} actionColor={actionColor} />
            )}

            {/* Arrays */}
            {arrays.length > 0 && (
              <div
                className="flex flex-col items-center gap-6"
                style={{ maxWidth: "min(100%, 90vw)" }}
              >
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
              <div key={name} className="flex flex-col items-center gap-1">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">
                  {name}
                </div>
                <TreeView node={val as { [k: string]: JsonValue }} />
              </div>
            ))}

            {/* Linked lists */}
            {linked.map(([name, val]) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">
                  {name}
                </div>
                <LinkedListView head={val as { [k: string]: JsonValue }} />
              </div>
            ))}
          </div>

          {/* Floating tooltip overlay (positioned absolutely within canvas) */}
          {current && (
            <FloatingTooltip
              containerRef={canvasRef}
              targetKey={tooltipTarget}
              text={current.explanation}
              visible={!!tooltipTarget}
            />
          )}
        </div>

        {/* ===== Control Center (pinned, ~15% height) ===== */}
        <div className="h-[15vh] md:h-[15%] min-h-[88px] shrink-0 border-t border-border bg-card/80 backdrop-blur flex flex-col">
          {/* Subtitle / explanation */}
          <div className="flex-1 min-h-0 px-3 py-1.5 flex items-center justify-center overflow-hidden">
            {traceError ? (
              <div className="text-xs text-destructive font-mono text-center line-clamp-2">
                {traceError}
              </div>
            ) : current ? (
              <div className="text-xs md:text-sm text-foreground/90 text-center line-clamp-2 leading-snug">
                <span className="text-primary font-semibold mr-1.5">Line {current.line}</span>
                {current.explanation}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                Controls
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-center gap-2 pb-2 px-3">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={stepBack}
              disabled={steps.length === 0 || idx <= 0}
              aria-label="Step backward"
            >
              <StepBack className="h-4 w-4" />
            </Button>
            {playing ? (
              <Button
                size="icon"
                className="h-9 w-9"
                onClick={() => setPlaying(false)}
                disabled={steps.length === 0}
                aria-label="Pause"
              >
                <Pause className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-9 w-9"
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
              className="h-9 w-9"
              onClick={stepForward}
              disabled={steps.length === 0 || idx >= steps.length - 1}
              aria-label="Step forward"
            >
              <StepForward className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
