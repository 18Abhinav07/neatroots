import { BarChartHorizontalIcon, PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DetailBreadcrumb, DetailLayout, DetailRailGroup, DetailTitle, PropertyRow } from "@/components/detail/detail-layout";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatusPill } from "@/components/ui/status-pill";
import { post, type ForwardPreview, type RunDetail as Detail } from "@/lib/api";
import { ago, dur, midId, num } from "@/lib/format";
import { RUN_STATE, runGoal } from "../_libs/labels";
import { useRunActions, useRunDetail } from "../_services/run-queries";
import { ForwardDialog } from "./forward-dialog";
import { SteeringNotes } from "./notes-panel";
import { ProblemsPanel } from "./problems-panel";
import { SpanSheet } from "./span-sheet";
import { TraceTree } from "./trace-tree";

/** The span to point at first: a failed span in the top problem's evidence, else its first evidence, else the first failure. */
function firstSpan(d: Detail): string | undefined {
  const open = d.findings.filter((f) => f.status === "raised" || f.status === "active").sort((a, b) => (b.triage_score ?? 0) - (a.triage_score ?? 0));
  const failed = new Set(d.spans.filter((s) => s.status_code === 2).map((s) => s.span_id));
  const evidence = open.find((f) => f.evidence_span_ids.length)?.evidence_span_ids ?? [];
  return evidence.find((id) => failed.has(id)) ?? evidence[0] ?? [...failed][0];
}

