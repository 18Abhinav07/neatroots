import { PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { CopyButton } from "../../../components/ui/copy-button";
import { Icon } from "../../../components/ui/icon";
import { NeatBadge } from "../../../components/ui/neat-badge";
import { Panel } from "../../../components/ui/panel";
import { StatusPill } from "../../../components/ui/status-pill";
import { post, type ForwardPreview } from "../../../lib/api";
import { ago, midId } from "../../../lib/format";
import { RUN_STATE } from "../_libs/labels";
import { useRunActions, useRunDetail } from "../_services/run-queries";
import { FindingsPanel } from "./findings-panel";
import { ForwardDialog } from "./forward-dialog";
import { LikelyCausePanel, SummaryPanel } from "./insight-panels";
import { KpiStrip } from "./kpi-strip";
import { NotesPanel } from "./notes-panel";
import { SpanDetail } from "./span-detail";
import { TraceWaterfall } from "./trace-waterfall";

export function RunDetail({ traceId }: { traceId: string }) {
  const { data: d, error, isLoading } = useRunDetail(traceId);
  const actions = useRunActions(traceId);
  const [selected, setSelected] = useState<string>();
  const [preview, setPreview] = useState<ForwardPreview>();
  const [investigating, setInvestigating] = useState<string>();

  // Tell Bolts what is in focus, for the coding agent's get_current_run.
  useEffect(() => {
    void post("/api/focus", { trace_id: traceId, span_id: selected ?? null }).catch(() => undefined);
  }, [traceId, selected]);

  if (error) return <p className="px-8 py-10 text-body text-muted-foreground">Couldn't load this run: {(error as Error).message}. It may have been removed by retention.</p>;
  if (isLoading || !d) return <p className="px-8 py-10 text-body text-muted-foreground">Loading run…</p>;

  const r = d.run;
  const state = RUN_STATE[r.status];
  const open = d.findings.filter((f) => f.status === "raised" || f.status === "active");
  const flagged = new Set(open.flatMap((f) => f.evidence_span_ids));
  const pick = (id: string) => {
    setSelected(id);
    requestAnimationFrame(() => document.getElementById("span-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-display">{r.root_name ?? r.workflow ?? "Run"}</h1>
            <StatusPill tone={state.tone}>{state.label}</StatusPill>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            <span>{r.workflow}</span>
            <span className="inline-flex items-center gap-0.5 font-mono">
              {midId(r.trace_id)}
              <CopyButton text={r.trace_id} label="Copy trace ID" className="size-6" />
            </span>
            {r.session_id && <span>session {r.session_id}</span>}
            <span>started {ago(r.started_ms)}</span>
            {r.termination_reason && <span>ended: {r.termination_reason}</span>}
            <NeatBadge variant="outline">steering {r.steering}</NeatBadge>
            {d.forwarded && <NeatBadge variant="green">Sent to Cloud</NeatBadge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={r.pinned ? "Unpin run" : "Pin run"}
            title={r.pinned ? "Unpin run" : "Pin run: keep it past retention"}
            onClick={() => actions.pin.mutate(!r.pinned, { onSuccess: () => toast.success(r.pinned ? "Run unpinned" : "Run pinned; retention keeps it") })}
          >
            <Icon icon={r.pinned ? PinOffIcon : PinIcon} size="sm" />
          </Button>
          <Button variant="outline" pending={actions.recheck.isPending} onClick={() => actions.recheck.mutate(undefined, { onSuccess: () => toast.success("Re-running checks on this run") })}>
            Re-run checks
          </Button>
          <Button
            variant="outline"
            pending={actions.previewForward.isPending}
            onClick={() =>
              actions.previewForward.mutate(undefined, {
                onSuccess: (p) => (p.has_key ? setPreview(p) : toast.error("Add your Neatlogs Cloud API key in Settings before sending runs.")),
              })
            }
          >
            Send run to Cloud
          </Button>
          <Button
            pending={actions.explain.isPending}
            pendingLabel="Explaining…"
            onClick={() =>
              actions.explain.mutate(undefined, {
                onError: (e) => toast.error(`Couldn't explain this run: ${(e as Error).message}`),
              })
            }
          >
            Explain run
          </Button>
        </div>
      </header>

      <KpiStrip run={r} openFindings={open.length} />

      {(d.summary || d.explanation) && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {d.summary && <SummaryPanel text={d.summary.text} model={d.summary.model} />}
          {d.explanation && <LikelyCausePanel exp={d.explanation} onPick={pick} />}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <FindingsPanel
          findings={d.findings}
          plan={d.plan}
          running={r.status === "running"}
          onPick={pick}
          investigating={investigating}
          onSetStatus={(id, status) => actions.setFinding.mutate({ id, status }, { onSuccess: () => toast.success(status === "dismissed" ? "Finding dismissed" : "Finding reopened") })}
          onInvestigate={(id) => {
            setInvestigating(id);
            actions.investigate.mutate(id, {
              onError: (e) => toast.error(`Couldn't investigate this finding: ${(e as Error).message}`),
              onSettled: () => setInvestigating(undefined),
            });
          }}
        />
        <NotesPanel notes={d.notes} steering={r.steering} project={r.project} />
      </div>

      <Panel title="Trace" meta={`${d.spans.length} spans`} bodyClassName="max-h-[36rem] overflow-auto">
        <TraceWaterfall spans={d.spans} flagged={flagged} selected={selected} onSelect={setSelected} />
      </Panel>

      {selected && (
        <div id="span-detail" className="scroll-mt-6">
          <SpanDetail
            traceId={traceId}
            spanId={selected}
            findings={open.filter((f) => f.evidence_span_ids.includes(selected))}
            annotations={d.annotations.filter((a) => a.span_id === selected)}
            onClose={() => setSelected(undefined)}
          />
        </div>
      )}

      <ForwardDialog preview={preview} pending={actions.forward.isPending} onSend={() => actions.forward.mutateAsync()} onClose={() => setPreview(undefined)} />
    </div>
  );
}
