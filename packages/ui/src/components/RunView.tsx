import { useEffect, useMemo, useState } from "react";
import { api, post, type Finding, type Note, type RunDetail } from "../api";
import { ago, dur, num, pct, shortId } from "../format";
import { BoltIcon, Meter, Pill, toast } from "./bits";
import { Waterfall } from "./Waterfall";
import { SpanPanel } from "./SpanPanel";

export function RunView({ traceId, tick }: { traceId: string; tick: number }) {
  const [d, setD] = useState<RunDetail>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const load = () =>
    api<RunDetail>(`/api/runs/${traceId}`)
      .then((r) => {
        setD(r);
        setError(undefined);
      })
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceId, tick]);

  useEffect(() => {
    if (selected) void post("/api/focus", { trace_id: traceId, span_id: selected }).catch(() => undefined);
  }, [selected, traceId]);

  const flagged = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of d?.findings ?? []) {
      if (f.status === "dismissed" || f.status === "failed" || f.status === "resolved") continue;
      for (const s of f.evidence_span_ids) m.set(s, [...(m.get(s) ?? []), f]);
    }
    return m;
  }, [d]);

  if (error) return <div className="page muted">Could not load this run: {error}</div>;
  if (!d) return <div className="page muted">Loading…</div>;
  const r = d.run;
  const live = d.findings.filter((f) => f.status !== "failed");
  const failed = d.findings.filter((f) => f.status === "failed");
  const order = { raised: 0, active: 1, resolved: 2, dismissed: 3, failed: 4 } as const;
  live.sort((a, b) => order[a.status] - order[b.status] || (b.probability ?? 1) - (a.probability ?? 1));

  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(undefined);
      void load();
    }
  };

  return (
    <div className="page">
      <div className="run-head">
        <div style={{ minWidth: 0 }}>
          <h1>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.root_name ?? r.workflow ?? "run"}</span>
            <Pill kind={r.status}>{r.status}</Pill>
          </h1>
          <div className="sub">
            <span>{r.workflow}</span>
            <span className="mono">{shortId(r.trace_id, 12)}</span>
            {r.session_id && <span>session {r.session_id}</span>}
            <span>{ago(r.started_ms)}</span>
            {r.termination_reason && <span>ended: {r.termination_reason}</span>}
            <span>steering {r.steering}</span>
            {d.forwarded && <span style={{ color: "var(--ok)" }}>sent to cloud</span>}
          </div>
        </div>
        <div className="run-actions">
          <button className="btn" disabled={!!busy} onClick={() => act("explain", () => post(`/api/runs/${traceId}/explain`), "Explanation ready")}>
            {busy === "explain" ? <span className="spinner" /> : <BoltIcon size={13} />} Explain
          </button>
          <button className="btn ghost" disabled={!!busy} onClick={() => act("recheck", () => post(`/api/runs/${traceId}/recheck`), "Re-running checks")}>
            Recheck
          </button>
          <button className="btn ghost" onClick={() => act("pin", () => post(`/api/runs/${traceId}/pin`, { pinned: !r.pinned }), r.pinned ? "Unpinned" : "Pinned: kept past retention")}>
            {r.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            className="btn ghost"
            disabled={!!busy}
            onClick={async () => {
              const p = await post<{ span_count: number; redactions: { kind: string; count: number }[]; has_key: boolean; endpoint: string }>("/api/cloud/preview", { trace_ids: [traceId] });
              if (!p.has_key) return toast("Add a Neatlogs Cloud API key in Settings first");
              const red = p.redactions.length ? p.redactions.map((x) => `${x.count} ${x.kind}`).join(", ") : "nothing";
              if (!window.confirm(`Send ${p.span_count} spans to ${p.endpoint}?\nRedacted before sending: ${red}.`)) return;
              await act("send", () => post("/api/cloud/forward", { trace_ids: [traceId] }), "Sent to Neatlogs Cloud");
            }}
          >
            Send to Cloud
          </button>
        </div>
      </div>

      <div className="stats section">
        <Stat k="duration" v={r.status === "running" ? "running" : dur(r.duration_ms)} />
        <Stat k="spans" v={num(r.span_count)} />
        <Stat k="llm calls" v={num(r.llm_calls)} />
        <Stat k="tool calls" v={num(r.tool_calls)} />
        <Stat k="tokens" v={num(r.total_tokens)} />
        <Stat k="findings" v={String(live.filter((f) => f.status === "raised" || f.status === "active").length)} hot={r.open_finding_count > 0} />
      </div>

      {(d.summary || d.explanation) && (
        <div className="grid-2 section">
          {d.summary ? (
            <div className="card">
              <div className="card-head">
                <h3>Summary</h3>
                <span className="hint mono">{d.summary.model}</span>
              </div>
              <div className="card-body">
                <ol className="summary-lines">
                  {d.summary.text.split("\n").map((l, i) => (
                    <li key={i}>
                      <span>0{i + 1}</span>
                      {l}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <div />
          )}
          {d.explanation && (
            <div className="card">
              <div className="card-head">
                <h3>
                  <BoltIcon size={12} /> Likely cause
                </h3>
                <span className="hint">grounding {pct(d.explanation.grounding)}</span>
              </div>
              <div className="card-body explain">
                <div className="cause">{d.explanation.cause}</div>
                {d.explanation.fix && (
                  <div className="fix">
                    <b>Fix</b> · {d.explanation.fix}
                  </div>
                )}
                <Evidence ids={d.explanation.evidence_span_ids} onPick={setSelected} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid-2 section">
        <div className="card">
          <div className="card-head">
            <h3>
              Findings <span className="dim">{live.length || ""}</span>
            </h3>
            {d.plan && (
              <span className="hint" title={d.plan.rationale ?? ""}>
                plan: {d.plan.check_ids.length} questions · {d.plan.created_by === "planner" ? `chosen by ${d.plan.model}` : "default"}
              </span>
            )}
          </div>
          {live.length === 0 && (
            <div className="card-body muted">
              {r.status === "running" ? "Watching this run…" : "No problems found."} {failed.length ? `${failed.length} check(s) could not run.` : ""}
            </div>
          )}
          {live.map((f) => (
            <FindingCard key={f.id} f={f} onPick={setSelected} onChange={load} />
          ))}
          {failed.length > 0 && (
            <details style={{ padding: "8px 14px" }}>
              <summary className="hint" style={{ cursor: "pointer" }}>
                {failed.length} check(s) could not run (a model error is never counted as “no”)
              </summary>
              {failed.map((f) => (
                <div key={f.id} className="hint" style={{ padding: "4px 0" }}>
                  {f.title}: <span className="mono">{String(f.detail.error ?? "")}</span>
                </div>
              ))}
            </details>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Steering notes</h3>
            <span className="hint">{d.notes.filter((n) => n.status === "delivered").length} delivered</span>
          </div>
          {d.notes.length === 0 ? (
            <div className="card-body muted">
              {r.steering === "off" ? (
                <>
                  Steering is off for <b>{r.project}</b>. Turn it on in Settings to send notes into the agent's next LLM call.
                </>
              ) : (
                "Nothing sent to the agent."
              )}
            </div>
          ) : (
            d.notes.map((n) => <NoteRow key={n.id} n={n} />)
          )}
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <h3>Trace</h3>
          <span className="hint">{d.spans.length} spans · click a span for its input and output</span>
        </div>
        <Waterfall spans={d.spans} run={r} flagged={flagged} selected={selected} onSelect={setSelected} />
      </div>

      {selected && <SpanPanel traceId={traceId} spanId={selected} findings={flagged.get(selected) ?? []} onClose={() => setSelected(undefined)} annotations={d.annotations.filter((a) => a.span_id === selected)} onAnnotate={load} />}
    </div>
  );
}

function Stat({ k, v, hot }: { k: string; v: string; hot?: boolean }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v" style={hot ? { color: "var(--signal)" } : undefined}>
        {v}
      </div>
    </div>
  );
}

function Evidence({ ids, onPick }: { ids: string[]; onPick: (id: string) => void }) {
  if (!ids.length) return null;
  return (
    <div className="evidence" style={{ marginTop: 10 }}>
      {ids.slice(0, 12).map((id) => (
        <span key={id} className="ev-chip mono" onClick={() => onPick(id)}>
          {id.slice(0, 6)}
        </span>
      ))}
      {ids.length > 12 && <span className="hint">+{ids.length - 12}</span>}
    </div>
  );
}

function FindingCard({ f, onPick, onChange }: { f: Finding; onPick: (id: string) => void; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const open = f.status === "raised" || f.status === "active";
  const params = (f.detail.params ?? {}) as Record<string, string>;
  const set = async (status: string) => {
    await post(`/api/findings/${f.id}`, { status });
    onChange();
  };
  return (
    <div className={`finding ${open ? "hot" : ""}`}>
      <div className="finding-top">
        <div className="finding-title">
          <BoltIcon size={14} color={open ? "var(--signal)" : "var(--ink-4)"} />
          <span>{f.title}</span>
        </div>
        <Pill kind={f.status}>{f.status}</Pill>
      </div>
      <div className="label-row">
        <Meter value={f.probability} />
        <span className="hint mono">{f.check_id}</span>
        {f.triage_score !== null && <span className="hint">triage {f.triage_score.toFixed(1)}/4</span>}
        {f.precision.precision !== null && f.precision.hits >= 3 && (
          <span className="hint" title={`${f.precision.dismissed} of ${f.precision.hits} findings from this check were dismissed`}>
            precision {pct(f.precision.precision)}
            {f.precision.noisy ? " · noisy" : ""}
          </span>
        )}
      </div>
      {Object.keys(params).length > 0 && (
        <div className="hint">
          {Object.entries(params)
            .filter(([, v]) => v)
            .slice(0, 4)
            .map(([k, v]) => (
              <span key={k} style={{ marginRight: 12 }}>
                {k}: <span className="mono">{String(v).slice(0, 80)}</span>
              </span>
            ))}
        </div>
      )}
      {f.explanation && (
        <div className="explain" style={{ marginTop: 2 }}>
          <div>{f.explanation.cause}</div>
          {f.explanation.fix && (
            <div className="fix">
              <b>Fix</b> · {f.explanation.fix}
            </div>
          )}
        </div>
      )}
      <div className="finding-top">
        <Evidence ids={f.evidence_span_ids} onPick={onPick} />
        <div className="finding-actions">
          {!f.explanation && (
            <button
              className="btn small ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await post(`/api/findings/${f.id}/investigate`);
                } catch (e) {
                  toast((e as Error).message);
                }
                setBusy(false);
                onChange();
              }}
            >
              {busy ? <span className="spinner" /> : "Investigate"}
            </button>
          )}
          {open ? (
            <button className="btn small ghost" title="Not a problem. Counts against this check's precision." onClick={() => set("dismissed")}>
              Dismiss
            </button>
          ) : (
            <button className="btn small ghost" onClick={() => set("raised")}>
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteRow({ n }: { n: Note }) {
  return (
    <div className={`note-row ${n.status}`}>
      <span className="label-row">
        <Pill kind={n.status}>{n.status}</Pill>
        <span className="hint">{n.kind === "llm" ? "written by the local LLM" : n.kind === "halt" ? "halt" : "template"}</span>
      </span>
      <span className="hint" style={{ textAlign: "right" }}>
        {n.delivered_ms ? `reached the agent ${ago(n.delivered_ms)}` : ago(n.created_ms)}
      </span>
      <div className="text">{n.text}</div>
      {n.checks && (n.checks.unsupported !== undefined || n.checks.copied !== undefined) && (
        <span className="hint" style={{ gridColumn: "1 / span 2" }}>
          checks: unsupported {pct(n.checks.unsupported)} · copied from tool output {pct(n.checks.copied)}
        </span>
      )}
    </div>
  );
}
