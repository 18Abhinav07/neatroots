import { cn } from "../../lib/cn";

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "focus-ring relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full border transition-colors motion-fast disabled:opacity-50",
        checked ? "border-transparent bg-inverse-surface" : "border-border bg-surface-strong",
      )}
    >
      <span className={cn("absolute left-0.5 size-3.5 rounded-full bg-card elevation-raised transition-transform motion-fast", checked && "translate-x-3.5")} />
    </button>
  );
}