export function RunDetail({ traceId }: { traceId: string }) {
  const { data: d, error, isLoading } = useRunDetail(traceId);
  const actions = useRunActions(traceId);
  const [open, setOpen] = useState<string>();
  const [preview, setPreview] = useState<ForwardPreview>();
  const [investigating, setInvestigating] = useState<string>();
  const highlighted = open ?? (d ? firstSpan(d) : undefined);
  const names = useMemo(() => new Map((d?.spans ?? []).map((s) => [s.span_id, s.tool_name ?? s.name])), [d?.spans]);

  // Tell Neatlogs Bolt what is in focus, for the coding agent's get_current_run.
  useEffect(() => {
    void post("/api/focus", { trace_id: traceId, span_id: highlighted ?? null }).catch(() => undefined);
  }, [traceId, highlighted]);

  const breadcrumb = (label: string) => (
    <DetailBreadcrumb back={{ href: "#/runs" }} backLabel="Back to runs" leadingIcon={BarChartHorizontalIcon} items={[{ href: "#/runs", label: "Runs" }, { label }]} />
  );

  if (error || isLoading || !d) {
    return (
      <DetailLayout breadcrumb={breadcrumb(traceId.slice(0, 8))} rail={null}>
        <EmptyState
          variant="inline"
          state={error ? "error" : "loading"}
          title={error ? "Couldn't load this run" : "Loading run"}
          description={error ? `${(error as Error).message}. Retention may have removed it.` : undefined}
        />
      </DetailLayout>
    );
  }

  const r = d.run;
  const state = RUN_STATE[r.status];
  const openFindings = d.findings.filter((f) => f.status === "raised" || f.status === "active");
  const flagged = new Set(openFindings.flatMap((f) => f.evidence_span_ids));
  const goal = runGoal(r);
  const name = r.root_name ?? r.workflow ?? "Run";
  const needsExplanation = openFindings.length > 0 && !d.explanation;

  const headerActions = (
    <>
      <Button
        variant="muted"
        size="icon"
        aria-label={r.pinned ? "Unpin run" : "Pin run"}
        title={r.pinned ? "Unpin run" : "Pin run: keep it past retention"}
        onClick={() => actions.pin.mutate(!r.pinned, { onSuccess: () => toast.success(r.pinned ? "Run unpinned" : "Run pinned; retention keeps it") })}
      >
        <Icon icon={r.pinned ? PinOffIcon : PinIcon} size="xs" />
      </Button>
      <PendingButton
        variant="secondary"
        pending={actions.recheck.isPending}
        onClick={() => actions.recheck.mutate(undefined, { onSuccess: () => toast.success("Re-running checks on this run") })}
      >
        Re-run checks
      </PendingButton>
      <PendingButton
        variant="secondary"
        pending={actions.previewForward.isPending}
        onClick={() =>
          actions.previewForward.mutate(undefined, {
            onSuccess: (p) => (p.has_key ? setPreview(p) : toast.error("Add your Neatlogs Cloud API key in Settings before sending runs.")),
          })
        }
      >
        Send to Cloud
      </PendingButton>
      <PendingButton
        variant={needsExplanation ? "default" : "secondary"}
        pending={actions.explain.isPending}
        pendingLabel="Explaining…"
        onClick={() => actions.explain.mutate(undefined, { onError: (e) => toast.error(`Couldn't explain this run: ${(e as Error).message}`) })}
      >
        Explain run
      </PendingButton>
    </>
  );

  const rail = (
    <>
      <DetailRailGroup label="Run">
        <PropertyRow
          label="Status"
          value={
            <StatusPill size="sm" tone={state.tone} dot={r.status === "running" ? "ping" : false}>
              {state.label}
            </StatusPill>
          }
        />
        {r.workflow && <PropertyRow label="Workflow" value={<span className="truncate">{r.workflow}</span>} />}
        <PropertyRow label="Started" value={<span title={r.started_ms ? new Date(r.started_ms).toLocaleString() : undefined}>{ago(r.started_ms)}</span>} />
        <PropertyRow label="Duration" value={r.status === "running" ? "running" : dur(r.duration_ms)} />
        <PropertyRow label="LLM calls" value={num(r.llm_calls)} />
        <PropertyRow label="Tool calls" value={num(r.tool_calls)} />
        {r.total_tokens ? <PropertyRow label="Tokens" value={num(r.total_tokens)} /> : null}
      </DetailRailGroup>
      <DetailRailGroup label="Checks">
        <PropertyRow label="Open problems" value={openFindings.length} />
        {d.plan && <PropertyRow label="Questions" value={d.plan.check_ids.length} tooltip="Questions picked for this agent. Rules run on every span as well." />}
        <PropertyRow label="Steering" value={r.steering === "off" ? "off" : r.steering} tooltip="Whether Neatlogs Bolt could add notes to this run while it ran." />
        <PropertyRow label="Sent to Cloud" value={d.forwarded ? "yes" : "no"} />
      </DetailRailGroup>
      <DetailRailGroup label="IDs">
        <PropertyRow
          label="Trace"
          value={
            <>
              <span className="truncate font-mono text-xs">{midId(r.trace_id)}</span>
              <CopyButton content={r.trace_id} copyMessage="Trace ID copied" />
            </>
          }
        />
        {r.session_id && (
          <PropertyRow
            label="Session"
            value={
              <>
                <span className="truncate font-mono text-xs">{r.session_id}</span>
                <CopyButton content={r.session_id} copyMessage="Session ID copied" />
              </>
            }
          />
        )}
      </DetailRailGroup>
    </>
  );

  return (
    <DetailLayout breadcrumb={breadcrumb(name)} headerActions={headerActions} rail={rail}>
      <div className="flex flex-col gap-6">
        <DetailTitle title={<span title={goal ?? undefined}>{goal ?? name}</span>} subtitle={d.summary?.text.split("\n").join(" ")} />
        <ProblemsPanel
          findings={d.findings}
          plan={d.plan}
          running={r.status === "running"}
          explanation={d.explanation}
          names={names}
          onPick={setOpen}
          investigating={investigating}
          onSetStatus={(id, status) =>
            actions.setFinding.mutate({ id, status }, { onSuccess: () => toast.success(status === "dismissed" ? "Finding dismissed" : "Finding reopened") })
          }
          onInvestigate={(id) => {
            setInvestigating(id);
            actions.investigate.mutate(id, {
              onError: (e) => toast.error(`Couldn't explain this finding: ${(e as Error).message}`),
              onSettled: () => setInvestigating(undefined),
            });
          }}
        />
        <TraceTree spans={d.spans} flagged={flagged} selected={highlighted} onSelect={setOpen} />
        <SteeringNotes notes={d.notes} />
      </div>
      <SpanSheet
        key={open}
        traceId={traceId}
        spanId={open}
        findings={open ? openFindings.filter((f) => f.evidence_span_ids.includes(open)) : []}
        annotations={open ? d.annotations.filter((a) => a.span_id === open) : []}
        onClose={() => setOpen(undefined)}
      />
      <ForwardDialog preview={preview} pending={actions.forward.isPending} onSend={() => actions.forward.mutateAsync()} onClose={() => setPreview(undefined)} />
    </DetailLayout>
  );
}
