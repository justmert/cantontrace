"use client";

import React, { useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { cn, truncateId } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface IdBadgeProps {
  id: string;
  truncateLen?: number;
  href?: string;
  className?: string;
  monospace?: boolean;
}

export function IdBadge({
  id,
  truncateLen = 10,
  href,
  className,
  monospace = true,
}: IdBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      if (href) return; // Let link handle the click
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Clipboard API may not be available
      }
    },
    [id, href]
  );

  const display = truncateId(id, truncateLen);

  const inner = (
    <span
      className={cn(
        "inline-flex cursor-pointer items-center rounded-sm px-1 py-0.5 text-xs transition-colors",
        monospace && "font-mono",
        copied
          ? "bg-primary/15 text-primary"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
        className
      )}
      onClick={href ? undefined : handleCopy}
    >
      {display}
    </span>
  );

  const content = href ? (
    <Link to={href} className="no-underline">
      {inner}
    </Link>
  ) : (
    inner
  );

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[400px] break-all font-mono text-xs"
        >
          {copied ? (
            <span className="text-primary">Copied!</span>
          ) : (
            <>
              <span className="text-muted-foreground">Click to copy: </span>
              {id}
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
