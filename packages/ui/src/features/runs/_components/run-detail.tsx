import { ArrowRight01Icon, PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { CopyButton } from "../../../components/ui/copy-button";
import { Icon } from "../../../components/ui/icon";
import { NeatBadge } from "../../../components/ui/neat-badge";
import { Panel } from "../../../components/ui/panel";
import { StatusPill } from "../../../components/ui/status-pill";
import { post, type ForwardPreview, type RunDetail as Detail } from "../../../lib/api";
import { ago, dur, midId, num } from "../../../lib/format";
import { RUN_STATE, runGoal } from "../_libs/labels";
import { useRunActions, useRunDetail } from "../_services/run-queries";
import { Problems } from "./findings-panel";
import { ForwardDialog } from "./forward-dialog";
import { SteeringNotes } from "./notes-panel";
import { SpanDetail } from "./span-detail";
import { TraceWaterfall } from "./trace-waterfall";

/** The span to show first: a failed span in the top problem's evidence, else its first evidence, else the first failure, else the root. */
function firstSpan(d: Detail): string | undefined {
  const open = d.findings.filter((f) => f.status === "raised" || f.status === "active").sort((a, b) => (b.triage_score ?? 0) - (a.triage_score ?? 0));
  const failed = new Set(d.spans.filter((s) => s.status_code === 2).map((s) => s.span_id));
  const evidence = open.find((f) => f.evidence_span_ids.length)?.evidence_span_ids ?? [];
  return evidence.find((id) => failed.has(id)) ?? evidence[0] ?? [...failed][0] ?? [...d.spans].sort((a, b) => a.start_ms - b.start_ms)[0]?.span_id;
}

export function RunDetail({ traceId }: { traceId: string }) {
  const { data: d, error, isLoading } = useRunDetail(traceId);
  const actions = useRunActions(traceId);
  const [picked, setPicked] = useState<string>();
  const [preview, setPreview] = useState<ForwardPreview>();
  const [investigating, setInvestigating] = useState<string>();
  const selected = picked ?? (d ? firstSpan(d) : undefined);
  const names = useMemo(() => new Map((d?.spans ?? []).map((s) => [s.span_id, s.tool_name ?? s.name])), [d?.spans]);

  // Tell Bolts what is in focus, for the coding agent's get_current_run.
  useEffect(() => {
    void post("/api/focus", { trace_id: traceId, span_id: selected ?? null }).catch(() => undefined);
  }, [traceId, selected]);

  if (error) return <p className="px-6 py-10 text-body text-muted-foreground">Couldn't load this run: {(error as Error).message}. It may have been removed by retention.</p>;
  if (isLoading || !d) return <p className="px-6 py-10 text-body text-muted-foreground">Loading run…</p>;

  const r = d.run;
  const state = RUN_STATE[r.status];
  const open = d.findings.filter((f) => f.status === "raised" || f.status === "active");
  const flagged = new Set(open.flatMap((f) => f.evidence_span_ids));
  const pick = (id: string) => {
    setPicked(id);
    requestAnimationFrame(() => document.getElementById("trace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const goal = runGoal(r);
  const name = r.root_name ?? r.workflow ?? "Run";
  const facts = [
    r.workflow,
    `started ${ago(r.started_ms)}`,
    r.status === "running" ? "running" : dur(r.duration_ms),
    `${num(r.llm_calls)} LLM · ${num(r.tool_calls)} tool calls`,
    r.total_tokens ? `${num(r.total_tokens)} tokens` : null,
    r.session_id ? `session ${r.session_id}` : null,
  ].filter(Boolean);
  const needsExplanation = open.length > 0 && !d.explanation;

  return (
    <>
      <div className="sticky top-0 z-[var(--z-sticky)] flex h-12 items-center justify-between gap-4 border-b border-border/60 bg-background px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-eyebrow">
          <a href="#/runs" className="focus-ring shrink-0 rounded-sm text-muted-foreground hover:text-foreground">
            Runs
          </a>
          <Icon icon={ArrowRight01Icon} size="xxs" className="shrink-0 text-foreground-subtle" />
          <span className="truncate text-foreground normal-case">{name}</span>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="muted"
            size="icon"
            aria-label={r.pinned ? "Unpin run" : "Pin run"}
            title={r.pinned ? "Unpin run" : "Pin run: keep it past retention"}
            onClick={() => actions.pin.mutate(!r.pinned, { onSuccess: () => toast.success(r.pinned ? "Run unpinned" : "Run pinned; retention keeps it") })}
          >
            <Icon icon={r.pinned ? PinOffIcon : PinIcon} size="xs" />
          </Button>
          <Button
            variant="muted"
            pending={actions.recheck.isPending}
            onClick={() => actions.recheck.mutate(undefined, { onSuccess: () => toast.success("Re-running checks on this run") })}
          >
            Re-run checks
          </Button>
          <Button
            variant="secondary"
            pending={actions.previewForward.isPending}
            onClick={() =>
              actions.previewForward.mutate(undefined, {
                onSuccess: (p) => (p.has_key ? setPreview(p) : toast.error("Add your Neatlogs Cloud API key in Settings before sending runs.")),
              })
            }
          >
            Send to Cloud
          </Button>
          <Button
            variant={needsExplanation ? "default" : "secondary"}
            pending={actions.explain.isPending}
            pendingLabel="Explaining…"
            onClick={() => actions.explain.mutate(undefined, { onError: (e) => toast.error(`Couldn't explain this run: ${(e as Error).message}`) })}
          >
            Explain run
          </Button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-6 pb-12">
        <header className="flex flex-col gap-2">
          <div className="flex items-start gap-3">
            <h1 className="min-w-0 flex-1 text-xl font-normal tracking-tight text-foreground" title={goal ?? undefined}>
              {goal ?? name}
            </h1>
            <span className="flex shrink-0 items-center gap-2 pt-1">
              {d.forwarded && <NeatBadge variant="green">Sent to Cloud</NeatBadge>}
              {r.steering !== "off" && <NeatBadge variant="outline">steering: {r.steering}</NeatBadge>}
              <StatusPill tone={state.tone}>{state.label}</StatusPill>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground tabular-nums">
            {facts.map((f, i) => (
              <span key={f} className="flex items-center gap-2">
                {i > 0 && (
                  <span aria-hidden className="text-foreground-faint">
                    ·
                  </span>
                )}
                {f}
              </span>
            ))}
            <span aria-hidden className="text-foreground-faint">
              ·
            </span>
            <span className="inline-flex items-center font-mono">
              {midId(r.trace_id)}
              <CopyButton text={r.trace_id} label="Copy trace ID" className="size-6" />
            </span>
          </div>
          {d.summary && (
            <div className="mt-1 flex max-w-3xl flex-col gap-0.5 text-body text-muted-foreground">
              {d.summary.text.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </header>

        <Problems
          findings={d.findings}
          plan={d.plan}
          running={r.status === "running"}
          explanation={d.explanation}
          names={names}
          onPick={pick}
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

        <SteeringNotes notes={d.notes} />

        <section id="trace" aria-labelledby="trace-title" className="@container flex scroll-mt-16 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="trace-title" className="text-eyebrow text-muted-foreground">
              Trace · {d.spans.length} spans
            </h2>
            <span className="text-caption text-foreground-subtle">Select a span to see its input and output</span>
          </div>
          <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel bodyClassName="max-h-[40rem] overflow-auto">
              <TraceWaterfall spans={d.spans} flagged={flagged} selected={selected} onSelect={setPicked} />
            </Panel>
            {selected && (
              <div className="@4xl:sticky @4xl:top-16">
                <SpanDetail
                  key={selected}
                  traceId={traceId}
                  spanId={selected}
                  findings={open.filter((f) => f.evidence_span_ids.includes(selected))}
                  annotations={d.annotations.filter((a) => a.span_id === selected)}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      <ForwardDialog preview={preview} pending={actions.forward.isPending} onSend={() => actions.forward.mutateAsync()} onClose={() => setPreview(undefined)} />
    </>
  );
}
