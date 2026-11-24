import {
  type JsonValue,
  type ActiveSet,
  type PointerInfo,
  type ArrayItem,
  type GraphNode,
  type GraphEdge,
  type StructureType,
  POINTER_NAME_RE,
  POINTER_COLORS,
  isPlainObject,
  isLinkedNode,
  isTreeNode,
} from "../types";
import { collectListNodes } from "../components/LinkedListVisualizer";

export function isPointerName(name: string): boolean {
  return POINTER_NAME_RE.test(name);
}

export function pointerColor(name: string, allNames: string[]): string {
  const idx = allNames.indexOf(name);
  return POINTER_COLORS[(idx >= 0 ? idx : 0) % POINTER_COLORS.length];
}

export function parseActive(list: string[] | undefined): ActiveSet {
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

// Minimalist, deterministic array item mapper preserving Framer Motion swap animations
export function deriveArrayItems(arrays: [string, JsonValue[]][]): Map<string, ArrayItem[]> {
  const result = new Map<string, ArrayItem[]>();
  for (const [name, values] of arrays) {
    const valCounts = new Map<string, number>();
    const items = values.map((val) => {
      const key = JSON.stringify(val);
      const count = (valCounts.get(key) ?? 0) + 1;
      valCounts.set(key, count);
      return { id: `${name}-${key}-${count}`, value: val };
    });
    result.set(name, items);
  }
  return result;
}

export function derivePointerInfo(
  arrays: [string, JsonValue[]][],
  scalars: [string, JsonValue][],
  variables: Record<string, JsonValue>,
): {
  pointerScalarNames: string[];
  pointersByArray: Map<string, PointerInfo[]>;
} {
  const pointerScalarNames: string[] = [];
  for (const [sName, sVal] of scalars) {
    if (isPointerName(sName) && typeof sVal === "number" && Number.isInteger(sVal)) {
      pointerScalarNames.push(sName);
    }
  }

  const pointersByArray = new Map<string, PointerInfo[]>();
  for (const [aName, aVal] of arrays) {
    const list: PointerInfo[] = [];
    for (const pName of pointerScalarNames) {
      const v = variables[pName];
      if (typeof v === "number" && v >= 0 && v < aVal.length) {
        list.push({ var: pName, index: v, color: pointerColor(pName, pointerScalarNames) });
      }
    }
    pointersByArray.set(aName, list);
  }

  return { pointerScalarNames, pointersByArray };
}

export function detectArrayBounds(
  variables: Record<string, JsonValue>,
  arrays: [string, JsonValue[]][],
): Map<string, { low: number; high: number }> {
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
}

export type ListPtr = { name: string; targetIndex: number | null };

export function resolveLinkedListChains(
  entries: [string, JsonValue][],
  forceList: boolean,
  forceTree: boolean,
): {
  linkedRender: [string, JsonValue][];
  listPointers: ListPtr[];
  linkedPointerNames: Set<string>;
} {
  let linkedRender: [string, JsonValue][] = [];
  const listPointers: ListPtr[] = [];
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
        if (v === null) {
          listPointers.push({ name: n, targetIndex: null });
        } else {
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

  return { linkedRender, listPointers, linkedPointerNames };
}

export function resolveGraphState(
  variables: Record<string, JsonValue>,
  parsedGraph: { nodes: GraphNode[]; edges: GraphEdge[] } | null,
): {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
  activeNode: string | null;
  visitedNodes: Set<string>;
} {
  if (!parsedGraph) return { graph: null, activeNode: null, visitedNodes: new Set() };

  const gdObj = isPlainObject(variables["graphData"])
    ? (variables["graphData"] as { [k: string]: JsonValue })
    : null;

  const ACTIVE_KEYS = ["activeNode", "curr", "current", "currentNode", "u", "node"];
  const VISITED_KEYS = ["visitedNodes", "visited", "seen"];

  let an: JsonValue | undefined = undefined;
  for (const k of ACTIVE_KEYS) {
    const v = variables[k] ?? (gdObj ? gdObj[k] : undefined);
    if (typeof v === "string" || typeof v === "number") {
      an = v;
      break;
    }
  }

  let vn: JsonValue | undefined = undefined;
  for (const k of VISITED_KEYS) {
    const v = variables[k] ?? (gdObj ? gdObj[k] : undefined);
    if (Array.isArray(v)) {
      vn = v;
      break;
    }
  }

  const activeNode = typeof an === "string" || typeof an === "number" ? String(an) : null;
  const visitedNodes = new Set<string>(
    Array.isArray(vn)
      ? vn.filter((x) => typeof x === "string" || typeof x === "number").map((x) => String(x))
      : [],
  );

  return { graph: parsedGraph, activeNode, visitedNodes };
}

export function partitionFrame(
  variables: Record<string, JsonValue>,
  structureType: StructureType | null,
  parsedGraph: { nodes: GraphNode[]; edges: GraphEdge[] } | null,
) {
  const entries = Object.entries(variables);
  const forceList = structureType === "linked_list";
  const forceTree = structureType === "binary_tree";
  const isGraph = structureType === "graph" || (parsedGraph !== null && parsedGraph.edges.length > 0);

  const GRAPH_KEYS = new Set([
    "nodes",
    "edges",
    "activeNode",
    "visitedNodes",
    "graphData",
    "visited",
    "seen",
    "curr",
    "current",
  ]);

  const arrays = entries.filter(
    ([n, v]) => Array.isArray(v) && !(isGraph && GRAPH_KEYS.has(n)),
  ) as [string, JsonValue[]][];

  const trees = forceList
    ? []
    : entries.filter(([, v]) => (forceTree ? isPlainObject(v) && !isLinkedNode(v) : isTreeNode(v)));

  const { linkedRender, listPointers, linkedPointerNames } = resolveLinkedListChains(
    entries,
    forceList,
    forceTree,
  );

  const scalars = entries.filter(
    ([n, v]) =>
      !Array.isArray(v) &&
      !linkedRender.some(([ln]) => ln === n) &&
      !trees.some(([tn]) => tn === n) &&
      !linkedPointerNames.has(n),
  );

  const { pointerScalarNames, pointersByArray } = derivePointerInfo(arrays, scalars, variables);
  const boundsByArray = detectArrayBounds(variables, arrays);
  const arrayItemsByName = deriveArrayItems(arrays);

  const holdingCells = scalars
    .filter(([n]) => !pointerScalarNames.includes(n))
    .filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))
    .map(([name, value]) => ({ name, value }));

  const graphState = isGraph ? resolveGraphState(variables, parsedGraph) : null;

  return {
    arrays,
    trees,
    linkedRender,
    listPointers,
    scalars,
    holdingCells,
    pointersByArray,
    boundsByArray,
    arrayItemsByName,
    isGraph,
    graphState,
    forceList,
  };
}

