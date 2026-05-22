import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, StepForward, StepBack, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { traceCode, type TraceStep, type JsonValue } from "@/lib/trace.functions";
import { cn } from "@/lib/utils";

const DEFAULT_CODE = `let total = 0;
for (let i = 1; i <= 3; i++) {
  total = total + i;
}
const result = total * 2;
`;

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

function VariableCard({ name, value }: { name: string; value: JsonValue }) {
  const display = useMemo(() => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return `"${value}"`;
    try {
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    } catch {
      return String(value);
    }
  }, [value]);

  const [flash, setFlash] = useState(false);
  const prev = useRef(display);
  useEffect(() => {
    if (prev.current !== display) {
      setFlash(true);
      prev.current = display;
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [display]);

  return (
    <Card
      className={cn(
        "p-3 transition-all duration-500 border",
        flash
          ? "bg-primary/15 border-primary scale-[1.02] shadow-lg shadow-primary/20"
          : "bg-card border-border"
      )}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
        {name}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold text-foreground break-all">
        {display}
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
    setPlaying(false);
    setIdx(-1);
    try {
      const res = await trace({ data: { code } });
      if (res.error) {
        setError(res.error);
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

          {!error && steps.length === 0 && !loading && (
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
      </div>
    </div>
  );
}
