"use client";

import React, { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  label?: string;
  size?: "xs" | "sm" | "default";
  className?: string;
}

export function CopyButton({ text, label, size = "xs", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard API may not be available
      }
    },
    [text]
  );

  const iconSize = size === "xs" ? "size-3" : size === "sm" ? "size-3.5" : "size-4";
  const buttonSize = size === "xs" ? "icon-xs" : size === "sm" ? "icon-sm" : "icon";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={buttonSize}
            onClick={handleCopy}
            className={cn("shrink-0", className)}
            aria-label={label ?? "Copy to clipboard"}
          >
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Copy01Icon}
              strokeWidth={2}
              className={cn(iconSize, copied ? "text-primary" : "text-muted-foreground")}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {copied ? "Copied!" : "Copy"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
