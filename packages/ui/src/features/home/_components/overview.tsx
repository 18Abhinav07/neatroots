import { StatusPill, type Tone } from "../../../components/ui/status-pill";
import type { Insights } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { dur, num } from "../../../lib/format";

export const PERIOD: Record<string, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };

const rate = (n: number, d: number) => (d ? n / d : 0);

/** A change against the previous period. `worse` says which direction is bad, if either is. */
function Delta({ now, before, worse, unit = "", percentPoints }: { now: number; before: number; worse?: "up" | "down"; unit?: string; percentPoints?: boolean }) {
  const diff = now - before;
  if (!diff) return <span className="text-caption text-foreground-subtle">same as before</span>;
  const shown = percentPoints ? `${Math.abs(Math.round(diff * 100))} pts` : `${Math.abs(Math.round(diff)).toLocaleString()}${unit}`;
  const tone: Tone = !worse ? "neutral" : diff > 0 === (worse === "up") ? "warning" : "success";
  return (
    <StatusPill tone={tone} showDot={false}>
      {diff > 0 ? "↑" : "↓"} {shown}
    </StatusPill>
  );
}

/** Four numbers for the period, each against the period before it. */
export function Kpis({ data }: { data: Insights }) {
  const t = data.totals;
  const p = data.previous;
  const hadBefore = p.runs > 0;
  const tiles = [
    {
      label: "Runs",
      value: num(t.runs),
      sub: hadBefore ? `${num(p.runs)} the ${PERIOD[data.window.key]} before` : "none the period before",
      delta: hadBefore && <Delta now={t.runs} before={p.runs} />,
    },
    {
      label: "Runs with problems",
      value: `${Math.round(rate(t.with_problems, t.runs) * 100)}%`,
      sub: `${num(t.with_problems)} of ${num(t.runs)}`,
      delta: hadBefore && <Delta now={rate(t.with_problems, t.runs)} before={rate(p.with_problems, p.runs)} worse="up" percentPoints />,
    },
    {
      label: "Failed runs",
      value: num(t.failed),
      sub: t.failed ? "ended with an error or were cut off" : "none ended with an error",
      delta: hadBefore && <Delta now={t.failed} before={p.failed} worse="up" />,
    },
    {
      label: "Median run",
      value: dur(t.p50_ms),
      sub: t.p95_ms !== null ? `95% under ${dur(t.p95_ms)}` : "no finished runs",
      delta: hadBefore && t.p50_ms !== null && p.p50_ms !== null && <Delta now={t.p50_ms} before={p.p50_ms} unit=" ms" />,
    },
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card elevation-card lg:grid-cols-4">
      {tiles.map((x, i) => (
        <div
          key={x.label}
          className={cn(
            "flex flex-col gap-1.5 px-4 py-3",
            i > 0 && "lg:border-l lg:border-border",
            i % 2 === 1 && "max-lg:border-l max-lg:border-border",
            i >= 2 && "max-lg:border-t max-lg:border-border",
          )}
        >
          <span className="text-label text-muted-foreground">{x.label}</span>
          <span className="flex items-center gap-2">
            <span className="text-heading text-foreground tabular-nums">{x.value}</span>
            {x.delta}
          </span>
          <span className="text-caption text-foreground-subtle tabular-nums">{x.sub}</span>
        </div>
      ))}
    </div>
  );
}

function bucketLabel(ms: number, hourly: boolean): string {
  const d = new Date(ms);
  return hourly ? d.toLocaleTimeString(undefined, { hour: "numeric" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Runs per hour or day; the part with problems in warning, the rest neutral. */
export function Activity({ data }: { data: Insights }) {
  const hourly = data.window.bucket_ms < 86_400_000;
  const max = Math.max(1, ...data.buckets.map((b) => b.runs));
  const first = data.buckets[0];
  const last = data.buckets[data.buckets.length - 1];
  return (
    <section aria-labelledby="activity" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="activity" className="text-title text-foreground">
          Runs over time
        </h2>
        <span className="flex items-center gap-3 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-xs bg-warning-fg" />
            with problems
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-xs bg-chart-bar" />
            no problems
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div role="img" aria-label={`Runs per ${hourly ? "hour" : "day"}`} className="flex h-24 items-end gap-1 border-b border-border">
          {data.buckets.map((b) => {
            const clean = Math.max(0, b.runs - b.with_problems);
            return (
              <div
                key={b.start_ms}
                className="mx-auto flex h-full w-full max-w-10 min-w-0 flex-1 flex-col justify-end"
                title={`${bucketLabel(b.start_ms, hourly)}: ${b.runs} runs, ${b.with_problems} with problems, ${b.failed} failed`}
              >
                {b.with_problems > 0 && <div className="w-full rounded-t-xs bg-warning-fg" style={{ height: `${(b.with_problems / max) * 100}%` }} />}
                {clean > 0 && <div className={cn("w-full bg-chart-bar", b.with_problems === 0 && "rounded-t-xs")} style={{ height: `${(clean / max) * 100}%` }} />}
                {b.runs === 0 && <div className="h-px w-full bg-border" />}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-caption text-foreground-subtle tabular-nums">
          <span>{first && bucketLabel(first.start_ms, hourly)}</span>
          <span>{last && (hourly ? "now" : "today")}</span>
        </div>
      </div>
    </section>
  );
}
