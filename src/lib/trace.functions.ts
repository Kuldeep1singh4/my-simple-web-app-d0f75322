import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  code: z.string().min(1).max(20000),
});

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

export type TraceStep = {
  line: number;
  variables: { [k: string]: JsonValue };
  explanation: string;
};

export type TraceResult = {
  steps: TraceStep[];
  error: string | null;
  traceError: string | null;
};

const SYSTEM_PROMPT =
  'You are a code execution tracer. First, check the code for syntax errors. If invalid, return ONLY: {"error": "Brief syntax error message"}. If valid, trace execution up to a strict maximum of 50 steps to prevent infinite loops. If execution exceeds 50 steps, append a final step with the explanation \'Execution stopped: Infinite loop or excessive steps detected.\' Return a JSON object with a \'steps\' array. Each object needs: \'line\' (integer), \'variables\' (object mapping names to values), and \'explanation\' (1-sentence beginner-friendly explanation). Return raw JSON only.';

export const traceCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<TraceResult> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return { steps: [], error: "GROQ_API_KEY is not configured.", traceError: null };
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
            { role: "user", content: `Trace this code and respond with JSON as instructed:\n\n${data.code}` },
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
        return { steps: [], error: `Groq API error (${res.status}): ${detail}` };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      let parsed: { steps?: TraceStep[] };
      try {
        parsed = JSON.parse(content);
      } catch {
        // Try to find JSON substring
        const match = content.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      }
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      return { steps, error: null };
    } catch (err) {
      console.error("Trace failed", err);
      return { steps: [], error: "Failed to reach the tracer service." };
    }
  });
