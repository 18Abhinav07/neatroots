import { AiBrain01Icon, ArrowDown01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Panel, PanelContent, PanelHeader } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { StatusPill } from "@/components/ui/status-pill";
import type { Explanation, Finding, Plan } from "@/lib/api";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FINDING_STATE } from "../_libs/labels";
import { EvidenceChips } from "./evidence-chips";
import { ExplanationBlock } from "./insight-panels";

const ORDER = { raised: 0, active: 1, resolved: 2, dismissed: 3, failed: 4 } as const;
const isOpen = (f: Finding) => f.status === "raised" || f.status === "active";

/**
 * What broke in this run, most important first. Rows share one height; a row opens for the
 * cause, the fix and the spans that show it. The list scrolls inside the panel.
 */
export function ProblemsPanel({
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
  const live = findings.filter((f) => f.status !== "failed").sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.triage_score ?? 0) - (a.triage_score ?? 0));
  const failed = findings.filter((f) => f.status === "failed");
  const open = live.filter(isOpen);
  const [expanded, setExpanded] = useState<string | undefined>(open[0]?.id);
  return (
    <Panel>
      <PanelHeader
        title={open.length ? `${open.length} problem${open.length > 1 ? "s" : ""}` : "Problems"}
        actions={plan ? <span className="hidden text-xs text-muted-foreground sm:inline">{plan.check_ids.length} questions for this agent, plus rules on every span</span> : undefined}
      />
      <PanelContent className="flex flex-col gap-4">
        {explanation && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface-subtle p-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon icon={AiBrain01Icon} size="xxs" className="text-brand-violet" />
              Likely cause · {explanation.model ?? "LLM"}
            </span>
            <ExplanationBlock exp={explanation} names={names} onPick={onPick} />
          </div>
        )}
        {live.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon icon={CheckmarkCircle02Icon} size="sm" className="text-success-fg" />
            {running ? "Nothing found yet. neatroots checks each span as it arrives." : "Nothing found. Every check that ran on this run passed."}
          </p>
        ) : (
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
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
          <details className="text-xs text-muted-foreground">
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
      </PanelContent>
    </Panel>
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
  const where = [...new Set(f.evidence_span_ids.map((id) => names.get(id)).filter(Boolean))];
  const preview = f.explanation?.cause ?? (where.length ? `Seen in ${where.slice(0, 3).join(", ")}` : "");
  const facts = [
    f.check_kind === "rule" ? "Rule" : "Question",
    f.probability !== null ? `${pct(f.probability)} likely` : null,
    f.precision.precision !== null && f.precision.hits >= 3 ? `${pct(f.precision.precision)} of past findings kept` : null,
  ].filter(Boolean);
  const params = Object.entries((f.detail.params ?? {}) as Record<string, string>).filter(([, v]) => v).slice(0, 2);
  return (
    <li>
      <button type="button" aria-expanded={expanded} onClick={onToggle} className="flex h-14 w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors hover:bg-surface-subtle focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate text-sm", open ? "font-medium text-foreground" : "text-muted-foreground")}>{f.title}</span>
          <span className="truncate text-xs text-muted-foreground">{preview || " "}</span>
        </span>
        <StatusPill size="sm" tone={state.tone}>
          {state.label}
        </StatusPill>
        <Icon icon={ArrowDown01Icon} size="sm" className={cn("shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border bg-surface-subtle/40 px-4 py-3">
          {f.explanation ? <ExplanationBlock exp={f.explanation} names={names} onPick={onPick} /> : <EvidenceChips ids={f.evidence_span_ids} names={names} onPick={onPick} />}
          {params.map(([k, v]) => (
            <p key={k} className="text-xs">
              <span className="text-muted-foreground">{k} </span>
              <span className="text-foreground">{v}</span>
            </p>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {facts.join(" · ")} · <span className="font-mono">{f.check_id}</span>
            </span>
            <span className="flex items-center gap-1">
              {!f.explanation && open && (
                <Button size="sm" variant="ghost" disabled={investigating} onClick={() => onInvestigate(f.id)}>
                  {investigating && <Spinner size="xs" />}
                  {investigating ? "Explaining…" : "Explain finding"}
                </Button>
              )}
              {open ? (
                <Button size="sm" variant="muted" title="Not a problem. Counts against this check's precision." onClick={() => onSetStatus(f.id, "dismissed")}>
                  Dismiss finding
                </Button>
              ) : (
                f.status === "dismissed" && (
                  <Button size="sm" variant="muted" onClick={() => onSetStatus(f.id, "raised")}>
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
