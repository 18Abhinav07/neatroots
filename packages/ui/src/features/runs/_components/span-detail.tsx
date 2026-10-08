import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { CopyButton } from "../../../components/ui/copy-button";
import { NeatBadge } from "../../../components/ui/neat-badge";
import { Panel } from "../../../components/ui/panel";
import { SegmentedTabs } from "../../../components/ui/segmented-tabs";
import { StatusPill } from "../../../components/ui/status-pill";
import type { Annotation, Finding } from "../../../lib/api";
import { dur, midId, num } from "../../../lib/format";
import { spanKindBadge } from "../_libs/labels";
import { useRunActions, useSpanDetail } from "../_services/run-queries";
import { MessageList } from "./message-list";

function KeyValues({ entries }: { entries: [string, unknown][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,38%)_1fr] font-mono text-xs">
      {entries.map(([k, v]) => {
        const s = typeof v === "string" ? v : JSON.stringify(v);
        return (
          <div key={k} className="contents">
            <dt className="truncate border-b border-border py-1.5 pr-3 text-muted-foreground" title={k}>
              {k}
            </dt>
            <dd className="border-b border-border py-1.5 break-all text-foreground">{s.length > 3000 ? `${s.slice(0, 3000)}… (${s.length.toLocaleString()} characters)` : s}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** One span: what went in, what came out, and why Bolts flagged it. Sits beside the trace. */
export function SpanDetail({ traceId, spanId, findings, annotations }: { traceId: string; spanId: string; findings: Finding[]; annotations: Annotation[] }) {
  const { data: d, isLoading, error } = useSpanDetail(traceId, spanId);
  const [tab, setTab] = useState<"io" | "attrs" | "raw">("io");
  const { annotate } = useRunActions(traceId);
  const mark = (label: "issue" | "good" | "note") => {
    const text = label === "note" ? window.prompt("Note for this span") : null;
    if (label === "note" && !text) return;
    annotate.mutate({ span_id: spanId, label, text }, { onSuccess: () => toast.success(label === "note" ? "Note added to the span" : `Span marked as ${label}`) });
  };
  if (isLoading || !d) {
    return (
      <Panel title="Span">
        <p className="px-4 py-6 text-body text-muted-foreground">{error ? `Couldn't load this span: ${(error as Error).message}` : "Loading span…"}</p>
      </Panel>
    );
  }
  const v = d.view;
  const kind = spanKindBadge(d.kind);
  const durationMs = Number(BigInt(d.end_ns || "0") - BigInt(d.start_ns || "0")) / 1e6;
  const meta = [dur(durationMs), v.model, v.totalTokens !== undefined ? `${num(v.promptTokens)} in / ${num(v.completionTokens)} out tokens` : null].filter(Boolean);
  return (
    <Panel
      title={
        <span className="flex min-w-0 items-center gap-2">
          <NeatBadge variant={kind.variant} size="micro">
            {kind.label}
          </NeatBadge>
          <span className="truncate">{v.toolName ?? d.name}</span>
          {d.status.code === 2 && <StatusPill tone="danger">Failed</StatusPill>}
        </span>
      }
    >
      <div className="flex flex-col gap-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-foreground-subtle tabular-nums">
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
          <span className="inline-flex items-center gap-0.5 font-mono">
            {midId(d.span_id)}
            <CopyButton text={d.span_id} label="Copy span ID" className="size-6" />
          </span>
        </div>
        {findings.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md bg-warning-surface px-3 py-2">
            <span className="text-label text-warning-fg">Evidence for</span>
            {findings.map((f) => (
              <span key={f.id} className="text-body text-foreground">
                {f.title}
              </span>
            ))}
          </div>
        )}
        {v.error && <pre className="rounded-md border border-danger-border bg-danger-surface px-3 py-2 font-mono text-xs whitespace-pre-wrap text-danger-fg">{v.error}</pre>}
        <SegmentedTabs
          label="Span view"
          size="compact"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "io", label: "Input & output" },
            { value: "attrs", label: "Attributes" },
            { value: "raw", label: "Raw" },
          ]}
        />
        {tab === "io" && (
          <div className="flex flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-label text-muted-foreground">Input</span>
              <MessageList value={v.input} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-label text-muted-foreground">Output</span>
              <MessageList value={v.output} />
              {v.tools && v.tools.length > 0 && <span className="text-caption text-foreground-subtle">Tools offered: {v.tools.join(", ")}</span>}
            </div>
          </div>
        )}
        {tab === "attrs" && (
          <div className="flex flex-col gap-4">
            <KeyValues entries={Object.entries(d.attributes)} />
            <div className="flex flex-col gap-2">
              <span className="text-label text-muted-foreground">Resource · {d.scope.name}</span>
              <KeyValues entries={Object.entries(d.resource)} />
            </div>
            {d.events.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-label text-muted-foreground">Events</span>
                <KeyValues entries={d.events.map((e) => [e.name, e.attributes] as [string, unknown])} />
              </div>
            )}
          </div>
        )}
        {tab === "raw" && (
          <pre className="max-h-[32rem] overflow-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(d, null, 2)}</pre>
        )}
        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-3">
          {annotations.map((a) => (
            <StatusPill key={a.id} tone={a.label === "issue" ? "danger" : a.label === "good" ? "success" : "neutral"}>
              {a.label === "issue" ? "Issue" : a.label === "good" ? "Good" : "Note"}
              {a.text ? `: ${a.text}` : ""}
            </StatusPill>
          ))}
          <span className="mr-auto text-caption text-foreground-subtle">Your labels teach Bolts which findings matter.</span>
          <Button size="sm" variant="ghost" onClick={() => mark("issue")}>
            Mark as issue
          </Button>
          <Button size="sm" variant="ghost" onClick={() => mark("good")}>
            Mark as good
          </Button>
          <Button size="sm" variant="ghost" onClick={() => mark("note")}>
            Add note
          </Button>
        </div>
      </div>
    </Panel>
  );
}
