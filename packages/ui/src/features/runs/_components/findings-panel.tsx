import { AiBrain01Icon, ArrowDown01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Icon } from "../../../components/ui/icon";
import { StatusPill } from "../../../components/ui/status-pill";
import type { Explanation, Finding, Plan } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { pct } from "../../../lib/format";
import { FINDING_STATE } from "../_libs/labels";
import { EvidenceChips } from "./evidence-chips";
import { ExplanationBlock } from "./insight-panels";

const ORDER = { raised: 0, active: 1, resolved: 2, dismissed: 3, failed: 4 } as const;

const isOpen = (f: Finding) => f.status === "raised" || f.status === "active";

/**
 * What broke in this run, most important first. Each problem shows its title and one line of
 * cause; the fix, the evidence and the check's own numbers open on demand.
 */
export function Problems({
  findings,
  plan,
  running,
  explanation,
  names,
  onPick,
  onSetStatus,
  onInvestigate,
  investigating,
}: {
  findings: Finding[];
  plan: Plan | null;
  running: boolean;
  explanation: Explanation | null;
  names: Map<string, string>;
  onPick: (id: string) => void;
  onSetStatus: (id: string, status: string) => void;
  onInvestigate: (id: string) => void;
  investigating?: string;
}) {
  const live = findings
    .filter((f) => f.status !== "failed")
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.triage_score ?? 0) - (a.triage_score ?? 0) || (b.probability ?? 1) - (a.probability ?? 1));
  const failed = findings.filter((f) => f.status === "failed");
  const open = live.filter(isOpen);
  const [expanded, setExpanded] = useState<string | undefined>(open[0]?.id);
  const checked = plan ? `${plan.check_ids.length} questions${plan.created_by === "planner" ? " chosen for this agent" : ""}, plus rules on every span` : undefined;

  return (
    <section aria-labelledby="problems" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="problems" className="text-eyebrow text-muted-foreground">
          {open.length ? `Problems · ${open.length}` : "Problems"}
        </h2>
        {checked && <span className="text-caption text-foreground-subtle">{checked}</span>}
      </div>

      {explanation && (
        <div className="flex flex-col gap-2.5 rounded-lg bg-surface-subtle px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-label text-muted-foreground">
            <Icon icon={AiBrain01Icon} size="xs" className="text-brand-violet" />
            Likely cause
            <span className="text-foreground-subtle">· {explanation.model ?? "local LLM"}</span>
          </span>
          <ExplanationBlock exp={explanation} names={names} onPick={onPick} />
        </div>
      )}

      {live.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-body text-muted-foreground">
          <Icon icon={CheckmarkCircle02Icon} size="sm" className="text-success-fg" />
          {running ? "Nothing found yet. Bolt checks each span as it arrives." : "Nothing found. Every check that ran on this run passed."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
          {live.map((f) => (
            <ProblemRow
              key={f.id}
              f={f}
              names={names}
              expanded={expanded === f.id}
              onToggle={() => setExpanded(expanded === f.id ? undefined : f.id)}
              onPick={onPick}
              onSetStatus={onSetStatus}
              onInvestigate={onInvestigate}
              investigating={investigating === f.id}
            />
          ))}
        </ul>
      )}

      {failed.length > 0 && (
        <details className="text-caption text-muted-foreground">
          <summary className="cursor-pointer">
            {failed.length} check{failed.length > 1 ? "s" : ""} could not run. A model error never counts as a pass.
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {failed.map((f) => (
              <li key={f.id}>
                {f.title}: <span className="font-mono">{String(f.detail.error ?? "")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ProblemRow({
  f,
  names,
  expanded,
  onToggle,
  onPick,
  onSetStatus,
  onInvestigate,
  investigating,
}: {
  f: Finding;
  names: Map<string, string>;
  expanded: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
  onSetStatus: (id: string, status: string) => void;
  onInvestigate: (id: string) => void;
  investigating: boolean;
}) {
  const state = FINDING_STATE[f.status];
  const open = isOpen(f);
  const where = f.evidence_span_ids.map((id) => names.get(id)).filter(Boolean);
  const preview = f.explanation?.cause ?? (where.length ? `Seen in ${[...new Set(where)].slice(0, 3).join(", ")}` : null);
  const params = Object.entries((f.detail.params ?? {}) as Record<string, string>)
    .filter(([, v]) => v)
    .slice(0, 3);
  const facts = [
    f.check_kind === "rule" ? "Rule" : "Question",
    f.probability !== null ? `${pct(f.probability)} likely` : null,
    f.triage_score !== null ? `triage ${f.triage_score.toFixed(1)} of 4` : null,
    f.precision.precision !== null && f.precision.hits >= 3 ? `${pct(f.precision.precision)} of its past findings kept` : null,
  ].filter(Boolean);

  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="focus-ring flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors motion-fast hover:bg-surface-subtle"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={open ? "text-body-medium text-foreground" : "text-body text-muted-foreground"}>{f.title}</span>
          {preview && !expanded && <span className="truncate text-caption text-muted-foreground">{preview}</span>}
        </span>
        <StatusPill tone={state.tone} size="sm">
          {state.label}
        </StatusPill>
        <Icon icon={ArrowDown01Icon} size="xs" className={cn("shrink-0 text-foreground-subtle transition-transform motion-fast", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {f.explanation ? <ExplanationBlock exp={f.explanation} names={names} onPick={onPick} /> : <EvidenceChips ids={f.evidence_span_ids} names={names} onPick={onPick} />}
          {params.length > 0 && (
            <dl className="flex flex-col gap-1">
              {params.map(([k, v]) => (
                <div key={k} className="flex min-w-0 gap-2 text-caption">
                  <dt className="shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-words text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-caption text-foreground-subtle" title={f.check_id}>
              {facts.join(" · ")} · <span className="font-mono">{f.check_id}</span>
            </span>
            <span className="flex items-center gap-1">
              {!f.explanation && open && (
                <Button size="sm" variant="ghost" pending={investigating} pendingLabel="Investigating…" onClick={() => onInvestigate(f.id)}>
                  Explain finding
                </Button>
              )}
              {open ? (
                <Button size="sm" variant="ghost" title="Not a problem. Counts against this check's precision." onClick={() => onSetStatus(f.id, "dismissed")}>
                  Dismiss finding
                </Button>
              ) : (
                f.status === "dismissed" && (
                  <Button size="sm" variant="ghost" onClick={() => onSetStatus(f.id, "raised")}>
                    Reopen finding
                  </Button>
                )
              )}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}
