import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** A small uppercase label over a group: rail groups, table headers. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-eyebrow text-muted-foreground", className)}>{children}</div>;
}

/** A section's title with an optional description and actions; type and space, no box. */
export function SectionHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-body-medium text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A label on the left, its value on the right: one 32px row. */
export function PropertyRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-8 min-w-0 items-center justify-between gap-4 rounded-md px-1.5 transition-colors motion-fast hover:bg-surface-subtle", className)}>
      <span className="shrink-0 text-body text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-1.5 truncate text-right text-body text-foreground tabular-nums">{children}</span>
    </div>
  );
}
