import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { cn } from "../../lib/cn";

/** A business-CATEGORY badge: a fixed label (span kind, check source, rule vs question). Not a verdict. */
const badge = tv({
  base: "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-label whitespace-nowrap",
  variants: {
    variant: {
      green: "bg-badge-green-bg text-badge-green-text",
      red: "bg-badge-red-bg text-badge-red-text",
      amber: "bg-badge-amber-bg text-badge-amber-text",
      blue: "bg-badge-blue-bg text-badge-blue-text",
      purple: "bg-badge-purple-bg text-badge-purple-text",
      tag: "bg-badge-tag-bg text-badge-tag-text",
      outline: "border border-border text-muted-foreground",
    },
  },
  defaultVariants: { variant: "tag" },
});

export type BadgeVariant = "green" | "red" | "amber" | "blue" | "purple" | "tag" | "outline";

export function NeatBadge({ variant = "tag", children, className, title }: { variant?: BadgeVariant; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn(badge({ variant }), className)} title={title}>
      {children}
    </span>
  );
}
