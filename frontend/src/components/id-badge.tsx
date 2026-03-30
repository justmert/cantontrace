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
        "inline cursor-pointer rounded-sm px-1 py-0.5 text-xs transition-colors",
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
    <Link to={href} className="inline no-underline">
      {inner}
    </Link>
  ) : (
    inner
  );

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className="inline">{content}</span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={4}
          collisionPadding={8}
          className="z-[100] max-w-[320px] break-all font-mono text-xs"
        >
          {copied ? "Copied!" : id}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
