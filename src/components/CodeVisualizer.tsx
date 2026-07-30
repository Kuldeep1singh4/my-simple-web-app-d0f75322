import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import {
  EditorView,
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  StateField,
  StateEffect,
  RangeSetBuilder,
  type Extension,
} from "@codemirror/state";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Play, Pause, StepForward, StepBack, Sparkles, Loader2, Terminal as TerminalIcon } from "lucide-react";

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
          Decoration.line({
            class: "cm-active-trace-line",
            attributes: { "data-active-trace-line": String(lineNum) },
          }).range(line.from),
        ]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Tags every visible line container with data-line-number so the active line
// can be located in the DOM and scrolled into view.
const lineNumberAttributes = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      builder.add(
        line.from,
        line.from,
        Decoration.line({ attributes: { "data-line-number": String(line.number) } }),
      );
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const lineTheme = EditorView.baseTheme({
  ".cm-active-trace-line": {
    backgroundColor: "rgba(34, 211, 238, 0.16)",
    boxShadow: "inset 4px 0 0 0 #22d3ee",
    transition: "background-color 200ms ease",
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

// Stronger spring just for swap/glide animations between array indices
const SWAP_SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

// Identity-tagged item used by ArrayRow (id is a stable UUID that follows
// the value across steps so Framer Motion can animate physical movement
// instead of re-mounting "ghost" boxes).
export type ArrayItem = { id: string; value: JsonValue };

// ---------- Animated array row with pointers underneath ----------
function ArrayRow({
  name,
  items,
  active,
  pointers,
  bounds,
}: {
  name: string;
  items: ArrayItem[];
  active: ActiveSet;
  pointers: PointerInfo[];
  bounds?: { low: number; high: number } | null;
}) {
  const activeIdx = active.indices.get(name) ?? new Set<number>();
  const nameActive = active.names.has(name) && activeIdx.size === 0;

  return (
    <div className="space-y-1 w-full" style={{ overflow: "visible" }}>
      <div className="text-xs uppercase tracking-wider font-mono" style={{ color: "#333" }}>
        {name}
      </div>
      <div
        className="relative w-full overflow-x-auto touch-pan-x no-scrollbar"
        style={{
          paddingBottom: "3rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <LayoutGroup id={`arr-${name}`}>
          <motion.div layout className="inline-flex gap-1.5" style={{ overflow: "visible" }}>
            {items.map((item, i) => {
              const isActive = activeIdx.has(i) || nameActive;
              // Strict bounds dimming: outside [low, high] => dim
              const inBounds =
                !bounds || !(i < bounds.low || i > bounds.high);
              return (
                <motion.div
                  key={item.id}
                  layout
                  data-active-key={`${name}[${i}]`}
                  transition={SWAP_SPRING}
                  animate={{
                    backgroundColor: isActive ? "var(--cell-active-bg)" : COLORS.default.bg,
                    color: isActive ? "var(--cell-active-fg)" : COLORS.default.fg,
                    opacity: inBounds ? 1 : 0.4,
                  }}
                  className="relative flex-shrink-0 flex flex-col items-center justify-center font-mono font-semibold text-sm min-w-12 h-12 px-2"
                  style={{
                    backgroundColor: COLORS.default.bg,
                    border: "1px solid #333",
                    borderRadius: 4,
                    boxShadow: "none",
                  }}
                >
                  <span>{formatPrimitive(item.value)}</span>
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

          {/* Pointer track — flex column stacks colliding pointers neatly */}
          <LayoutGroup id={`ptrs-${name}`}>
            <div
              className="absolute left-0 pointer-events-none"
              style={{ top: "100%", marginTop: "20px", overflow: "visible" }}
            >
              <div className="relative inline-flex gap-1.5 items-start">
                {items.map((it, i) => {
                  const here = pointers.filter((p) => p.index === i);
                  return (
                    <div
                      key={it.id}
                      className="min-w-12 flex-shrink-0 px-2 flex flex-col items-center"
                    >
                      <AnimatePresence>
                        {here.map((p) => (
                          <motion.div
                            key={p.var}
                            layoutId={`ptr-${name}-${p.var}`}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={SWAP_SPRING}
                            style={{ color: p.color }}
                            className="flex flex-col items-center font-mono font-bold leading-none"
                          >
                            <span className="text-lg leading-none">↑</span>
                            <span className="text-[10px]">{p.var}</span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  );
                })}
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
function hasValidValue(v: JsonValue): boolean {
  if (!isPlainObject(v)) return false;
  const valueKey =
    "value" in v ? "value" : Object.keys(v).find((k) => k !== "next");
  if (!valueKey) return false;
  const val = v[valueKey];
  return val !== null && val !== undefined && val !== "";
}

function collectListNodes(head: JsonValue): { value: JsonValue; raw: { [k: string]: JsonValue } }[] {
  const out: { value: JsonValue; raw: { [k: string]: JsonValue } }[] = [];
  let cur: JsonValue = head;
  let guard = 0;
  while (isLinkedNode(cur) && guard < 50) {
    // Skip allocated-but-empty node shapes
    if (!hasValidValue(cur)) {
      cur = cur.next;
      guard++;
      continue;
    }
    const valueKey =
      "value" in cur ? "value" : Object.keys(cur).find((k) => k !== "next") ?? "value";
    out.push({ value: cur[valueKey] as JsonValue, raw: cur });
    cur = cur.next;
    guard++;
  }
  return out;
}

function LinkedListView({
  head,
  pointers = [],
}: {
  head: { [k: string]: JsonValue };
  pointers?: { name: string; targetIndex: number | null }[];
}) {
  const nodes = collectListNodes(head);
  if (nodes.length === 0) {
    return (
      <span
        className="font-mono text-xs px-2 py-1"
        style={{ border: "1px dashed #999", color: "#555", borderRadius: 4, background: "#FAFAFA" }}
      >
        null
      </span>
    );
  }
  const NODE_W = 84; // approx width of [data|next] block
  const ARROW_W = 34;
  const SLOT_W = NODE_W + ARROW_W;

  // Group pointers by targetIndex
  const ptrsByIdx = new Map<number, string[]>();
  const nullPtrs: string[] = [];
  for (const p of pointers) {
    if (p.targetIndex == null) nullPtrs.push(p.name);
    else {
      if (!ptrsByIdx.has(p.targetIndex)) ptrsByIdx.set(p.targetIndex, []);
      ptrsByIdx.get(p.targetIndex)!.push(p.name);
    }
  }

  return (
    <div className="flex flex-col items-start" style={{ minHeight: 86 }}>
      {/* Pointer labels row */}
      <div className="relative" style={{ height: 28, width: nodes.length * SLOT_W }}>
        {nodes.map((_, i) => {
          const labels = ptrsByIdx.get(i);
          if (!labels || labels.length === 0) return null;
          return (
            <div
              key={i}
              className="absolute flex flex-col items-center font-mono"
              style={{ left: i * SLOT_W, width: NODE_W }}
            >
              <span className="text-[11px] font-semibold" style={{ color: "#1a1a1a" }}>
                {labels.join(", ")}
              </span>
              <span className="text-base leading-none" style={{ color: "#1a1a1a" }}>
                ↓
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center" style={{ gap: 0 }}>
        {nodes.map((n, i) => (
          <div key={i} className="flex items-center" style={{ width: SLOT_W }}>
            {/* Node: [ Data | Next ] */}
            <div
              className="flex font-mono text-sm"
              style={{
                border: "1px solid #333",
                borderRadius: 4,
                background: "#FFFFFF",
                color: "#111",
                overflow: "hidden",
                width: NODE_W,
              }}
            >
              <div
                className="px-3 py-1.5 font-semibold flex items-center justify-center flex-1"
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
            <svg width={ARROW_W} height="14" viewBox="0 0 34 14" style={{ display: "block" }} aria-hidden>
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
        {nullPtrs.length > 0 && (
          <span
            className="ml-3 font-mono text-[11px] font-semibold"
            style={{ color: "#1a1a1a" }}
          >
            {nullPtrs.join(", ")} → null
          </span>
        )}
      </div>
    </div>
  );
}


// ---------- Binary Tree (recursive flexbox + SVG line overlay) ----------
type TreeData = { label: string; left: TreeData | null; right: TreeData | null };

function toTreeData(node: JsonValue): TreeData | null {
  if (!isPlainObject(node)) return null;
  const valueKey =
    "value" in node ? "value" : Object.keys(node).find((k) => k !== "left" && k !== "right");
  const label = valueKey ? formatPrimitive(node[valueKey] as JsonValue) : "•";
  return {
    label,
    left: toTreeData((node.left as JsonValue) ?? null),
    right: toTreeData((node.right as JsonValue) ?? null),
  };
}

function treeMaxDepth(n: TreeData | null): number {
  if (!n) return 0;
  return 1 + Math.max(treeMaxDepth(n.left), treeMaxDepth(n.right));
}

type NodeRefMap = Map<string, HTMLDivElement | null>;

function TreeNodeView({
  node,
  path,
  depth,
  maxDepth,
  registerRef,
}: {
  node: TreeData;
  path: string;
  depth: number;
  maxDepth: number;
  registerRef: (path: string, el: HTMLDivElement | null) => void;
}) {
  // Tighter gaps deeper in the tree; wider near the top.
  const remainingLevels = Math.max(1, maxDepth - depth);
  const gapPx = Math.max(8, remainingLevels * 6);
  const hasChildren = node.left || node.right;

  return (
    <div className="flex flex-col items-center" style={{ flex: "0 0 auto" }}>
      <div
        ref={(el) => registerRef(path, el)}
        className="w-9 h-9 rounded-full border-2 border-foreground bg-background flex items-center justify-center font-mono text-xs font-semibold shadow-sm"
        style={{ position: "relative", zIndex: 1 }}
      >
        {node.label}
      </div>
      {hasChildren && (
        <div
          className="flex flex-row items-start justify-center"
          style={{ marginTop: 22, gap: `${gapPx}px` }}
        >
          {node.left ? (
            <TreeNodeView
              node={node.left}
              path={path + "L"}
              depth={depth + 1}
              maxDepth={maxDepth}
              registerRef={registerRef}
            />
          ) : (
            <div style={{ flex: "0 0 auto", width: 36 }} />
          )}
          {node.right ? (
            <TreeNodeView
              node={node.right}
              path={path + "R"}
              depth={depth + 1}
              maxDepth={maxDepth}
              registerRef={registerRef}
            />
          ) : (
            <div style={{ flex: "0 0 auto", width: 36 }} />
          )}
        </div>
      )}
    </div>
  );
}

function collectEdges(node: TreeData, path: string, out: { from: string; to: string }[] = []) {
  if (node.left) {
    out.push({ from: path, to: path + "L" });
    collectEdges(node.left, path + "L", out);
  }
  if (node.right) {
    out.push({ from: path, to: path + "R" });
    collectEdges(node.right, path + "R", out);
  }
  return out;
}

function TreeView({ node }: { node: { [k: string]: JsonValue } }) {
  const data = toTreeData(node as JsonValue);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<NodeRefMap>(new Map());
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);

  const registerRef = (path: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(path, el);
    else nodeRefs.current.delete(path);
  };

  useEffect(() => {
    if (!data || !innerRef.current || !containerRef.current) return;
    const measure = () => {
      const inner = innerRef.current;
      const container = containerRef.current;
      if (!inner || !container) return;

      const treeWidth = inner.scrollWidth;
      const treeHeight = inner.scrollHeight;
      const containerWidth = container.clientWidth;
      const nextScale =
        treeWidth > 0 ? Math.min(1, Math.max(0.2, (containerWidth - 40) / treeWidth)) : 1;
      setScale(nextScale);
      setSize({ w: treeWidth, h: treeHeight });

      const baseRect = inner.getBoundingClientRect();
      const edges = collectEdges(data, "");
      const next: { x1: number; y1: number; x2: number; y2: number }[] = [];
      const s = nextScale || 1;
      edges.forEach(({ from, to }) => {
        const a = nodeRefs.current.get(from);
        const b = nodeRefs.current.get(to);
        if (!a || !b) return;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        next.push({
          x1: (ar.left - baseRect.left + ar.width / 2) / s,
          y1: (ar.top - baseRect.top + ar.height / 2) / s,
          x2: (br.left - baseRect.left + br.width / 2) / s,
          y2: (br.top - baseRect.top + br.height / 2) / s,
        });
      });
      setLines(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(innerRef.current);
    ro.observe(containerRef.current);
    nodeRefs.current.forEach((el) => el && ro.observe(el));
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [data]);

  if (!data) return null;
  const maxDepth = treeMaxDepth(data);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex justify-center overflow-hidden"
      style={{ padding: 16 }}
    >
      <div
        ref={innerRef}
        className="inline-flex flex-col items-center relative origin-top"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          transition: "transform 0.3s ease",
        }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          width={size.w || "100%"}
          height={size.h || "100%"}
          style={{ zIndex: 0, overflow: "visible" }}
          aria-hidden
        >
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="currentColor"
              strokeWidth={1.5}
              opacity={0.7}
            />
          ))}
        </svg>
        <TreeNodeView
          node={data}
          path=""
          depth={0}
          maxDepth={maxDepth}
          registerRef={registerRef}
        />
      </div>
    </div>
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




// ---------- Graph (Force-Directed) ----------
type GraphNode = { id: string; val?: JsonValue };
type GraphEdge = { source: string; target: string; weight?: JsonValue };

const ADJ_KEYS = ["graphData", "graph", "adj", "adjList", "adjacencyList", "adjacency_list", "neighbors", "edges_map"];

function parseAdjacencyDict(
  dict: { [k: string]: JsonValue },
): { nodes: GraphNode[]; edges: GraphEdge[] } | null {
  // Every value must be an array of primitives OR an array of [neighbor, weight] pairs
  const ids = Object.keys(dict);
  if (ids.length === 0) return null;
  const nodeSet = new Set<string>(ids);
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const src of ids) {
    const val = dict[src];
    if (!Array.isArray(val)) return null;
    for (const item of val) {
      let tgt: string | null = null;
      let weight: JsonValue | undefined = undefined;
      if (typeof item === "string" || typeof item === "number") {
        tgt = String(item);
      } else if (Array.isArray(item) && item.length >= 1) {
        const t = item[0];
        if (typeof t === "string" || typeof t === "number") tgt = String(t);
        if (item.length >= 2) weight = item[1] as JsonValue;
      } else if (isPlainObject(item)) {
        const t = item.node ?? item.target ?? item.id ?? item.to;
        if (typeof t === "string" || typeof t === "number") tgt = String(t);
        weight = (item as { weight?: JsonValue }).weight;
      }
      if (tgt === null) return null;
      nodeSet.add(tgt);
      const key = src < tgt ? `${src}|${tgt}` : `${tgt}|${src}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: src, target: tgt, weight });
    }
  }
  return {
    nodes: Array.from(nodeSet).map((id) => ({ id })),
    edges,
  };
}

function parseGraph(vars: { [k: string]: JsonValue }): { nodes: GraphNode[]; edges: GraphEdge[] } | null {
  // 1. Top-level nodes + edges arrays, or nested under graphData
  let rawNodes = vars["nodes"];
  let rawEdges = vars["edges"];
  const gd = vars["graphData"];
  if ((!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) && isPlainObject(gd)) {
    if (Array.isArray(gd.nodes)) rawNodes = gd.nodes;
    if (Array.isArray(gd.edges)) rawEdges = gd.edges;
  }
  if (Array.isArray(rawNodes) && Array.isArray(rawEdges)) {
    const nodes: GraphNode[] = [];
    for (const n of rawNodes) {
      if (isPlainObject(n) && typeof n.id !== "undefined") {
        nodes.push({ id: String(n.id), val: (n as { val?: JsonValue }).val });
      } else if (typeof n === "string" || typeof n === "number") {
        nodes.push({ id: String(n) });
      }
    }
    const edges: GraphEdge[] = [];
    for (const e of rawEdges) {
      if (isPlainObject(e) && typeof e.source !== "undefined" && typeof e.target !== "undefined") {
        edges.push({
          source: String(e.source),
          target: String(e.target),
          weight: (e as { weight?: JsonValue }).weight,
        });
      }
    }
    if (nodes.length > 0) return { nodes, edges };
  }

  // 2. Adjacency-dict at known keys
  for (const key of ADJ_KEYS) {
    const v = vars[key];
    if (isPlainObject(v)) {
      const res = parseAdjacencyDict(v);
      if (res && res.nodes.length > 0) return res;
    }
  }

  // 3. Heuristic: any top-level object variable whose every value is an array
  for (const [, v] of Object.entries(vars)) {
    if (!isPlainObject(v)) continue;
    const keys = Object.keys(v);
    if (keys.length < 2) continue;
    if (keys.every((k) => Array.isArray((v as { [k: string]: JsonValue })[k]))) {
      const res = parseAdjacencyDict(v as { [k: string]: JsonValue });
      if (res && res.nodes.length > 0) return res;
    }
  }
  return null;
}

type PhysNode = { id: string; x: number; y: number; vx: number; vy: number };

function GraphVisualizer({
  nodes,
  edges,
  activeNode,
  visitedNodes,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  activeNode: string | null;
  visitedNodes: Set<string>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 400, h: 300 });
  const physRef = useRef<Map<string, PhysNode>>(new Map());
  const rafRef = useRef<number | null>(null);
  const [, forceRender] = useState(0);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(200, r.width), h: Math.max(200, r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the physics node set in sync with incoming nodes
  useEffect(() => {
    const map = physRef.current;
    const incoming = new Set(nodes.map((n) => n.id));
    const cx = size.w / 2;
    const cy = size.h / 2;
    const radius = Math.min(size.w, size.h) * 0.3;
    // Add missing
    let i = 0;
    for (const n of nodes) {
      if (!map.has(n.id)) {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        map.set(n.id, {
          id: n.id,
          x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
          y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
          vx: 0,
          vy: 0,
        });
      }
      i++;
    }
    // Remove stale
    for (const id of Array.from(map.keys())) {
      if (!incoming.has(id)) map.delete(id);
    }
  }, [nodes, size.w, size.h]);

  // Physics loop
  useEffect(() => {
    const map = physRef.current;
    const W = size.w;
    const H = size.h;
    if (W < 10 || H < 10) return;
    const k = Math.sqrt((W * H) / Math.max(1, nodes.length)) * 0.55; // ideal edge length

    const tick = () => {
      const arr = Array.from(map.values());
      const cx = W / 2;
      const cy = H / 2;
      // Repulsion
      for (let a = 0; a < arr.length; a++) {
        for (let b = a + 1; b < arr.length; b++) {
          const na = arr[a];
          const nb = arr[b];
          let dx = na.x - nb.x;
          let dy = na.y - nb.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.01) {
            dx = (Math.random() - 0.5) * 0.1;
            dy = (Math.random() - 0.5) * 0.1;
            dist = 0.1;
          }
          const force = (k * k) / dist;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          na.vx += fx;
          na.vy += fy;
          nb.vx -= fx;
          nb.vy -= fy;
        }
      }
      // Attraction along edges
      for (const e of edges) {
        const s = map.get(e.source);
        const t = map.get(e.target);
        if (!s || !t) continue;
        const dx = s.x - t.x;
        const dy = s.y - t.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (dist * dist) / k;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx -= fx;
        s.vy -= fy;
        t.vx += fx;
        t.vy += fy;
      }
      // Gravity to center
      for (const n of arr) {
        n.vx += (cx - n.x) * 0.01;
        n.vy += (cy - n.y) * 0.01;
      }
      // Integrate
      const damping = 0.82;
      let totalEnergy = 0;
      const pad = 28;
      for (const n of arr) {
        n.vx *= damping;
        n.vy *= damping;
        // clamp velocity
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        const maxSpeed = 30;
        if (speed > maxSpeed) {
          n.vx = (n.vx / speed) * maxSpeed;
          n.vy = (n.vy / speed) * maxSpeed;
        }
        n.x += n.vx * 0.1;
        n.y += n.vy * 0.1;
        // bounds
        if (n.x < pad) {
          n.x = pad;
          n.vx = 0;
        }
        if (n.x > W - pad) {
          n.x = W - pad;
          n.vx = 0;
        }
        if (n.y < pad) {
          n.y = pad;
          n.vy = 0;
        }
        if (n.y > H - pad) {
          n.y = H - pad;
          n.vy = 0;
        }
        totalEnergy += speed;
      }
      forceRender((v) => (v + 1) % 1000000);
      if (totalEnergy > 0.5) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [nodes, edges, size.w, size.h]);

  const map = physRef.current;
  const R = 18;

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: 240 }}>
      <svg width={size.w} height={size.h} style={{ display: "block" }} aria-hidden>
        <defs>
          <marker
            id="graph-arrow"
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

        {/* Edges */}
        {edges.map((e, i) => {
          const s = map.get(e.source);
          const t = map.get(e.target);
          if (!s || !t) return null;
          const mx = (s.x + t.x) / 2;
          const my = (s.y + t.y) / 2;
          return (
            <g key={`e-${i}-${e.source}-${e.target}`}>
              <line
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke="#333"
                strokeWidth={1.5}
                opacity={0.7}
              />
              {e.weight !== null && e.weight !== undefined && (
                <text
                  x={mx}
                  y={my - 4}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize={10}
                  fill="#555"
                  style={{ paintOrder: "stroke", stroke: "#F8F9FA", strokeWidth: 3 }}
                >
                  {formatPrimitive(e.weight as JsonValue)}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const p = map.get(n.id);
          if (!p) return null;
          const isActive = activeNode === n.id;
          const isVisited = visitedNodes.has(n.id);
          const fill = isActive ? "#FFF3B0" : isVisited ? "#C8E6C9" : "#FFFFFF";
          const stroke = isActive ? "#E6A100" : "#1a1a1a";
          const strokeW = isActive ? 3 : 1.5;
          const label =
            typeof n.val !== "undefined" && n.val !== null
              ? `${n.id}:${formatPrimitive(n.val)}`
              : n.id;
          return (
            <g key={`n-${n.id}`}>
              <circle cx={p.x} cy={p.y} r={R} fill={fill} stroke={stroke} strokeWidth={strokeW} />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                className="font-mono"
                fontSize={11}
                fontWeight={600}
                fill="#1a1a1a"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- Pedagogical 3-phase execution engine ----------
type Phase = "START" | "MIDDLE" | "END";

type ExecutionStep = {
  stepIndex: number;
  phase: Phase;
  line: number;
  speedMultiplier: number;
  title: string;
  detail: string;
  isFastForward: boolean;
};

// Base dwell time for a 1x step. MIDDLE steps divide this by their multiplier.
const BASE_STEP_DELAY = 2200;
// How many steps at each end get the slow, fully-narrated treatment.
const PHASE_EDGE = 3;

const ACTION_TITLES: Record<string, string> = {
  init: "Initialising",
  compare: "Comparing values",
  swap: "Swapping elements",
  insert: "Inserting value",
  read: "Reading value",
  write: "Writing value",
  success: "Condition met",
  error: "Error",
  return: "Returning",
  "fast-forward": "Fast-forwarding iterations",
};

function buildExecutionSteps(steps: TraceStep[]): ExecutionStep[] {
  const n = steps.length;
  return steps.map((s, i) => {
    const isFastForward = s.actionType === "fast-forward";
    let phase: Phase;
    if (i < PHASE_EDGE) phase = "START";
    else if (i >= n - PHASE_EDGE) phase = "END";
    else phase = "MIDDLE";

    // START teaches slowly, MIDDLE accelerates through the repetitive core,
    // END slows back down so the result lands.
    let speedMultiplier = 1;
    if (phase === "MIDDLE") speedMultiplier = isFastForward ? 3 : 2;
    if (phase === "START") speedMultiplier = 0.85;

    return {
      stepIndex: i,
      phase,
      line: s.line,
      speedMultiplier,
      title:
        (typeof s.actionType === "string" ? ACTION_TITLES[s.actionType] : undefined) ??
        (phase === "END" ? "Wrapping up" : "Executing"),
      detail: s.explanation,
      isFastForward,
    };
  });
}

const PHASE_LABELS: Record<Phase, string> = {
  START: "Setting the stage",
  MIDDLE: "Fast-forwarding iterations…",
  END: "Final result",
};

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
  const [leftTab, setLeftTab] = useState<"code" | "console">("code");
  const [unseenConsole, setUnseenConsole] = useState(false);
  // Bumped on every fresh run so the whole visualization subtree remounts
  // (kills stale Framer Motion layout state, SVG refs and physics loops).
  const [runId, setRunId] = useState(0);
  const terminalScrollRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorView | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trace = useServerFn(traceCode);

  const current = idx >= 0 && idx < steps.length ? steps[idx] : null;
  const active = useMemo(() => parseActive(current?.activeVariables), [current]);
  const actionColor = COLORS[actionKind(current?.actionType)];

  // 3-phase pedagogical timeline derived from the raw trace
  const execSteps = useMemo(() => buildExecutionSteps(steps), [steps]);
  const currentExec = idx >= 0 && idx < execSteps.length ? execSteps[idx] : null;

  const canvasStyle = {
    ["--cell-active-bg" as string]: actionColor.bg,
    ["--cell-active-border" as string]: actionColor.border,
    ["--cell-active-fg" as string]: actionColor.fg,
    ["--cell-active-glow" as string]: actionColor.glow,
  } as React.CSSProperties;

  // Highlight + auto-scroll the active line inside the editor
  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;
    if (!current) {
      view.dispatch({ effects: setActiveLine.of(null) });
      return;
    }
    const lineNum = Math.max(1, Math.min(current.line, view.state.doc.lines));
    const line = view.state.doc.line(lineNum);
    view.dispatch({
      effects: [
        setActiveLine.of(current.line),
        EditorView.scrollIntoView(line.from, { y: "center" }),
      ],
    });
  }, [current]);

  // Hard reset: wipe every trace-derived piece of state and remount the canvas.
  const resetVisualState = () => {
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    setPlaying(false);
    setIdx(-1);
    setSteps([]);
    setComplexity(null);
    setStructureType(null);
    setError(null);
    setTraceError(null);
    setUnseenConsole(false);
    arrayIdsRef.current = new Map();
    setRunId((r) => r + 1);
    editorRef.current?.dispatch({ effects: setActiveLine.of(null) });
  };

  // Editing the code or switching languages invalidates the current run.
  useEffect(() => {
    resetVisualState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, language]);

  // Autoplay: dwell time scales with the current step's phase speed multiplier.
  useEffect(() => {
    if (!playing) return;
    if (idx >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const mult = execSteps[idx]?.speedMultiplier ?? 1;
    const delay = Math.max(320, BASE_STEP_DELAY / mult);
    playTimerRef.current = setTimeout(
      () => setIdx((i) => Math.min(i + 1, steps.length - 1)),
      delay,
    );
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    };
  }, [playing, idx, steps.length, execSteps]);

  const handleVisualize = async () => {
    resetVisualState();
    setLoading(true);
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
  // Try to recover a graph from the variables regardless of structureType
  const parsedGraph = parseGraph(variables);
  // structureType acts as the routing hint. Fall back to value-shape detection.
  const forceList = structureType === "linked_list";
  const forceTree = structureType === "binary_tree";
  const forceArray = structureType === "array";
  const isGraph = structureType === "graph" || (parsedGraph !== null && parsedGraph.edges.length > 0);
  // Exclude graph-only keys so they don't render as standalone arrays beneath the graph
  const GRAPH_KEYS = new Set(["nodes", "edges", "activeNode", "visitedNodes", "graphData", "visited", "seen", "curr", "current"]);
  const arrays = entries.filter(
    ([n, v]) => Array.isArray(v) && !(isGraph && GRAPH_KEYS.has(n)),
  ) as [string, JsonValue[]][];
  const trees = forceList
    ? []
    : entries.filter(([, v]) => (forceTree ? isPlainObject(v) && !isLinkedNode(v) : isTreeNode(v)));

  // ----- Linked list partitioning -----
  // In linked_list mode, choose ONE canonical chain and turn all other
  // node-shaped variables (and null head-like vars) into floating pointer labels.
  type ListPtr = { name: string; targetIndex: number | null };
  let linkedRender: [string, JsonValue][] = [];
  let listPointers: ListPtr[] = [];
  const linkedPointerNames = new Set<string>();
  if (forceList) {
    const nodeLike = entries.filter(([, v]) => v === null || isPlainObject(v));
    const chains = nodeLike
      .filter(([, v]) => isLinkedNode(v))
      .map(([n, v]) => ({ name: n, val: v, len: collectListNodes(v).length }))
      .sort((a, b) => b.len - a.len);
    const preferred =
      chains.find((c) => /^(head|list|root|start)$/i.test(c.name)) ?? chains[0];
    if (preferred) {
      linkedRender = [[preferred.name, preferred.val]];
      const chainNodes = collectListNodes(preferred.val);
      const chainKeys = chainNodes.map((n) => JSON.stringify(n.raw));
      for (const [n, v] of nodeLike) {
        if (n === preferred.name) continue;
        linkedPointerNames.add(n);
        if (v === null) listPointers.push({ name: n, targetIndex: null });
        else {
          const key = JSON.stringify(v);
          const i = chainKeys.indexOf(key);
          listPointers.push({ name: n, targetIndex: i >= 0 ? i : null });
        }
      }
    }
  } else {
    linkedRender = forceTree
      ? []
      : entries.filter(([, v]) => !isTreeNode(v) && isLinkedNode(v));
  }

  const scalars = entries.filter(
    ([n, v]) =>
      !Array.isArray(v) &&
      !linkedRender.some(([ln]) => ln === n) &&
      !trees.some(([tn]) => tn === n) &&
      !linkedPointerNames.has(n),
  );
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

  // Bounds detection: low/high, left/right, start/end pairs that scope a sub-array
  const boundsByArray = useMemo(() => {
    const pairs: Array<[string, string]> = [
      ["low", "high"],
      ["left", "right"],
      ["start", "end"],
      ["lo", "hi"],
      ["l", "r"],
    ];
    const map = new Map<string, { low: number; high: number }>();
    let detected: { low: number; high: number } | null = null;
    for (const [a, b] of pairs) {
      const av = variables[a];
      const bv = variables[b];
      if (
        typeof av === "number" &&
        typeof bv === "number" &&
        Number.isInteger(av) &&
        Number.isInteger(bv) &&
        av <= bv
      ) {
        detected = { low: av, high: bv };
        break;
      }
    }
    if (detected) {
      for (const [aName, aVal] of arrays) {
        if (detected.low >= 0 && detected.high < aVal.length) {
          map.set(aName, detected);
        }
      }
    }
    return map;
  }, [arrays, variables]);

  // ----- Stable identity tracking for array elements -----
  // Each value gets a persistent UUID that follows it across steps so
  // Framer Motion can animate physical swaps/shifts instead of re-mounting.
  const arrayIdsRef = useRef<Map<string, ArrayItem[]>>(new Map());
  // Reset identities whenever a fresh trace begins.
  useEffect(() => {
    arrayIdsRef.current = new Map();
  }, [steps]);

  const arrayItemsByName = useMemo(() => {
    const result = new Map<string, ArrayItem[]>();
    const prevAll = arrayIdsRef.current;
    for (const [name, values] of arrays) {
      const prev = prevAll.get(name) ?? [];
      const usedPrev = new Set<number>();
      const next: ArrayItem[] = new Array(values.length);
      const valKey = (v: JsonValue) => JSON.stringify(v);
      // Pass 1: same-index same-value preference (no movement)
      for (let i = 0; i < values.length; i++) {
        if (prev[i] && valKey(prev[i].value) === valKey(values[i])) {
          usedPrev.add(i);
          next[i] = { id: prev[i].id, value: values[i] };
        }
      }
      // Pass 2: match remaining slots to any unused previous item with same value
      for (let i = 0; i < values.length; i++) {
        if (next[i]) continue;
        const v = values[i];
        let found = -1;
        for (let j = 0; j < prev.length; j++) {
          if (usedPrev.has(j)) continue;
          if (valKey(prev[j].value) === valKey(v)) {
            found = j;
            break;
          }
        }
        if (found >= 0) {
          usedPrev.add(found);
          next[i] = { id: prev[found].id, value: v };
        }
      }
      // Pass 3: mint fresh UUIDs for anything left
      for (let i = 0; i < values.length; i++) {
        if (next[i]) continue;
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `id-${name}-${i}-${Math.random().toString(36).slice(2)}`;
        next[i] = { id, value: values[i] };
      }
      result.set(name, next);
    }
    arrayIdsRef.current = result;
    return result;
  }, [arrays]);


  // Scalars that are NOT pointers -> render as holding cells (if primitive) or scalar cards (if complex)
  const nonPointerScalars = scalars.filter(([n]) => !pointerScalarNames.includes(n));
  const holdingCells = nonPointerScalars
    .filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))
    .map(([name, value]) => ({ name, value }));


  // Accumulated stdout up to and including the current step
  const consoleText = useMemo(() => {
    if (steps.length === 0 || idx < 0) return "";
    let out = "";
    for (let i = 0; i <= idx && i < steps.length; i++) {
      const c = steps[i]?.consoleOutput;
      if (typeof c === "string" && c.length > 0) out += c;
    }
    return out;
  }, [steps, idx]);

  useEffect(() => {
    const el = terminalScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [consoleText]);

  // Track unseen console output (only when user is on the Code tab)
  useEffect(() => {
    if (!consoleText) return;
    if (leftTab === "console") {
      setUnseenConsole(false);
    } else {
      setUnseenConsole(true);
    }
  }, [consoleText, leftTab]);

  useEffect(() => {
    if (leftTab === "console") setUnseenConsole(false);
  }, [leftTab]);






  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-[100vw] overflow-hidden bg-background text-foreground">
      {/* ===== Editor / Console (Mobile: top 35% / Desktop: left 50%, full height) ===== */}
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

        {/* ===== Tab toggle: Code | Console ===== */}
        <div className="flex items-stretch border-b border-border bg-card/40 shrink-0">
          <button
            type="button"
            onClick={() => setLeftTab("code")}
            className={`px-3 h-8 text-xs font-mono uppercase tracking-wider border-r border-border transition-colors ${
              leftTab === "code"
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => setLeftTab("console")}
            className={`relative px-3 h-8 text-xs font-mono uppercase tracking-wider border-r border-border transition-colors flex items-center gap-1.5 ${
              leftTab === "console"
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TerminalIcon className="h-3 w-3" />
            Console
            {unseenConsole && leftTab !== "console" && (
              <span
                className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "#ef4444" }}
                aria-label="New output"
              />
            )}
          </button>
        </div>

        {/* ===== Tab body — same container, swap content ===== */}
        <div className="flex-1 min-h-0 relative">
          <div
            className={`absolute inset-0 overflow-y-auto bg-[#1e1e2e] ${
              leftTab === "code" ? "block" : "hidden"
            }`}
          >
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
          <div
            ref={terminalScrollRef}
            className={`absolute inset-0 overflow-y-auto px-3 py-2 ${
              leftTab === "console" ? "block" : "hidden"
            }`}
            style={{
              background: "#1E1E1E",
              fontFamily: '"Fira Code", "Courier New", ui-monospace, monospace',
              fontSize: "12px",
              lineHeight: 1.5,
              color: "#D4D4D4",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {consoleText ? (
              <>
                {consoleText}
                <span className="inline-block w-2 h-3.5 align-text-bottom bg-gray-300 ml-0.5 animate-pulse" />
              </>
            ) : (
              <span style={{ color: "#6A6A6A" }}>
                &gt; Program output will appear here…
              </span>
            )}
          </div>
        </div>
      </div>



      {/* ===== Right column: Canvas + Controls ===== */}
      <div className="flex flex-col w-full md:w-1/2 h-[65%] md:h-full min-h-0">
        {/* Canvas: grows to fill freed vertical space */}
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

            {/* Primitives — Memory Board */}
            {structureType === "primitives" ? (
              <MemoryBoard
                vars={scalars.map(([name, value]) => ({ name, value }))}
                active={active}
                actionColor={actionColor}
              />
            ) : isGraph ? (
              (() => {
                const g = parsedGraph ?? parseGraph(variables);
                if (!g) {
                  return (
                    <div className="text-center text-gray-500 text-sm">
                      Waiting for graph data…
                    </div>
                  );
                }
                const gdObj = isPlainObject(variables["graphData"])
                  ? (variables["graphData"] as { [k: string]: JsonValue })
                  : null;
                const ACTIVE_KEYS = ["activeNode", "curr", "current", "currentNode", "u", "node"];
                const VISITED_KEYS = ["visitedNodes", "visited", "seen"];
                let an: JsonValue | undefined = undefined;
                for (const k of ACTIVE_KEYS) {
                  const v = variables[k] ?? (gdObj ? gdObj[k] : undefined);
                  if (typeof v === "string" || typeof v === "number") { an = v; break; }
                }
                let vn: JsonValue | undefined = undefined;
                for (const k of VISITED_KEYS) {
                  const v = variables[k] ?? (gdObj ? gdObj[k] : undefined);
                  if (Array.isArray(v)) { vn = v; break; }
                }
                const activeNode =
                  typeof an === "string" || typeof an === "number" ? String(an) : null;
                const visited = new Set<string>(
                  Array.isArray(vn)
                    ? vn
                        .filter((x) => typeof x === "string" || typeof x === "number")
                        .map((x) => String(x))
                    : [],
                );
                return (
                  <div className="w-full h-full flex-1 min-h-0" style={{ minHeight: 280 }}>
                    <GraphVisualizer
                      nodes={g.nodes}
                      edges={g.edges}
                      activeNode={activeNode}
                      visitedNodes={visited}
                    />
                  </div>
                );
              })()
            ) : (
              <>
                {/* Holding cells */}
                {holdingCells.length > 0 && (
                  <HoldingCells cells={holdingCells} active={active} actionColor={actionColor} />
                )}

                {/* Arrays */}
                {arrays.length > 0 && (
                  <div
                    className="flex flex-col items-center gap-6 w-full"
                    style={{ maxWidth: "min(100%, 90vw)" }}
                  >
                    {arrays.map(([name]) => (
                      <ArrayRow
                        key={name}
                        name={name}
                        items={arrayItemsByName.get(name) ?? []}
                        active={active}
                        pointers={pointersByArray.get(name) ?? []}
                        bounds={boundsByArray.get(name) ?? null}
                      />
                    ))}
                  </div>
                )}

                {/* Trees */}
                {trees.map(([name, val]) => (
                  <div key={name} className="flex flex-col items-center gap-1 flex-1 min-h-0 w-full">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">
                      {name}
                    </div>
                    <div className="flex-1 min-h-0 w-full" style={{ minHeight: 200 }}>
                      <TreeView node={val as { [k: string]: JsonValue }} />
                    </div>
                  </div>
                ))}

                {/* Linked lists */}
                {linkedRender.map(([name, val]) => (
                  <div key={name} className="flex flex-col items-center gap-1">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">
                      {name}
                    </div>
                    <LinkedListView
                      head={val as { [k: string]: JsonValue }}
                      pointers={forceList ? listPointers : []}
                    />
                  </div>
                ))}

              </>
            )}
          </div>

          {/* Pinned subtitle bar — stationary at bottom of visualization stage */}
          {current && (
            <div
              className="absolute left-0 right-0 bottom-0 z-20 px-3 py-2 border-t border-gray-200 bg-white/95 backdrop-blur-sm"
              style={{ pointerEvents: "none" }}
            >
              <div className="text-xs md:text-sm text-gray-800 text-center leading-snug line-clamp-2">
                <span className="font-mono font-semibold text-gray-500 mr-2">
                  Line {current.line}
                </span>
                {current.explanation}
              </div>
            </div>
          )}
        </div>


        {/* ===== Control Center (compressed, hugs bottom edge) ===== */}
        <div
          className="shrink-0 border-t border-border bg-card/80 backdrop-blur flex items-center justify-center px-2 pt-1"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
        >
          {/* Buttons */}
          <div className="flex items-center justify-center gap-2">


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
