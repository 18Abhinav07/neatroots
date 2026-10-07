import { useMemo } from "react";
import { NeatBadge } from "../../../components/ui/neat-badge";
import { StatusDot } from "../../../components/ui/status-pill";
import type { Span } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { dur } from "../../../lib/format";
import { spanKindBadge } from "../_libs/labels";

interface Row {
  span: Span;
  depth: number;
}

function treeOrder(spans: Span[]): Row[] {
  const ids = new Set(spans.map((s) => s.span_id));
  const children = new Map<string | null, Span[]>();
  for (const s of spans) {
    const parent = s.parent_span_id && ids.has(s.parent_span_id) ? s.parent_span_id : null;
    children.set(parent, [...(children.get(parent) ?? []), s]);
  }
  for (const list of children.values()) list.sort((a, b) => a.start_ms - b.start_ms);
  const out: Row[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const s of children.get(parent) ?? []) {
      out.push({ span: s, depth });
      walk(s.span_id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * The run's spans in tree order on a shared time axis. Bars are neutral; only a failed
 * span (danger) and the selected span (brand selection) carry color. A dot marks spans
 * that are evidence for an open finding.
 */
export function TraceWaterfall({ spans, flagged, selected, onSelect }: { spans: Span[]; flagged: Set<string>; selected?: string; onSelect: (id: string) => void }) {
  const rows = useMemo(() => treeOrder(spans), [spans]);
  if (!rows.length) return <p className="px-4 py-6 text-body text-muted-foreground">Spans appear here as the agent runs.</p>;
  const start = Math.min(...spans.map((s) => s.start_ms));
  const end = Math.max(...spans.map((s) => s.end_ms), start + 1);
  const total = end - start;
  return (
    <div role="tree" aria-label="Trace spans" className="text-body">
      <div className="sticky top-0 z-[var(--z-sticky)] grid grid-cols-[minmax(220px,40%)_1fr_72px] items-center border-b border-border bg-card px-4 py-1.5 text-label text-muted-foreground">
        <span>Span</span>
        <div className="relative mx-3 h-3">
          {[0, 0.5, 1].map((t) => (
            <span key={t} className={cn("absolute font-mono text-3xs text-foreground-subtle tabular-nums", t === 0 ? "left-0" : t === 1 ? "right-0" : "left-1/2 -translate-x-1/2")}>
              {t === 0 ? "0" : dur(total * t)}
            </span>
          ))}
        </div>
        <span className="text-right">Duration</span>
      </div>
      {rows.map(({ span: s, depth }) => {
        const left = ((s.start_ms - start) / total) * 100;
        const width = Math.max(0.5, (s.duration_ms / total) * 100);
        const isSel = selected === s.span_id;
        const failed = s.status_code === 2;
        const guidance = s.name === "bolts.guidance";
        const kind = spanKindBadge(s.span_kind);
        return (
          <div
            key={s.span_id}
            role="treeitem"
            aria-selected={isSel}
            aria-level={depth + 1}
            tabIndex={0}
            onClick={() => onSelect(s.span_id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(s.span_id))}
            title={s.error ?? s.output_preview ?? undefined}
            className={cn(
              "focus-ring grid h-8 cursor-pointer grid-cols-[minmax(220px,40%)_1fr_72px] items-center px-4 transition-colors motion-fast",
              isSel ? "bg-surface-strong" : "hover:bg-surface-subtle",
            )}
          >
            <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 14 }}>
              {guidance ? <NeatBadge variant="purple">Bolts</NeatBadge> : <NeatBadge variant={kind.variant}>{kind.label}</NeatBadge>}
              <span className={cn("truncate", guidance ? "text-brand-violet" : failed ? "text-danger-fg" : depth > 1 ? "text-muted-foreground" : "text-foreground")}>
                {guidance ? `Note sent to the agent: ${s.input_preview ?? ""}` : (s.tool_name ?? s.name)}
              </span>
              {s.tool_result && s.tool_result !== "success" && !failed && <span className="shrink-0 text-caption text-foreground-subtle">{s.tool_result} result</span>}
              {flagged.has(s.span_id) && <StatusDot tone="warning" label="Evidence for an open finding" />}
            </div>
            <div className="relative mx-3 h-full">
              <div
                className={cn("absolute top-1/2 h-2.5 min-w-[3px] -translate-y-1/2 rounded-sm", failed ? "bg-danger-fg" : isSel ? "bg-brand-violet" : guidance ? "bg-brand-violet/50" : "bg-chart-bar")}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </div>
            <div className="text-right font-mono text-3xs text-foreground-subtle tabular-nums">{dur(s.duration_ms)}</div>
          </div>
        );
      })}
    </div>
  );
}
