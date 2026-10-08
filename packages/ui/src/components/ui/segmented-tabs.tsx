import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SegmentedTabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * Tabs as in the Neatlogs app: no track; the active tab sits in a light bordered box.
 * `pill` is the filter-chip look. Arrow keys move between tabs.
 */
export function SegmentedTabs<T extends string>({
  value,
  onValueChange,
  items,
  label,
  size = "default",
  variant = "highlight",
  className,
}: {
  value: T;
  onValueChange: (v: T) => void;
  items: SegmentedTabItem<T>[];
  label: string;
  size?: "default" | "compact";
  variant?: "highlight" | "pill";
  className?: string;
}) {
  const enabled = items.filter((i) => !i.disabled);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || !enabled.length) return;
    e.preventDefault();
    const at = Math.max(
      0,
      enabled.findIndex((i) => i.value === value),
    );
    const next = e.key === "Home" ? 0 : e.key === "End" ? enabled.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length;
    onValueChange(enabled[next].value);
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn("flex items-center", variant === "pill" ? "gap-1.5" : "gap-1", className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={it.disabled}
            onClick={() => !active && onValueChange(it.value)}
            className={cn(
              "focus-ring inline-flex cursor-pointer items-center justify-center whitespace-nowrap transition-colors motion-fast disabled:cursor-not-allowed disabled:text-foreground-subtle",
              variant === "pill"
                ? cn(
                    "h-7 rounded-full border px-2.5 text-xs",
                    active
                      ? "border-info-border bg-info-surface font-medium text-info-fg"
                      : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                : cn(
                    "rounded-md border",
                    size === "compact" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-body",
                    active ? "border-border bg-surface-subtle font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  ),
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
