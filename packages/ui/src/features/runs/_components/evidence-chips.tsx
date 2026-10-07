/** Span references a finding or explanation points at; each selects the span. */
export function EvidenceChips({ ids, onPick, max = 10 }: { ids: string[]; onPick: (id: string) => void; max?: number }) {
  if (!ids.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-caption text-foreground-subtle">Evidence</span>
      {ids.slice(0, max).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onPick(id)}
          title={`Show span ${id}`}
          className="focus-ring cursor-pointer rounded-sm border border-border bg-surface-subtle px-1.5 py-0.5 font-mono text-3xs text-muted-foreground hover:border-border-strong hover:text-foreground"
        >
          {id.slice(0, 8)}
        </button>
      ))}
      {ids.length > max && <span className="text-caption text-foreground-subtle">+{ids.length - max} more</span>}
    </div>
  );
}
