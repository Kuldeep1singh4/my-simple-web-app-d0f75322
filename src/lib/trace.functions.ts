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
  | "return";

export type TraceStep = {
  line: number;
  variables: { [k: string]: JsonValue };
  explanation: string;
  activeVariables?: string[];
  actionType?: ActionType | string;
};

export type Complexity = {
  time: string;
  space: string;
};

export type StructureType = "array" | "linked_list" | "binary_tree" | "primitives";

export type TraceResult = {
  steps: TraceStep[];
  complexity: Complexity | null;
  structureType: StructureType | null;
  error: string | null;
  traceError: string | null;
};

const SYSTEM_PROMPT =
  'You are a code execution tracer. The code provided will have line numbers prepended to each line (e.g., "1: "). You MUST use these exact explicitly provided numbers for your "line" value in the JSON response, do not attempt to count the lines yourself. You are a true compiler/interpreter. DO NOT blindly trace sequentially from line 1. For C, C++, and Java, begin your trace exactly at the execution of the main() function. For Python and JavaScript, begin at the first line of global execution. If a function or method is called, your trace must visually jump to the line number of that function\'s definition, track its local scope, and jump back to the caller when it returns. First, check the code for syntax errors. If invalid, return ONLY JSON: {"error": "Brief syntax error message"}. If valid, trace execution up to a strict maximum of 50 steps to prevent infinite loops. If execution exceeds 50 steps, append a final step with the explanation \'Execution stopped: Infinite loop or excessive steps detected.\' Also analyze the overall code and include a complexity object with Big-O notation. Additionally, evaluate the primary data structure used by the code and include a top-level "structureType" string set to one of: "array", "linked_list", "binary_tree", or "primitives". When structureType is "linked_list", every node in the variables object MUST be represented as an object with a "value" field and a "next" field (which is either another node object or null). When structureType is "binary_tree", every node MUST be represented as an object with a "value" field and "left" and "right" fields (each either another node object or null). When structureType is "array", arrays MUST stay as JSON arrays of primitives. Return a JSON object with: \'steps\' (array, each item: \'line\' integer matching the prepended number, \'variables\' object mapping names to values, \'explanation\' 1-sentence beginner-friendly explanation, \'activeVariables\' array of strings naming the variables or specific array indices being modified or evaluated this step using forms like "total", "i", "arr[0]", "arr[1]", \'actionType\' string from this exact set: "compare", "swap", "insert", "read", "write", "success", "error", "init", "return"), \'complexity\' (object: {"time": "O(...)", "space": "O(...)"}), and \'structureType\' (string). Return raw JSON only.';

export const traceCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<TraceResult> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return { steps: [], complexity: null, error: "GROQ_API_KEY is not configured.", traceError: null };
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
          error: `Groq API error (${res.status}): ${detail}`,
          traceError: null,
        };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      let parsed: { steps?: TraceStep[]; error?: string; complexity?: Complexity };
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      }
      if (typeof parsed.error === "string" && !Array.isArray(parsed.steps)) {
        return { steps: [], complexity: null, error: null, traceError: parsed.error };
      }
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      const complexity =
        parsed.complexity && typeof parsed.complexity.time === "string" && typeof parsed.complexity.space === "string"
          ? parsed.complexity
          : null;
      return { steps, complexity, error: null, traceError: null };
    } catch (err) {
      console.error("Trace failed", err);
      return { steps: [], complexity: null, error: "Failed to reach the tracer service.", traceError: null };
    }
  });
