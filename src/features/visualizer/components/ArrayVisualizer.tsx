import React from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  type JsonValue,
  type ActiveSet,
  type PointerInfo,
  type ArrayItem,
  COLORS,
  SPRING,
  SWAP_SPRING,
  formatPrimitive,
} from "../types";

export function ArrayRow({
  name,
  items,
  active,
  pointers,
  bounds,
  actionColor,
}: {
  name: string;
  items: ArrayItem[];
  active: ActiveSet;
  pointers: PointerInfo[];
  bounds?: { low: number; high: number } | null;
  actionColor?: { bg: string; border: string; fg: string; glow: string };
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
              const inBounds = !bounds || !(i < bounds.low || i > bounds.high);
              return (
                <motion.div
                  key={item.id}
                  layout
                  data-active-key={`${name}[${i}]`}
                  transition={SWAP_SPRING}
                  animate={{
                    backgroundColor: isActive ? (actionColor?.bg ?? COLORS.compare.bg) : COLORS.default.bg,
                    color: isActive ? (actionColor?.fg ?? COLORS.default.fg) : COLORS.default.fg,
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

export function HoldingCells({
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

