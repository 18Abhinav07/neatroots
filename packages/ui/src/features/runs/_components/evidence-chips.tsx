/** Spans a finding or explanation points at, by name; each selects the span in the trace. */
export function EvidenceChips({ ids, names, onPick, max = 6 }: { ids: string[]; names?: Map<string, string>; onPick: (id: string) => void; max?: number }) {
  if (!ids.length) return null;
  // Number repeated names so two LLM calls with the same name stay distinguishable.
  const seen = new Map<string, number>();
  const label = (id: string) => {
    const name = names?.get(id) ?? id.slice(0, 8);
    const total = ids.filter((x) => (names?.get(x) ?? x.slice(0, 8)) === name).length;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return total > 1 ? `${name} #${n}` : name;
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-caption text-foreground-subtle">Seen in</span>
      {ids.slice(0, max).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onPick(id)}
          title={`Show span ${id}`}
          className="focus-ring max-w-56 cursor-pointer truncate rounded-sm border border-border bg-surface-subtle px-1.5 py-0.5 font-mono text-3xs text-muted-foreground hover:border-border-strong hover:text-foreground"
        >
          {label(id)}
        </button>
      ))}
      {ids.length > max && <span className="text-caption text-foreground-subtle">+{ids.length - max} more</span>}
    </div>
  );
}
