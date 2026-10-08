import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useState, type ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import { Icon } from "../../../components/ui/icon";
import { SectionLabel } from "../../../components/ui/panel";
import type { Insights } from "../../../lib/api";
import { cn } from "../../../lib/cn";

interface Item {
  key: string;
  title: string;
  detail: string;
  trend?: { text: string; tone: "bad" | "good" | "neutral" };
  href?: string;
  mono?: boolean;
}

interface Group {
  label: string;
  items: Item[];
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function runsTrend(now: number, before: number, hadBefore: boolean): Item["trend"] {
  if (!hadBefore) return undefined;
  if (!before) return { text: "new", tone: "bad" };
  if (now > before) return { text: `up from ${before}`, tone: "bad" };
  if (now < before) return { text: `down from ${before}`, tone: "good" };
  return undefined;
}

function rateTrend(failNow: number, callsNow: number, failBefore: number, callsBefore: number): Item["trend"] {
  if (!callsBefore) return undefined;
  const a = pct(failNow, callsNow);
  const b = pct(failBefore, callsBefore);
  if (a > b) return { text: `up from ${b}%`, tone: "bad" };
  if (a < b) return { text: `down from ${b}%`, tone: "good" };
  return undefined;
}

/** What is going wrong, from whatever checks, tools and models the agents actually used. */
function attention(d: Insights): Group[] {
  const hadBefore = d.previous.runs > 0;
  const multi = d.projects.length > 1;
  return [
    {
      label: "Problems",
      items: d.problems.map((p) => ({
        key: `p:${p.check_id}`,
        title: p.title,
        detail: `in ${p.runs} of ${d.totals.runs} runs${multi ? ` · ${p.projects.join(", ")}` : ""}${p.dismissed ? ` · ${p.dismissed} dismissed as wrong` : ""}`,
        trend: runsTrend(p.runs, p.prev_runs, hadBefore),
        href: `#/runs?check=${encodeURIComponent(p.check_id)}&label=${encodeURIComponent(p.title)}`,
      })),
    },
    {
      label: "Tools",
      items: d.tools
        .filter((t) => t.failures > 0 || t.empty > 0)
        .sort((a, b) => pct(b.failures + b.empty, b.calls) - pct(a.failures + a.empty, a.calls) || b.calls - a.calls)
        .map((t) => ({
          key: `t:${t.name}`,
          title: t.name,
          mono: true,
          detail: [t.failures ? `failed ${t.failures} of ${t.calls} calls (${pct(t.failures, t.calls)}%)` : null, t.empty ? `${t.empty} empty or partial results` : null]
            .filter(Boolean)
            .join(" · "),
          trend: rateTrend(t.failures, t.calls, t.prev_failures, t.prev_calls),
        })),
    },
    {
      label: "Models",
      items: d.models
        .filter((m) => m.errors > 0)
        .map((m) => ({ key: `m:${m.name}`, title: m.name, mono: true, detail: `errors on ${m.errors} of ${m.calls} calls (${pct(m.errors, m.calls)}%)` })),
    },
  ].filter((g) => g.items.length);
}

/** What is holding up, by the same measures. A tool or model needs a few calls before it counts. */
function working(d: Insights): Group[] {
  return [
    {
      label: "Projects",
      items: d.projects
        .filter((p) => p.runs > 0 && p.with_problems === 0 && p.failed === 0)
        .map((p) => ({ key: `pr:${p.name}`, title: p.name, detail: `${p.runs} runs, none with problems`, href: `#/runs?project=${encodeURIComponent(p.name)}` })),
    },
    {
      label: "No longer seen",
      items: d.gone.map((g) => ({ key: `g:${g.check_id}`, title: g.title, detail: `in ${g.prev_runs} runs the period before, none now` })),
    },
    {
      label: "Tools",
      items: d.tools
        .filter((t) => t.failures === 0 && t.empty === 0 && t.calls >= 3)
        .map((t) => ({ key: `t:${t.name}`, title: t.name, mono: true, detail: `${t.calls} calls, all returned data` })),
    },
    {
      label: "Models",
      items: d.models.filter((m) => m.errors === 0 && m.calls >= 3).map((m) => ({ key: `m:${m.name}`, title: m.name, mono: true, detail: `${m.calls} calls, no errors` })),
    },
    {
      label: "Checks that found nothing",
      items: d.passing.map((c) => ({ key: `c:${c.check_id}`, title: c.title, detail: `checked ${c.runs} run${c.runs === 1 ? "" : "s"}` })),
    },
  ].filter((g) => g.items.length);
}

function Row({ item, tone }: { item: Item; tone: "bad" | "good" }) {
  const body = (
    <>
      <Icon icon={tone === "bad" ? Alert02Icon : CheckmarkCircle02Icon} size="xs" className={cn("mt-0.5 shrink-0", tone === "bad" ? "text-warning-fg" : "text-success-fg")} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("truncate text-body text-foreground", item.mono && "font-mono text-xs")} title={item.title}>
          {item.title}
        </span>
        <span className="text-caption text-muted-foreground tabular-nums">{item.detail}</span>
      </span>
      {item.trend && (
        <span
          className={cn(
            "shrink-0 text-caption tabular-nums",
            item.trend.tone === "bad" ? "text-warning-fg" : item.trend.tone === "good" ? "text-success-fg" : "text-foreground-subtle",
          )}
        >
          {item.trend.text}
        </span>
      )}
    </>
  );
  return item.href ? (
    <a href={item.href} className="focus-ring -mx-2 flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors motion-fast hover:bg-surface-subtle">
      {body}
    </a>
  ) : (
    <div className="flex items-start gap-2.5 py-1.5">{body}</div>
  );
}

function Column({ title, groups, tone, empty }: { title: string; groups: Group[]; tone: "bad" | "good"; empty: ReactNode }) {
  const [all, setAll] = useState(false);
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const LIMIT = 4;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 elevation-card">
      <h2 className="flex items-baseline gap-2 text-title text-foreground">
        {title}
        {total > 0 && <span className="text-caption text-foreground-subtle tabular-nums">{total}</span>}
      </h2>
      {total === 0 ? (
        <p className="text-body text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col">
              <SectionLabel className="mb-0.5">{g.label}</SectionLabel>
              {(all ? g.items : g.items.slice(0, LIMIT)).map((it) => (
                <Row key={it.key} item={it} tone={tone} />
              ))}
              {!all && g.items.length > LIMIT && <span className="py-1 text-caption text-foreground-subtle">+{g.items.length - LIMIT} more</span>}
            </div>
          ))}
          {groups.some((g) => g.items.length > LIMIT) && (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
                {all ? "Show fewer" : "Show all"}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function Health({ data }: { data: Insights }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Column title="Needs attention" groups={attention(data)} tone="bad" empty="Nothing failed and no check found a problem in this period." />
      <Column title="Working well" groups={working(data)} tone="good" empty="Nothing has a clean record yet in this period. Tools and models need a few calls before they count." />
    </div>
  );
}
