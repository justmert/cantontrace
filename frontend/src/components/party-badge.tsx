"use client";

import React, { useState, useCallback } from "react";
import { cn, formatPartyId, stringToHue } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PartyBadgeProps {
  party: string;
  variant?: "default" | "compact";
  className?: string;
}

export function PartyBadge({ party, variant = "default", className }: PartyBadgeProps) {
  const [copied, setCopied] = useState(false);
  const displayName = formatPartyId(party);
  const hue = stringToHue(displayName);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(party);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Clipboard API may not be available
      }
    },
    [party]
  );

  const avatarStyle = {
    backgroundColor: `oklch(0.75 0.1 ${hue})`,
    color: `oklch(0.25 0.05 ${hue})`,
  };

  const avatar = (
    <span
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold uppercase leading-none"
      style={avatarStyle}
    >
      {displayName.charAt(0)}
    </span>
  );

  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 text-xs transition-colors",
                copied ? "text-primary" : "text-foreground",
                className
              )}
              onClick={handleCopy}
            >
              {avatar}
              <span className="truncate">{displayName}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="z-[100] max-w-[320px] break-all font-mono text-xs"
          >
            {copied ? "Copied!" : party}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs transition-colors",
              copied
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/50 bg-muted/30 text-foreground hover:bg-muted/50",
              className
            )}
            onClick={handleCopy}
          >
            {avatar}
            <span className="truncate max-w-[120px]">{displayName}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[400px] break-all font-mono text-xs"
        >
          {copied ? (
            <span className="text-primary">Copied!</span>
          ) : (
            <span className="max-w-xs break-all font-mono text-[10px]">{party}</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
