import React from "react";
import { motion } from "framer-motion";
import {
  type JsonValue,
  type ActiveSet,
  SPRING,
  formatPrimitive,
} from "../types";

export function MemoryBoard({
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

