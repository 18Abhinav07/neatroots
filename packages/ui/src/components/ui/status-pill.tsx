import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { cn } from "../../lib/cn";

/**
 * A semantic-STATE pill: an outcome that changes over time (run ok/failed, finding
 * open/resolved, note delivered). Fixed categories use NeatBadge instead.
 */
const pill = tv({
  base: "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-label whitespace-nowrap",
  variants: {
    tone: {
      success: "border-success-border bg-success-surface text-success-fg",
      warning: "border-warning-border bg-warning-surface text-warning-fg",
      info: "border-info-border bg-info-surface text-info-fg",
      danger: "border-danger-border bg-danger-surface text-danger-fg",
      neutral: "border-border bg-surface-subtle text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

const dot = tv({
  base: "size-1.5 rounded-full",
  variants: {
    tone: { success: "bg-success-fg", warning: "bg-warning-fg", info: "bg-info-fg", danger: "bg-danger-fg", neutral: "bg-foreground-subtle" },
  },
});

export type Tone = "success" | "warning" | "info" | "danger" | "neutral";

export function StatusPill({ tone = "neutral", children, className, showDot = true }: { tone?: Tone; children: ReactNode; className?: string; showDot?: boolean }) {
  return (
    <span className={cn(pill({ tone }), className)}>
      {showDot && <span aria-hidden className={dot({ tone })} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral", label }: { tone?: Tone; label: string }) {
  return <span role="img" aria-label={label} title={label} className={cn(dot({ tone }), "inline-block size-2")} />;
}
