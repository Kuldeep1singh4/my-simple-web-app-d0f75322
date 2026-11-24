import React, { useEffect, useRef, useState } from "react";
import {
  type JsonValue,
  type GraphNode,
  type GraphEdge,
  formatPrimitive,
  isPlainObject,
} from "../types";

export const ADJ_KEYS = [
  "graphData",
  "graph",
  "adj",
  "adjList",
  "adjacencyList",
  "adjacency_list",
  "neighbors",
  "edges_map",
];

export function parseAdjacencyDict(
  dict: { [k: string]: JsonValue },
): { nodes: GraphNode[]; edges: GraphEdge[] } | null {
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

export function parseGraph(vars: { [k: string]: JsonValue }): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} | null {
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

  for (const key of ADJ_KEYS) {
    const v = vars[key];
    if (isPlainObject(v)) {
      const res = parseAdjacencyDict(v);
      if (res && res.nodes.length > 0) return res;
    }
  }

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

export function GraphVisualizer({
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

  useEffect(() => {
    const map = physRef.current;
    const incoming = new Set(nodes.map((n) => n.id));
    const cx = size.w / 2;
    const cy = size.h / 2;
    const radius = Math.min(size.w, size.h) * 0.3;
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
    for (const id of Array.from(map.keys())) {
      if (!incoming.has(id)) map.delete(id);
    }
  }, [nodes, size.w, size.h]);

  useEffect(() => {
    const map = physRef.current;
    const W = size.w;
    const H = size.h;
    if (W < 10 || H < 10) return;
    const k = Math.sqrt((W * H) / Math.max(1, nodes.length)) * 0.55;

    const tick = () => {
      const arr = Array.from(map.values());
      const cx = W / 2;
      const cy = H / 2;
      // Repulsion (Coulomb)
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
      // Attraction along edges (Hooke)
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
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        const maxSpeed = 30;
        if (speed > maxSpeed) {
          n.vx = (n.vx / speed) * maxSpeed;
          n.vy = (n.vy / speed) * maxSpeed;
        }
        n.x += n.vx * 0.1;
        n.y += n.vy * 0.1;
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

