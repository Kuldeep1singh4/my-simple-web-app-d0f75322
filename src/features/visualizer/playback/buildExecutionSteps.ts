import type { TraceStep, ExecutionStep, Phase } from "../types";

// Base dwell time for a 1x step. MIDDLE steps divide this by their multiplier.
export const BASE_STEP_DELAY = 2200;

// How many steps at each end get the slow, fully-narrated treatment.
export const PHASE_EDGE = 3;

export const ACTION_TITLES: Record<string, string> = {
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

export const PHASE_LABELS: Record<Phase, string> = {
  START: "Setting the stage",
  MIDDLE: "Fast-forwarding iterations…",
  END: "Final result",
};

export function buildExecutionSteps(steps: TraceStep[]): ExecutionStep[] {
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

