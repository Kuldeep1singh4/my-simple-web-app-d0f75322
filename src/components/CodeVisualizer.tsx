import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, StepForward, StepBack, Sparkles, Loader2, Clock, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { traceCode, type TraceStep, type JsonValue, type Complexity } from "@/lib/trace.functions";
import { cn } from "@/lib/utils";

type Language = "javascript" | "python" | "java" | "c" | "cpp";

const LANGUAGE_LABELS: Record<Language, string> = {
  javascript: "JavaScript",
  python: "Python",
  java: "Java",
  c: "C",
  cpp: "C++",
};

const DEFAULT_CODE: Record<Language, string> = {
  javascript: `let total = 0;
for (let i = 1; i <= 3; i++) {
  total = total + i;
}
const result = total * 2;
`,
  python: `total = 0
for i in range(1, 4):
    total = total + i
result = total * 2
`,
  java: `int total = 0;
for (int i = 1; i <= 3; i++) {
  total = total + i;
}
int result = total * 2;
`,
  c: `int total = 0;
for (int i = 1; i <= 3; i++) {
  total = total + i;
}
int result = total * 2;
`,
  cpp: `int total = 0;
for (int i = 1; i <= 3; i++) {
  total = total + i;
}
int result = total * 2;
`,
};

function languageExtension(lang: Language): Extension {
  switch (lang) {
    case "python":
      return python();
    case "java":
      return java();
    case "c":
    case "cpp":
      return cpp();
    default:
      return javascript();
  }
}

