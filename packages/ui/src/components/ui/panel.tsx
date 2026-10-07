import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** An elevated container with an optional header row. */
export function Panel({ title, meta, actions, children, className, bodyClassName }: { title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-card elevation-card", className)}>
      {(title || actions || meta) && (
        <header className="flex min-h-11 items-center justify-between gap-4 border-b border-border px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {title && <h2 className="text-title text-foreground">{title}</h2>}
            {meta && <span className="text-caption text-foreground-subtle">{meta}</span>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-micro text-foreground-subtle", className)}>{children}</div>;
}
