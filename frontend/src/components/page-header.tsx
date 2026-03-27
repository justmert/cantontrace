import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon: IconSvgElement;
  title: string;
  subtitle?: string;
  children?: React.ReactNode; // Right-side actions slot
  className?: string;
}

export function PageHeader({ icon, title, subtitle, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border/50 px-6 py-2.5",
        className
      )}
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.5} className="size-4.5 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h1 className="text-base font-semibold leading-tight">{title}</h1>
        {subtitle && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          </>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
