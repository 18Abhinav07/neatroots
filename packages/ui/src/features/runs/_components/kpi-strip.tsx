import type { Run } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { dur, num } from "../../../lib/format";

/** Left-aligned label above one numeral per tile, tabular figures so tiles align. */
export function KpiStrip({ run, openFindings }: { run: Run; openFindings: number }) {
  const tiles: { label: string; value: string; tone?: "warning" }[] = [
    { label: "Duration", value: run.status === "running" ? "Running" : dur(run.duration_ms) },
    { label: "Spans", value: num(run.span_count) },
    { label: "LLM calls", value: num(run.llm_calls) },
    { label: "Tool calls", value: num(run.tool_calls) },
    { label: "Tokens", value: num(run.total_tokens) },
    { label: "Open findings", value: num(openFindings), tone: openFindings ? "warning" : undefined },
  ];
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-card elevation-card lg:grid-cols-6">
      {tiles.map((t, i) => (
        <div key={t.label} className={cn("flex flex-col gap-1.5 px-4 py-3", i > 0 && "border-l border-border", i === 3 && "max-lg:border-l-0", i >= 3 && "max-lg:border-t")}>
          <span className="text-label text-muted-foreground">{t.label}</span>
          <span className={cn("text-heading tabular-nums", t.tone === "warning" ? "text-warning-fg" : "text-foreground")}>{t.value}</span>
        </div>
      ))}
    </div>
  );
}
