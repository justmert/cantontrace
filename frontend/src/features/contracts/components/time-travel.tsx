import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TimeTravelProps {
  currentOffset: string | undefined;
  isHistorical: boolean;
  isPruned: boolean;
  prunedBefore: string | undefined;
  onSetOffset: (offset: string | undefined) => void;
  onSetCurrent: () => void;
}

const QUICK_OFFSETS: { label: string; value: string; deltaSeconds: number | null }[] = [
  { label: "Current", value: "__current__", deltaSeconds: null },
  { label: "5 min ago", value: "__5m__", deltaSeconds: 5 * 60 },
  { label: "1 hour ago", value: "__1h__", deltaSeconds: 60 * 60 },
  { label: "1 day ago", value: "__1d__", deltaSeconds: 24 * 60 * 60 },
  { label: "Custom", value: "__custom__", deltaSeconds: -1 },
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
  const [showCustom, setShowCustom] = React.useState(false);

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

  const handleQuickSelect = (value: string) => {
    const qo = QUICK_OFFSETS.find((o) => o.value === value);
    if (!qo) return;
    if (qo.value === "__custom__") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    if (qo.deltaSeconds === null) {
      onSetCurrent();
    } else {
      onSetOffset(String(qo.deltaSeconds));
    }
  };

  // Determine current dropdown value
  const dropdownValue = showCustom
    ? "__custom__"
    : isHistorical
      ? "__custom__"
      : "__current__";

  return (
    <div className="flex flex-col gap-0">
      {/* Controls — single line */}
      <div className="flex h-11 items-center gap-2 px-1">
        <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />

        <Select value={dropdownValue} onValueChange={handleQuickSelect}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Current" />
          </SelectTrigger>
          <SelectContent>
            {QUICK_OFFSETS.map((qo) => (
              <SelectItem key={qo.value} value={qo.value}>
                {qo.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(showCustom || isHistorical) && (
          <>
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
          </>
        )}
      </div>

      {/* Historical banner */}
      {isHistorical && !isPruned && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-1.5 text-xs">
          <span className="text-amber-700 dark:text-amber-400">
            Viewing ACS at offset{" "}
            <span className="font-mono font-semibold">{currentOffset}</span>{" "}
            (historical)
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
