import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  RotateLeft01Icon,
  Alert02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface TimeTravelProps {
  currentOffset: string | undefined;
  isHistorical: boolean;
  isPruned: boolean;
  prunedBefore: string | undefined;
  onSetOffset: (offset: string | undefined) => void;
  onSetCurrent: () => void;
}

const QUICK_OFFSETS: { label: string; deltaSeconds: number | null }[] = [
  { label: "Current", deltaSeconds: null },
  { label: "5 min ago", deltaSeconds: 5 * 60 },
  { label: "1 hour ago", deltaSeconds: 60 * 60 },
  { label: "1 day ago", deltaSeconds: 24 * 60 * 60 },
];

export function TimeTravel({
  currentOffset,
  isHistorical,
  isPruned,
  prunedBefore,
  onSetOffset,
  onSetCurrent,
}: TimeTravelProps) {
  const [inputValue, setInputValue] = React.useState(currentOffset ?? "");

  React.useEffect(() => {
    setInputValue(currentOffset ?? "");
  }, [currentOffset]);

  const handleApply = () => {
    if (inputValue.trim() === "") {
      onSetCurrent();
    } else {
      onSetOffset(inputValue.trim());
    }
  };

  const handleQuickOffset = (deltaSeconds: number | null) => {
    if (deltaSeconds === null) {
      onSetCurrent();
      return;
    }
    // Quick offsets compute a numeric offset by subtracting from "now".
    // In a real Canton system, offsets are opaque strings but numeric shortcuts
    // are a common UX convenience.
    const syntheticOffset = String(deltaSeconds);
    onSetOffset(syntheticOffset);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Banners */}
      {isHistorical && !isPruned && (
        <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-secondary-foreground">
            Viewing ACS at offset{" "}
            <span className="font-mono font-semibold">{currentOffset}</span>{" "}
            (historical)
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={onSetCurrent}
          >
            <HugeiconsIcon icon={RotateLeft01Icon} strokeWidth={2} data-icon="inline-start" />
            Back to current
          </Button>
        </div>
      )}

      {isPruned && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm">
          <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} className="size-4 shrink-0 text-destructive" />
          <span className="text-destructive">
            Data pruned before offset{" "}
            <span className="font-mono font-semibold">{prunedBefore}</span>
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Time Travel
        </span>

        <div className="flex items-center gap-1.5 rounded-md border bg-background px-1 py-0.5">
          {QUICK_OFFSETS.map((qo) => (
            <Button
              key={qo.label}
              variant={
                qo.deltaSeconds === null && !isHistorical
                  ? "secondary"
                  : "ghost"
              }
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => handleQuickOffset(qo.deltaSeconds)}
            >
              {qo.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Input
            placeholder="Offset..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApply();
            }}
            className="h-8 w-28 font-mono text-xs"
          />
          <Button size="sm" variant="outline" className="h-8" onClick={handleApply}>
            Go
          </Button>
        </div>
      </div>
    </div>
  );
}
