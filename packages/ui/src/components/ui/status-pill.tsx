import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { cn } from "../../lib/cn";

/**
 * A semantic-STATE pill: an outcome that changes over time (run ok/failed, finding
 * open/resolved, note delivered). Fixed categories use NeatBadge instead.
 */
const pill = tv({
  base: "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
  variants: {
    tone: {
      success: "bg-success-surface text-success-fg",
      warning: "bg-warning-surface text-warning-fg",
      info: "bg-info-surface text-info-fg",
      danger: "bg-danger-surface text-danger-fg",
      neutral: "bg-surface-subtle text-muted-foreground",
    },
    size: { default: "px-2.5 py-0.5 text-xs", sm: "px-2 py-0 text-2xs leading-4" },
    bordered: { true: "border" },
  },
  compoundVariants: [
    { bordered: true, tone: "success", class: "border-success-border" },
    { bordered: true, tone: "warning", class: "border-warning-border" },
    { bordered: true, tone: "info", class: "border-info-border" },
    { bordered: true, tone: "danger", class: "border-danger-border" },
    { bordered: true, tone: "neutral", class: "border-border" },
  ],
  defaultVariants: { tone: "neutral", size: "default" },
});

const dot = tv({
  base: "size-1.5 shrink-0 rounded-full",
  variants: {
    tone: { success: "bg-success-fg", warning: "bg-warning-fg", info: "bg-info-fg", danger: "bg-danger-fg", neutral: "bg-foreground-subtle" },
  },
});

export type Tone = "success" | "warning" | "info" | "danger" | "neutral";

export function StatusPill({
  tone = "neutral",
  size = "default",
  bordered,
  children,
  className,
  showDot = true,
}: {
  tone?: Tone;
  size?: "default" | "sm";
  bordered?: boolean;
  children: ReactNode;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <span className={cn(pill({ tone, size, bordered }), className)}>
      {showDot && <span aria-hidden className={dot({ tone })} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral", label }: { tone?: Tone; label: string }) {
  return <span role="img" aria-label={label} title={label} className={cn(dot({ tone }), "inline-block size-2")} />;
}