// CodeMirror highlight extension for the active line
const setActiveLine = StateEffect.define<number | null>();
const activeLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setActiveLine)) {
        if (e.value == null) return Decoration.none;
        const lineNum = Math.max(1, Math.min(e.value, tr.state.doc.lines));
        const line = tr.state.doc.line(lineNum);
        return Decoration.set([
          Decoration.line({ class: "cm-active-trace-line" }).range(line.from),
        ]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const lineTheme = EditorView.baseTheme({
  ".cm-active-trace-line": {
    backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
    boxShadow: "inset 3px 0 0 0 var(--primary)",
  },
});

function formatPrimitive(value: JsonValue): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function isPlainObject(v: JsonValue): v is { [k: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isLinkedNode(v: JsonValue): v is { [k: string]: JsonValue } {
  return isPlainObject(v) && "next" in v;
}

function isTreeNode(v: JsonValue): v is { [k: string]: JsonValue } {
  return isPlainObject(v) && ("left" in v || "right" in v);
}

function ArrayView({ value }: { value: JsonValue[] }) {
  return (
    <div className="flex flex-wrap gap-0 overflow-x-auto pb-1">
      {value.map((item, i) => (
        <div key={i} className="flex flex-col items-center">
          <div
            className={cn(
              "min-w-12 px-3 py-2 font-mono text-sm text-center bg-card border border-border",
              i === 0 && "rounded-l-md",
              i === value.length - 1 && "rounded-r-md border-r",
              i > 0 && "border-l-0"
            )}
          >
            {formatPrimitive(item)}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{i}</div>
        </div>
      ))}
    </div>
  );
}

function LinkedNodeBlock({ node }: { node: { [k: string]: JsonValue } }) {
  const valueKey = Object.keys(node).find((k) => k !== "next");
  const display = valueKey ? formatPrimitive(node[valueKey]) : "{…}";
  return (
    <div className="px-3 py-2 rounded-md bg-card border border-border font-mono text-sm whitespace-nowrap">
      {display}
    </div>
  );
}

function LinkedListView({ head }: { head: { [k: string]: JsonValue } }) {
  const nodes: { [k: string]: JsonValue }[] = [];
  let cur: JsonValue = head;
  let guard = 0;
  while (isLinkedNode(cur) && guard < 50) {
    nodes.push(cur);
    cur = cur.next;
    guard++;
  }
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {nodes.map((n, i) => (
        <div key={i} className="flex items-center gap-1">
          <LinkedNodeBlock node={n} />
          <span className="text-primary font-mono text-lg">→</span>
        </div>
      ))}
      <span className="font-mono text-xs text-muted-foreground">
        {cur === null ? "null" : "…"}
      </span>
    </div>
  );
}

function TreeView({ node }: { node: { [k: string]: JsonValue } }) {
  const valueKey = Object.keys(node).find((k) => k !== "left" && k !== "right");
  const display = valueKey ? formatPrimitive(node[valueKey]) : "•";
  const left = node.left;
  const right = node.right;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="px-3 py-1.5 rounded-md bg-card border border-primary/40 font-mono text-sm">
        {display}
      </div>
      {(isTreeNode(left) || isTreeNode(right) || isPlainObject(left) || isPlainObject(right)) && (
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center">
            <div className="text-[10px] text-muted-foreground font-mono">L</div>
            {isPlainObject(left) ? (
              <TreeView node={left} />
            ) : (
              <div className="text-xs font-mono text-muted-foreground">
                {left === undefined ? "—" : formatPrimitive(left as JsonValue)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center">
            <div className="text-[10px] text-muted-foreground font-mono">R</div>
            {isPlainObject(right) ? (
              <TreeView node={right} />
            ) : (
              <div className="text-xs font-mono text-muted-foreground">
                {right === undefined ? "—" : formatPrimitive(right as JsonValue)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VariableCard({ name, value }: { name: string; value: JsonValue }) {
  const isArray = Array.isArray(value);
  const isTree = isTreeNode(value);
  const isLinked = !isTree && isLinkedNode(value);
  const isSpecial = isArray || isTree || isLinked;

  const display = useMemo(() => {
    if (isSpecial) return JSON.stringify(value);
    try {
      return typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : formatPrimitive(value);
    } catch {
      return String(value);
    }
  }, [value, isSpecial]);

  const [flash, setFlash] = useState(false);
  const prev = useRef(display);
  useEffect(() => {
    if (prev.current !== display) {
      setFlash(true);
      prev.current = display;
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
  }, [display]);

  return (
    <Card
      className={cn(
        "p-3 border transition-all duration-700 ease-out",
        isSpecial ? "col-span-2 sm:col-span-3" : "",
        flash
          ? "bg-[oklch(0.85_0.18_140)] border-[oklch(0.7_0.2_140)] scale-[1.02] shadow-lg shadow-[oklch(0.7_0.2_140/0.4)]"
          : "bg-card border-border"
      )}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
        {name}
      </div>
      <div className="mt-2 font-mono text-foreground break-all">
        {isArray ? (
          <ArrayView value={value as JsonValue[]} />
        ) : isTree ? (
          <div className="overflow-x-auto">
            <TreeView node={value as { [k: string]: JsonValue }} />
          </div>
        ) : isLinked ? (
          <LinkedListView head={value as { [k: string]: JsonValue }} />
        ) : (
          <span className="text-lg font-semibold">{display}</span>
        )}
      </div>
    </Card>
  );
}

export function CodeVisualizer() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [idx, setIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const editorRef = useRef<EditorView | null>(null);
  const trace = useServerFn(traceCode);

  const current = idx >= 0 && idx < steps.length ? steps[idx] : null;

  // Update active line decoration
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.dispatch({
      effects: setActiveLine.of(current ? current.line : null),
    });
  }, [current]);

  // Autoplay
  useEffect(() => {
    if (!playing) return;
    if (idx >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, steps.length - 1)), 1500);
    return () => clearTimeout(t);
  }, [playing, idx, steps.length]);

  const handleVisualize = async () => {
    setLoading(true);
    setError(null);
    setTraceError(null);
    setPlaying(false);
    setIdx(-1);
    try {
      const res = await trace({ data: { code } });
      if (res.error) {
        setError(res.error);
        setSteps([]);
      } else if (res.traceError) {
        setTraceError(res.traceError);
        setSteps([]);
      } else {
        setSteps(res.steps);
        setIdx(res.steps.length > 0 ? 0 : -1);
      }
    } catch (e) {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const stepForward = () => setIdx((i) => Math.min(i + 1, steps.length - 1));
  const stepBack = () => setIdx((i) => Math.max(i - 1, 0));

  const variables = current?.variables ?? {};

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-background text-foreground">
      {/* Editor */}
      <div className="flex flex-col w-full md:w-1/2 h-[40vh] md:h-full border-b md:border-b-0 md:border-r border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h1 className="font-semibold">Code Visualizer</h1>
          </div>
          <Button size="sm" onClick={handleVisualize} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Tracing…
              </>
            ) : (
              "Visualize"
            )}
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          <CodeMirror
            value={code}
            onChange={setCode}
            theme="dark"
            extensions={[javascript(), activeLineField, lineTheme]}
            basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
            onCreateEditor={(view) => {
              editorRef.current = view;
            }}
            height="100%"
            className="h-full text-sm"
          />
        </div>
      </div>

      {/* Canvas */}
      <div className="flex flex-col w-full md:w-1/2 h-[60vh] md:h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
          <h2 className="font-semibold">Visualization</h2>
          <div className="text-xs text-muted-foreground font-mono">
            {steps.length > 0 ? `Step ${idx + 1} / ${steps.length}` : "No trace yet"}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <Card className="p-3 border-destructive/40 bg-destructive/10 text-destructive text-sm">
              {error}
            </Card>
          )}

          {traceError && (
            <Card className="p-4 border-2 border-destructive bg-destructive/10">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-destructive/20 text-destructive flex items-center justify-center font-bold text-lg shrink-0">
                  !
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-destructive font-bold mb-1">
                    Syntax Error
                  </div>
                  <div className="text-sm text-destructive font-mono leading-relaxed break-words">
                    {traceError}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {!error && !traceError && steps.length === 0 && !loading && (
            <div className="h-full flex items-center justify-center text-center text-muted-foreground text-sm">
              <div>
                Write some code and click <span className="text-primary font-medium">Visualize</span>{" "}
                to trace its execution step by step.
              </div>
            </div>
          )}

          {current && (
            <Card className="p-4 bg-primary/5 border-primary/30">
              <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">
                Line {current.line}
              </div>
              <div className="text-sm leading-relaxed">{current.explanation}</div>
            </Card>
          )}

          {Object.keys(variables).length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                Variable Watch
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(variables).map(([k, v]) => (
                  <VariableCard key={k} name={k} value={v} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        {!traceError && (
        <div className="border-t border-border bg-card/50 p-3 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={stepBack}
            disabled={steps.length === 0 || idx <= 0}
            aria-label="Step backward"
          >
            <StepBack className="h-4 w-4" />
          </Button>
          {playing ? (
            <Button
              size="icon"
              onClick={() => setPlaying(false)}
              disabled={steps.length === 0}
              aria-label="Pause"
            >
              <Pause className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={() => {
                if (idx >= steps.length - 1) setIdx(0);
                setPlaying(true);
              }}
              disabled={steps.length === 0}
              aria-label="Play"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={stepForward}
            disabled={steps.length === 0 || idx >= steps.length - 1}
            aria-label="Step forward"
          >
            <StepForward className="h-4 w-4" />
          </Button>
        </div>
        )}
      </div>
    </div>
  );
}
