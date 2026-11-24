import React from "react";
import { Play, Pause, StepForward, StepBack } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlaybackControlsProps {
  stepsCount: number;
  idx: number;
  playing: boolean;
  onStepBack: () => void;
  onTogglePlay: () => void;
  onStepForward: () => void;
}

export function PlaybackControls({
  stepsCount,
  idx,
  playing,
  onStepBack,
  onTogglePlay,
  onStepForward,
}: PlaybackControlsProps) {
  const hasSteps = stepsCount > 0;
  return (
    <div
      className="shrink-0 border-t border-border bg-card/80 backdrop-blur flex items-center justify-center px-2 pt-1"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
    >
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={onStepBack}
          disabled={!hasSteps || idx <= 0}
          aria-label="Step backward"
        >
          <StepBack className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          className="h-9 w-9"
          onClick={onTogglePlay}
          disabled={!hasSteps}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={onStepForward}
          disabled={!hasSteps || idx >= stepsCount - 1}
          aria-label="Step forward"
        >
          <StepForward className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

