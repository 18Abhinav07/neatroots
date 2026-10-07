import { cn } from "../../lib/cn";

export function SegmentedTabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "focus-ring h-6 cursor-pointer rounded-sm px-2.5 text-label transition-colors motion-fast",
            value === it.value ? "bg-card text-foreground elevation-card" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
