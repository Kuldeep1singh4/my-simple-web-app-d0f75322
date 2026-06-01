import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  code: z.string().min(1).max(20000),
  language: z.enum(["javascript", "python", "java", "c", "cpp"]).default("javascript"),
});

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

export type ActionType =
  | "compare"
  | "swap"
  | "insert"
  | "read"
  | "write"
  | "success"
  | "error"
  | "init"
  | "return"
  | "fast-forward";

export type TraceStep = {
  line: number;
  variables: { [k: string]: JsonValue };
  explanation: string;
  activeVariables?: string[];
  actionType?: ActionType | string;
  consoleOutput?: string | null;
};

export type Complexity = {
  time: string;
  space: string;
};

export type StructureType = "array" | "linked_list" | "binary_tree" | "graph" | "primitives";

export type TraceResult = {
  steps: TraceStep[];
  complexity: Complexity | null;
  structureType: StructureType | null;
  error: string | null;
  traceError: string | null;
};

const SYSTEM_PROMPT =
  'You are a code execution tracer. The code provided will have line numbers prepended to each line (e.g., "1: "). You MUST use these exact explicitly provided numbers for your "line" value in the JSON response, do not attempt to count the lines yourself. You are a true compiler/interpreter. DO NOT blindly trace sequentially from line 1. For C, C++, and Java, begin your trace exactly at the execution of the main() function. For Python and JavaScript, begin at the first line of global execution. If a function or method is called, your trace must visually jump to the line number of that function\'s definition, track its local scope, and jump back to the caller when it returns. STRICT MATHEMATICAL ACCURACY: You are an exact compiler. You must meticulously calculate mathematical operations (e.g., modulo, powers, addition, division, multiplication). Do not hallucinate math results. For example, 27 + 125 is strictly 152, 7 % 3 is strictly 1, 2^10 is strictly 1024. Verify all arithmetic step-by-step before determining truth conditions or branching. First, check the code for syntax errors. If invalid, return ONLY JSON: {"error": "Brief syntax error message"}. If valid, trace execution up to a strict maximum of 50 steps to prevent infinite loops. SMART FAST-FORWARD: If a loop or recursive function is highly repetitive and the total execution will easily exceed 50 steps, you must use \'Smart Summarization\'. Execute the first 3 or 4 iterations normally to show the pattern. Then, combine the remaining iterations into a single step. Set actionType: "fast-forward", provide an explanation: "Fast-forwarding remaining loop iterations...", and update all variables instantly to their final state at the end of that loop. After fast-forwarding, continue normal step-by-step tracing for any code following the loop. If execution still exceeds 50 steps, append a final step with the explanation \'Execution stopped: Infinite loop or excessive steps detected.\' Also analyze the overall code and include a complexity object with Big-O notation. Additionally, evaluate the primary data structure used by the code and include a top-level "structureType" string set to one of: "array", "linked_list", "binary_tree", "graph", or "primitives". When structureType is "linked_list", every node in the variables object MUST be represented as an object with a "value" field and a "next" field (which is either another node object or null). When structureType is "binary_tree", every node MUST be represented as an object with a "value" field and "left" and "right" fields (each either another node object or null). When structureType is "array", arrays MUST stay as JSON arrays of primitives. When structureType is "graph" (e.g. BFS, DFS, Dijkstra, topological sort, union-find on a graph), the variables object MUST contain a clean topological representation of the graph with exactly two arrays: a "nodes" array where each entry is an object like { "id": "A", "val": 1 } (id is a stable string identifier, val is optional and used for things like distance or weight) and an "edges" array where each entry is an object like { "source": "A", "target": "B", "weight": null } (weight may be a number for weighted graphs or null otherwise; for undirected graphs include each edge once). To make the traversal visible, every step\'s variables object for a graph MUST also include an "activeNode" field (a single node id string, or null) representing the currently visited/processed node, and a "visitedNodes" array of node id strings representing all nodes already visited so far. Additional algorithm state (queue, stack, distances, parents) may also live in variables alongside nodes/edges. CONSOLE OUTPUT TRACKING: Every step object MUST include a "consoleOutput" field. If the current line is a print(), println(), printf(), cout, System.out.print/println, or console.log() statement, put the exact printed string (including any trailing newline like "\\n" for println-style calls) into this field (e.g., "153 is an Armstrong number\\n"). If nothing is printed on that step, set "consoleOutput" to an empty string "". Return a JSON object with: \'steps\' (array, each item: \'line\' integer matching the prepended number, \'variables\' object mapping names to values, \'explanation\' 1-sentence beginner-friendly explanation, \'activeVariables\' array of strings naming the variables or specific array indices being modified or evaluated this step using forms like "total", "i", "arr[0]", "arr[1]", \'actionType\' string from this exact set: "compare", "swap", "insert", "read", "write", "success", "error", "init", "return", "fast-forward", \'consoleOutput\' string), \'complexity\' (object: {"time": "O(...)", "space": "O(...)"}), and \'structureType\' (string). Return raw JSON only.';

export const traceCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<TraceResult> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return { steps: [], complexity: null, structureType: null, error: "GROQ_API_KEY is not configured.", traceError: null };
    }


    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Language: ${data.language}\n\nTrace this code and respond with JSON as instructed. Each line is prefixed with its line number:\n\n${data.code
                .split("\n")
                .map((l, i) => `${i + 1}: ${l}`)
                .join("\n")}`,
            },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Groq error", res.status, text);
        let detail = text;
        try {
          const parsedErr = JSON.parse(text) as {
            error?: { message?: string } | string;
            message?: string;
          };
          if (typeof parsedErr.error === "object" && parsedErr.error?.message) {
            detail = parsedErr.error.message;
          } else if (typeof parsedErr.error === "string") {
            detail = parsedErr.error;
          } else if (parsedErr.message) {
            detail = parsedErr.message;
          }
        } catch {
          // keep raw text
        }
        return {
          steps: [],
          complexity: null,
          structureType: null,
          error: `Groq API error (${res.status}): ${detail}`,
          traceError: null,
        };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      let parsed: {
        steps?: TraceStep[];
        error?: string;
        complexity?: Complexity;
        structureType?: string;
      };
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      }
      if (typeof parsed.error === "string" && !Array.isArray(parsed.steps)) {
        return { steps: [], complexity: null, structureType: null, error: null, traceError: parsed.error };
      }
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      const complexity =
        parsed.complexity && typeof parsed.complexity.time === "string" && typeof parsed.complexity.space === "string"
          ? parsed.complexity
          : null;
      const allowed: StructureType[] = ["array", "linked_list", "binary_tree", "primitives"];
      const structureType =
        typeof parsed.structureType === "string" && (allowed as string[]).includes(parsed.structureType)
          ? (parsed.structureType as StructureType)
          : null;
      return { steps, complexity, structureType, error: null, traceError: null };
    } catch (err) {
      console.error("Trace failed", err);
      return { steps: [], complexity: null, structureType: null, error: "Failed to reach the tracer service.", traceError: null };
    }
  });

