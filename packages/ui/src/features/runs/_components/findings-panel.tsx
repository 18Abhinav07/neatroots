import { CheckListIcon } from "@hugeicons/core-free-icons";
import { Button } from "../../../components/ui/button";
import { Empty, EmptyHeader, EmptyMedia } from "../../../components/ui/empty";
import { NeatBadge } from "../../../components/ui/neat-badge";
import { Panel } from "../../../components/ui/panel";
import { StatusPill } from "../../../components/ui/status-pill";
import type { Finding, Plan } from "../../../lib/api";
import { pct } from "../../../lib/format";
import { FINDING_STATE } from "../_libs/labels";
import { EvidenceChips } from "./evidence-chips";
import { ExplanationBlock } from "./insight-panels";

const ORDER = { raised: 0, active: 1, resolved: 2, dismissed: 3, failed: 4 } as const;

export function FindingsPanel({
  findings,
  plan,
  running,
  onPick,
  onSetStatus,
  onInvestigate,
  investigating,
}: {
  findings: Finding[];
  plan: Plan | null;
  running: boolean;
  onPick: (id: string) => void;
  onSetStatus: (id: string, status: string) => void;
  onInvestigate: (id: string) => void;
  investigating?: string;
}) {
  const live = findings.filter((f) => f.status !== "failed").sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.probability ?? 1) - (a.probability ?? 1));
  const failed = findings.filter((f) => f.status === "failed");
  return (
    <Panel
      title="Findings"
      meta={plan ? `${plan.check_ids.length} questions planned${plan.created_by === "planner" && plan.model ? ` by ${plan.model}` : " (defaults)"}` : undefined}
    >
      {live.length === 0 ? (
        <Empty className="py-8">
          <EmptyMedia icon={CheckListIcon} />
          <EmptyHeader
            title={running ? "No findings yet" : "No findings in this run"}
            description={running ? "Bolts checks each span as it arrives." : "Every check that ran on this run passed."}
          />
        </Empty>
      ) : (
        <ul className="divide-y divide-border">
          {live.map((f) => (
            <FindingRow key={f.id} f={f} onPick={onPick} onSetStatus={onSetStatus} onInvestigate={onInvestigate} investigating={investigating === f.id} />
          ))}
        </ul>
      )}
      {failed.length > 0 && (
        <details className="border-t border-border px-4 py-2.5">
          <summary className="cursor-pointer text-caption text-muted-foreground">
            {failed.length} check{failed.length > 1 ? "s" : ""} could not run. A model error never counts as a pass.
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {failed.map((f) => (
              <li key={f.id} className="text-caption text-muted-foreground">
                {f.title}: <span className="font-mono">{String(f.detail.error ?? "")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function FindingRow({
  f,
  onPick,
  onSetStatus,
  onInvestigate,
  investigating,
}: {
  f: Finding;
  onPick: (id: string) => void;
  onSetStatus: (id: string, status: string) => void;
  onInvestigate: (id: string) => void;
  investigating: boolean;
}) {
  const state = FINDING_STATE[f.status];
  const open = f.status === "raised" || f.status === "active";
  const params = Object.entries((f.detail.params ?? {}) as Record<string, string>).filter(([, v]) => v).slice(0, 4);
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className={open ? "text-body-strong text-foreground" : "text-body-medium text-muted-foreground"}>{f.title}</span>
        <StatusPill tone={state.tone}>{state.label}</StatusPill>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <NeatBadge variant={f.check_kind === "rule" ? "tag" : "blue"}>{f.check_kind === "rule" ? "Rule" : "Question"}</NeatBadge>
        <span className="font-mono text-3xs text-foreground-subtle">{f.check_id}</span>
        {f.probability !== null && (
          <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground tabular-nums" title="Probability from the decision model">
            <span aria-hidden className="h-1 w-12 overflow-hidden rounded-full bg-track">
              <span className="block h-full rounded-full bg-track-strong" style={{ width: `${Math.round(f.probability * 100)}%` }} />
            </span>
            {pct(f.probability)}
          </span>
        )}
        {f.triage_score !== null && <span className="text-caption text-foreground-subtle tabular-nums">triage {f.triage_score.toFixed(1)} / 4</span>}
        {f.precision.precision !== null && f.precision.hits >= 3 && (
          <span className="text-caption text-foreground-subtle" title={`${f.precision.dismissed} of ${f.precision.hits} findings from this check were dismissed`}>
            check precision {pct(f.precision.precision)}
          </span>
        )}
      </div>
      {params.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          {params.map(([k, v]) => (
            <div key={k} className="flex min-w-0 gap-1.5 text-caption">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate font-mono text-foreground" title={v}>
                {String(v).slice(0, 90)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {f.explanation && (
        <div className="rounded-md bg-surface-subtle px-3 py-2.5">
          <ExplanationBlock exp={f.explanation} onPick={onPick} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EvidenceChips ids={f.evidence_span_ids} onPick={onPick} max={6} />
        <div className="flex items-center gap-1">
          {!f.explanation && open && (
            <Button size="sm" variant="ghost" pending={investigating} pendingLabel="Investigating…" onClick={() => onInvestigate(f.id)}>
              Investigate finding
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
        </div>
      </div>
    </li>
  );
}
