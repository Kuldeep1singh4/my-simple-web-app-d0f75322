import React, { useMemo } from "react";
import { Sparkles } from "lucide-react";
import type {
  TraceStep,
  ExecutionStep,
  StructureType,
  JsonValue,
  GraphNode,
  GraphEdge,
  ActiveSet,
} from "../types";
import { partitionFrame } from "../utils/dataShaper";
import { PHASE_LABELS } from "../playback/buildExecutionSteps";
import { ArrayRow, HoldingCells } from "./ArrayVisualizer";
import { LinkedListView } from "./LinkedListVisualizer";
import { TreeView } from "./TreeVisualizer";
import { GraphVisualizer } from "./GraphVisualizer";
import { MemoryBoard } from "./MemoryBoard";

interface VisualizerStageProps {
  steps: TraceStep[];
  current: TraceStep | null;
  active: ActiveSet;
  actionColor: { bg: string; border: string; fg: string; glow: string };
  structureType: StructureType | null;
  variables: Record<string, JsonValue>;
  parsedGraph: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
  currentExec: ExecutionStep | null;
}

export function VisualizerStage({
  steps,
  current,
  active,
  actionColor,
  structureType,
  variables,
  parsedGraph,
  currentExec,
}: VisualizerStageProps) {
  const frame = useMemo(
    () => partitionFrame(variables, structureType, parsedGraph),
    [variables, structureType, parsedGraph],
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
      {/* Dynamic Phase & Fast-Forward Bar */}
      {steps.length > 0 && (
        <div className="shrink-0 border-b border-border bg-card/40 px-3 py-1.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-mono">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{
                background:
                  currentExec?.phase === "START"
                    ? "#3b82f6"
                    : currentExec?.phase === "MIDDLE"
                      ? "#f59e0b"
                      : "#10b981",
              }}
            />
            <span className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
              {currentExec ? PHASE_LABELS[currentExec.phase] : ""}
            </span>
            {currentExec?.isFastForward && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-100 text-amber-800">
                FAST-FORWARD
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            Speed: {currentExec?.speedMultiplier ?? 1}x
          </span>
        </div>
      )}

      {/* Visual stage viewport */}
      <div
        className="flex-1 min-h-0 p-3 flex flex-col items-center justify-center relative overflow-hidden"
        style={{
          paddingBottom: current ? "64px" : "12px",
        }}
      >
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <Sparkles className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium">No trace data yet</p>
            <p className="text-xs opacity-75 mt-1">
              Click &ldquo;Visualize&rdquo; to simulate execution step by step.
            </p>
          </div>
        ) : structureType === "primitives" ? (
          <MemoryBoard
            vars={frame.scalars.map(([name, value]) => ({ name, value }))}
            active={active}
            actionColor={actionColor}
          />
        ) : frame.isGraph ? (
          frame.graphState?.graph ? (
            <div className="w-full h-full flex-1 min-h-0" style={{ minHeight: 280 }}>
              <GraphVisualizer
                nodes={frame.graphState.graph.nodes}
                edges={frame.graphState.graph.edges}
                activeNode={frame.graphState.activeNode}
                visitedNodes={frame.graphState.visitedNodes}
              />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground font-mono">
              Waiting for graph structure…
            </div>
          )
        ) : (
          <>
            {/* Array rows */}
            {frame.arrays.map(([name]) => (
              <div key={name} className="flex flex-col items-center mb-3">
                <ArrayRow
                  name={name}
                  items={frame.arrayItemsByName.get(name) ?? []}
                  active={active}
                  pointers={frame.pointersByArray.get(name) ?? []}
                  bounds={frame.boundsByArray.get(name) ?? null}
                  actionColor={actionColor}
                />
              </div>
            ))}

            {/* Tree roots */}
            {frame.trees.map(([name, root]) => (
              <div key={name} className="flex flex-col items-center mb-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-1">
                  {name}
                </div>
                <TreeView node={root as { [k: string]: JsonValue }} />
              </div>
            ))}

            {/* Holding cells for intermediate/extracted values */}
            <HoldingCells
              cells={frame.holdingCells}
              active={active}
              actionColor={actionColor}
            />

            {/* Linked lists */}
            {frame.linkedRender.map(([name, val]) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">
                  {name}
                </div>
                <LinkedListView
                  head={val as { [k: string]: JsonValue }}
                  pointers={frame.forceList ? frame.listPointers : []}
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
          {currentExec && (
            <div className="text-[10px] uppercase tracking-wider font-mono font-bold text-gray-500 text-center mb-0.5">
              {currentExec.title}
            </div>
          )}
          <div className="text-xs md:text-sm text-gray-800 text-center leading-snug line-clamp-2">
            <span className="font-mono font-semibold text-gray-500 mr-2">
              Line {current.line}
            </span>
            {current.explanation}
          </div>
        </div>
      )}
    </div>
  );
}
