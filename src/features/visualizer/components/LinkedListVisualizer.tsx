import React from "react";
import {
  type JsonValue,
  formatPrimitive,
  isPlainObject,
  isLinkedNode,
} from "../types";

export function hasValidValue(v: JsonValue): boolean {
  if (!isPlainObject(v)) return false;
  const valueKey =
    "value" in v ? "value" : Object.keys(v).find((k) => k !== "next");
  if (!valueKey) return false;
  const val = v[valueKey];
  return val !== null && val !== undefined && val !== "";
}

export function collectListNodes(
  head: JsonValue,
): { value: JsonValue; raw: { [k: string]: JsonValue } }[] {
  const out: { value: JsonValue; raw: { [k: string]: JsonValue } }[] = [];
  let cur: JsonValue = head;
  let guard = 0;
  while (isLinkedNode(cur) && guard < 50) {
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

export function LinkedListView({
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
  const NODE_W = 84;
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

