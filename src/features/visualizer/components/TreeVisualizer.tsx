import React, { useEffect, useRef, useState } from "react";
import {
  type JsonValue,
  type TreeData,
  formatPrimitive,
  isPlainObject,
} from "../types";

export function toTreeData(node: JsonValue): TreeData | null {
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

export function treeMaxDepth(n: TreeData | null): number {
  if (!n) return 0;
  return 1 + Math.max(treeMaxDepth(n.left), treeMaxDepth(n.right));
}

type NodeRefMap = Map<string, HTMLDivElement | null>;

export function TreeNodeView({
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

export function collectEdges(node: TreeData, path: string, out: { from: string; to: string }[] = []) {
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

export function TreeView({ node }: { node: { [k: string]: JsonValue } }) {
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

