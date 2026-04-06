import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  AlertCircleIcon,
  ArrowTurnBackwardIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TimeTravelProps {
  currentOffset: string | undefined;
  isHistorical: boolean;
  isPruned: boolean;
  prunedBefore: string | undefined;
  onSetOffset: (offset: string | undefined) => void;
  onSetCurrent: () => void;
}

const QUICK_PRESETS: { label: string; deltaSeconds: number }[] = [
  { label: "5 min ago", deltaSeconds: 5 * 60 },
  { label: "15 min ago", deltaSeconds: 15 * 60 },
  { label: "1 hour ago", deltaSeconds: 60 * 60 },
];

/** Try to format a numeric offset as a human-readable relative time. */
function formatOffsetLabel(offset: string): string {
  const n = Number(offset);
  if (isNaN(n) || n <= 0) return `offset ${offset}`;
  if (n < 60) return `${n}s ago`;
  if (n < 3600) return `${Math.round(n / 60)}m ago`;
  return `${(n / 3600).toFixed(1)}h ago`;
}

export function TimeTravel({
  currentOffset,
  isHistorical,
  isPruned,
  prunedBefore,
  onSetOffset,
  onSetCurrent,
}: TimeTravelProps) {
  const [customInput, setCustomInput] = React.useState("");
  const [showCustom, setShowCustom] = React.useState(false);

  const handleApplyCustom = () => {
    const val = customInput.trim();
    if (val === "") {
      onSetCurrent();
      setShowCustom(false);
    } else {
      onSetOffset(val);
    }
  };

  const handlePreset = (deltaSeconds: number) => {
    setShowCustom(false);
    onSetOffset(String(deltaSeconds));
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Controls row */}
      <div className="flex items-center gap-2 px-1 py-1.5">
        <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Time Travel</span>

        {/* Preset buttons */}
        {QUICK_PRESETS.map((preset) => (
          <Button
            key={preset.deltaSeconds}
            size="sm"
            variant="outline"
            className={cn(
              "h-7 px-2.5 text-xs",
              isHistorical && currentOffset === String(preset.deltaSeconds) &&
                "border-primary/40 bg-primary/10 text-primary"
            )}
            onClick={() => handlePreset(preset.deltaSeconds)}
          >
            {preset.label}
          </Button>
        ))}

        {/* Custom offset toggle */}
        <Button
          size="sm"
          variant={showCustom ? "secondary" : "outline"}
          className="h-7 px-2.5 text-xs"
          onClick={() => setShowCustom(!showCustom)}
        >
          Custom
        </Button>

        {/* Custom offset input */}
        {showCustom && (
          <>
            <Input
              placeholder="Offset value..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApplyCustom();
              }}
              className="h-7 w-32 font-mono text-xs"
            />
            <Button size="sm" variant="outline" className="h-7" onClick={handleApplyCustom}>
              Go
            </Button>
          </>
        )}

        {/* Back to Current button -- only when viewing historical */}
        {isHistorical && (
          <Button
            size="sm"
            variant="default"
            className="ml-auto h-7 gap-1 px-2.5 text-xs"
            onClick={onSetCurrent}
          >
            <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} className="size-3.5" />
            Back to Current
          </Button>
        )}
      </div>

      {/* Historical status banner */}
      {isHistorical && !isPruned && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-1.5 text-xs">
          <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-amber-700 dark:text-amber-400">
            Viewing ACS at{" "}
            <span className="font-mono font-semibold">
              {formatOffsetLabel(currentOffset ?? "")}
            </span>{" "}
            <span className="text-amber-700/60 dark:text-amber-400/60">
              (offset: {currentOffset})
            </span>
          </span>
          <span className="text-amber-700/60 dark:text-amber-400/60">&middot;</span>
          <button
            className="font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
            onClick={onSetCurrent}
          >
            Back to current
          </button>
        </div>
      )}

      {/* Pruned banner */}
      {isPruned && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs">
          <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} className="size-3.5 shrink-0 text-destructive" />
          <span className="text-destructive">
            Data pruned before offset{" "}
            <span className="font-mono font-semibold">{prunedBefore}</span>
          </span>
        </div>
      )}
    </div>
  );
}
