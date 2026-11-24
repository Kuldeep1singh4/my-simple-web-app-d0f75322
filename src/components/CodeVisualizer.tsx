import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, Terminal as TerminalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { traceCode } from "@/lib/trace.functions";

import {
  type JsonValue,
  type Language,
  type TraceStep,
  type Complexity,
  type StructureType,
  LANGUAGE_LABELS,
  DEFAULT_CODE,
  COLORS,
  actionKind,
} from "@/features/visualizer/types";

import type { Extension } from "@codemirror/state";
import {
  loadLanguageExtension,
  setActiveLine,
  activeLineField,
  lineTheme,
} from "@/features/visualizer/editor/extensions";

import {
  buildExecutionSteps,
  BASE_STEP_DELAY,
} from "@/features/visualizer/playback/buildExecutionSteps";

import {
  VisualizerStage,
  TerminalConsole,
  PlaybackControls,
  parseGraph,
} from "@/features/visualizer/components";
import { parseActive } from "@/features/visualizer/utils/dataShaper";

const EMPTY_VARS: Record<string, JsonValue> = {};

export function CodeVisualizer() {
  const [language, setLanguage] = useState<Language>("javascript");
  const [codeByLang, setCodeByLang] = useState<Record<Language, string>>(DEFAULT_CODE);
  const code = codeByLang[language];
  const setCode = (v: string) => setCodeByLang((prev) => ({ ...prev, [language]: v }));
  const [langExt, setLangExt] = useState<Extension>([]);

  // Dynamically load CodeMirror grammar on demand to keep initial bundle lean
  useEffect(() => {
    let active = true;
    loadLanguageExtension(language).then((ext) => {
      if (active) setLangExt(ext);
    });
    return () => {
      active = false;
    };
  }, [language]);

  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [complexity, setComplexity] = useState<Complexity | null>(null);
  const [structureType, setStructureType] = useState<StructureType | null>(null);
  const [idx, setIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [leftTab, setLeftTab] = useState<"code" | "console">("code");
  const [unseenConsole, setUnseenConsole] = useState(false);

  // Unified error and execution status banner
  const [statusAlert, setStatusAlert] = useState<{
    title?: string;
    message: string;
    variant: "destructive" | "warning";
  } | null>(null);

  const editorRef = useRef<EditorView | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trace = useServerFn(traceCode);

  const current = idx >= 0 && idx < steps.length ? steps[idx] : null;
  const active = useMemo(() => parseActive(current?.activeVariables), [current]);
  const actionColor = COLORS[actionKind(current?.actionType)];

  const execSteps = useMemo(() => buildExecutionSteps(steps), [steps]);
  const currentExec = idx >= 0 && idx < execSteps.length ? execSteps[idx] : null;
  const variables = current?.variables ?? EMPTY_VARS;
  const parsedGraph = useMemo(() => parseGraph(variables), [variables]);

  // Synchronize CodeMirror active line with smooth auto-scroll
  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;
    if (!current) {
      view.dispatch({ effects: setActiveLine.of(null) });
      return;
    }
    const lineNum = Math.max(1, Math.min(current.line, view.state.doc.lines));
    const line = view.state.doc.line(lineNum);
    view.dispatch({
      effects: [
        setActiveLine.of(current.line),
        EditorView.scrollIntoView(line.from, { y: "center" }),
      ],
    });
  }, [current]);

  const resetVisualState = () => {
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    setPlaying(false);
    setIdx(-1);
    setSteps([]);
    setComplexity(null);
    setStructureType(null);
    setStatusAlert(null);
    setUnseenConsole(false);
    editorRef.current?.dispatch({ effects: setActiveLine.of(null) });
  };

  useEffect(() => {
    resetVisualState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, language]);

  // Autoplay loop with phase-based dynamic dwell time
  useEffect(() => {
    if (!playing) return;
    if (idx >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const mult = execSteps[idx]?.speedMultiplier ?? 1;
    const delay = Math.max(320, BASE_STEP_DELAY / mult);
    playTimerRef.current = setTimeout(
      () => setIdx((i) => Math.min(i + 1, steps.length - 1)),
      delay,
    );
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    };
  }, [playing, idx, steps.length, execSteps]);

  const handleVisualize = async () => {
    resetVisualState();
    setLoading(true);
    try {
      const res = await trace({ data: { code, language } });
      if (res.error) {
        setStatusAlert({ message: res.error, variant: "destructive" });
      } else if (res.traceError) {
        setStatusAlert({
          title: "Code Execution Issue",
          message: `${res.traceError} Fix your code and click Visualize again.`,
          variant: "warning",
        });
        setComplexity(res.complexity);
        setStructureType(res.structureType);
      } else {
        setSteps(res.steps);
        setComplexity(res.complexity);
        setStructureType(res.structureType);
        setIdx(res.steps.length > 0 ? 0 : -1);
      }
    } catch {
      setStatusAlert({ message: "Network error connecting to trace service.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Concatenate stdout up to active step
  const consoleText = useMemo(() => {
    if (steps.length === 0 || idx < 0) return "";
    let out = "";
    for (let i = 0; i <= idx && i < steps.length; i++) {
      const text = steps[i]?.consoleOutput;
      if (text) out += text;
    }
    return out;
  }, [steps, idx]);

  const onTabChange = (tab: "code" | "console") => {
    setLeftTab(tab);
    if (tab === "console") setUnseenConsole(false);
  };

  useEffect(() => {
    if (consoleText && leftTab !== "console") {
      setUnseenConsole(true);
    }
  }, [consoleText, leftTab]);

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-[100vw] overflow-hidden bg-background text-foreground">
      {/* ===== Editor / Console Panel ===== */}
      <div className="flex flex-col w-full md:w-1/2 h-[35%] md:h-full border-b md:border-b-0 md:border-r border-border min-h-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50 gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <h1 className="font-semibold truncate text-sm">Code Visualizer</h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
                  <SelectItem key={l} value={l} className="text-xs">
                    {LANGUAGE_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleVisualize}
              disabled={loading}
              className="h-8 px-3 text-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Tracing…
                </>
              ) : (
                "Visualize"
              )}
            </Button>
          </div>
        </div>

        {/* Tab Toggle: Code | Console */}
        <div className="flex items-stretch border-b border-border bg-card/40 shrink-0">
          <button
            type="button"
            onClick={() => onTabChange("code")}
            className={`px-3 h-8 text-xs font-mono uppercase tracking-wider border-r border-border transition-colors ${leftTab === "code"
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
              }`}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => onTabChange("console")}
            className={`relative px-3 h-8 text-xs font-mono uppercase tracking-wider border-r border-border transition-colors flex items-center gap-1.5 ${leftTab === "console"
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <TerminalIcon className="h-3 w-3" />
            Console
            {unseenConsole && leftTab !== "console" && (
              <span
                className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500"
                aria-label="New output"
              />
            )}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 min-h-0 relative">
          <div
            className={`absolute inset-0 overflow-y-auto bg-[#1e1e2e] ${leftTab === "code" ? "block" : "hidden"
              }`}
          >
            <CodeMirror
              value={code}
              onChange={setCode}
              theme="dark"
              extensions={[
                langExt,
                activeLineField,
                lineTheme,
              ]}
              basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
              onCreateEditor={(view) => {
                editorRef.current = view;
              }}
              height="100%"
              className="h-full text-sm"
            />
          </div>
          <TerminalConsole consoleText={consoleText} isVisible={leftTab === "console"} />
        </div>

        {/* Status & Complexity Badge */}
        <div className="px-3 py-1.5 border-t border-border bg-card/30 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div>
            {complexity ? (
              <span className="font-mono text-[11px]">
                Time: <strong className="text-foreground">{complexity.time}</strong> · Space:{" "}
                <strong className="text-foreground">{complexity.space}</strong>
              </span>
            ) : (
              <span>Ready to trace</span>
            )}
          </div>
          {steps.length > 0 && (
            <span className="font-mono text-[11px]">
              Step {idx + 1} / {steps.length}
            </span>
          )}
        </div>
      </div>

      {/* ===== Visualization Stage Panel ===== */}
      <div className="flex flex-col w-full md:w-1/2 h-[65%] md:h-full bg-muted/20 min-h-0">
        {statusAlert && (
          <div className="p-3 pb-0 shrink-0">
            <Card
              className={`p-3 text-xs ${statusAlert.variant === "destructive"
                  ? "bg-destructive/10 border-destructive/20 text-destructive"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                }`}
            >
              {statusAlert.title && <div className="font-semibold mb-0.5">{statusAlert.title}</div>}
              <div>{statusAlert.message}</div>
            </Card>
          </div>
        )}

        {/* Visualizer Stage Viewport */}
        <VisualizerStage
          steps={steps}
          current={current}
          active={active}
          actionColor={actionColor}
          structureType={structureType}
          variables={variables}
          parsedGraph={parsedGraph}
          currentExec={currentExec}
        />

        {/* Playback Controls */}
        <PlaybackControls
          stepsCount={steps.length}
          idx={idx}
          playing={playing}
          onStepBack={() => setIdx((i) => Math.max(i - 1, 0))}
          onTogglePlay={() => {
            if (!playing && idx >= steps.length - 1) setIdx(0);
            setPlaying(!playing);
          }}
          onStepForward={() => setIdx((i) => Math.min(i + 1, steps.length - 1))}
        />
      </div>
    </div>
  );
}
