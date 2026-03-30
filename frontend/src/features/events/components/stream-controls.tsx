import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlayIcon,
  PauseIcon,
  Delete01Icon,
  RefreshIcon,
  WifiOff01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "../hooks";

export interface StreamControlsProps {
  status: ConnectionStatus;
  isPaused: boolean;
  eventCount: number;
  isLoadingRecent?: boolean;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onReconnect: () => void;
  onLoadRecent: () => void;
}

function StatusIndicator({ status }: { status: ConnectionStatus }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          "size-2 rounded-full",
          status === "connected" && "bg-primary",
          status === "reconnecting" && "bg-muted-foreground animate-pulse",
          status === "disconnected" && "bg-destructive"
        )}
      />
      <span
        className={cn(
          "text-xs font-medium",
          status === "connected" && "text-primary",
          status === "reconnecting" && "text-muted-foreground",
          status === "disconnected" && "text-destructive"
        )}
      >
        {status === "connected" && "Connected"}
        {status === "reconnecting" && "Reconnecting..."}
        {status === "disconnected" && "Disconnected"}
      </span>
    </div>
  );
}

export function StreamControls({
  status,
  isPaused,
  eventCount,
  isLoadingRecent,
  onPause,
  onResume,
  onClear,
  onReconnect,
  onLoadRecent,
}: StreamControlsProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Connection status */}
      <StatusIndicator status={status} />

      <div className="h-4 w-px bg-border" />

      {/* Event count */}
      <Badge variant="secondary" className="font-mono text-xs">
        {eventCount.toLocaleString()} event{eventCount !== 1 ? "s" : ""}
      </Badge>

      <div className="h-4 w-px bg-border" />

      {/* Play / Pause */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isPaused ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={isPaused ? onResume : onPause}
            >
              {isPaused ? (
                <>
                  <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" />
                  Resume
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={PauseIcon} strokeWidth={2} data-icon="inline-start" />
                  Pause
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isPaused
              ? "Resume receiving events"
              : "Pause event stream (events are buffered)"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Clear */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={onClear}
            >
              <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} data-icon="inline-start" />
              Clear
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear all events</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Load Recent */}
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={onLoadRecent}
        disabled={!!isLoadingRecent}
      >
        {isLoadingRecent ? (
          <Spinner className="size-3.5" data-icon="inline-start" />
        ) : (
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} data-icon="inline-start" />
        )}
        {isLoadingRecent ? "Loading..." : "Load Recent"}
      </Button>

      {/* Reconnect (shown when disconnected) */}
      {status === "disconnected" && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-destructive"
          onClick={onReconnect}
        >
          <HugeiconsIcon icon={WifiOff01Icon} strokeWidth={2} data-icon="inline-start" />
          Reconnect
        </Button>
      )}
    </div>
  );
}
