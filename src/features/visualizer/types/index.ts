import type {
  JsonValue,
  ActionType,
  TraceStep,
  Complexity,
  StructureType,
  TraceResult,
} from "@/lib/trace.functions";

export type {
  JsonValue,
  ActionType,
  TraceStep,
  Complexity,
  StructureType,
  TraceResult,
};

export type Language = "javascript" | "python" | "java" | "c" | "cpp";

export const LANGUAGE_LABELS: Record<Language, string> = {
  javascript: "JavaScript",
  python: "Python",
  java: "Java",
  c: "C",
  cpp: "C++",
};

export const DEFAULT_CODE: Record<Language, string> = {
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

export type ColorKind = "compare" | "swapError" | "successInsert" | "readWrite" | "default";

export function actionKind(action?: string): ColorKind {
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

export const COLORS: Record<ColorKind, { bg: string; border: string; fg: string; glow: string }> = {
  // Flat pastels — no neon, no glow
  compare: { bg: "#FFF3B0", border: "#333333", fg: "#1a1a1a", glow: "transparent" },
  swapError: { bg: "#FFCDD2", border: "#333333", fg: "#1a1a1a", glow: "transparent" },
  successInsert: { bg: "#C8E6C9", border: "#333333", fg: "#1a1a1a", glow: "transparent" },
  readWrite: { bg: "#BBDEFB", border: "#333333", fg: "#1a1a1a", glow: "transparent" },
  default: { bg: "#FFFFFF", border: "#333333", fg: "#1a1a1a", glow: "transparent" },
};

// Fluid spring used everywhere
export const SPRING = { type: "spring" as const, bounce: 0.5, duration: 0.6 };

// Stronger spring just for swap/glide animations between array indices
export const SWAP_SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

// Pointer name regex & coloring
export const POINTER_NAME_RE =
  /^(i|j|k|l|m|n|p|q|r|s|x|y|idx|index|pos|left|right|lo|hi|mid|start|end|ptr|cur|prev|slow|fast)$/i;

export const POINTER_COLORS = ["#1a1a1a", "#444444", "#2d3748", "#4a5568", "#555555", "#222222"];

export type ActiveSet = {
  names: Set<string>;
  indices: Map<string, Set<number>>;
};

export type PointerInfo = { var: string; index: number; color: string };

export type ArrayItem = { id: string; value: JsonValue };

export function formatPrimitive(value: JsonValue): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

export function isPlainObject(v: JsonValue): v is { [k: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isLinkedNode(v: JsonValue): v is { [k: string]: JsonValue } {
  return isPlainObject(v) && "next" in v;
}

export function isTreeNode(v: JsonValue): v is { [k: string]: JsonValue } {
  return isPlainObject(v) && ("left" in v || "right" in v);
}

export type TreeData = { label: string; left: TreeData | null; right: TreeData | null };

export type GraphNode = { id: string; val?: JsonValue };
export type GraphEdge = { source: string; target: string; weight?: JsonValue };

export type Phase = "START" | "MIDDLE" | "END";

export type ExecutionStep = {
  stepIndex: number;
  phase: Phase;
  line: number;
  speedMultiplier: number;
  title: string;
  detail: string;
  isFastForward: boolean;
};

