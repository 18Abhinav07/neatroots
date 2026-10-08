import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** A bordered container with an optional header row. Flat: no shadow, so data stays the figure. */
export function Panel({
  title,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border bg-card", className)}>
      {(title || actions || meta) && (
        <header className="flex min-h-10 items-center justify-between gap-4 border-b border-border/60 px-4 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {title && <h2 className="min-w-0 truncate text-body-medium text-foreground">{title}</h2>}
            {meta && <span className="shrink-0 text-caption text-foreground-subtle">{meta}</span>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-eyebrow text-muted-foreground", className)}>{children}</div>;
}
