import { useEffect, useState } from "react";
import { api, post, type Finding, type SpanDetail } from "../api";
import { dur, kindColor, pretty } from "../format";
import { Pill, toast } from "./bits";

function renderContent(content: unknown): React.ReactNode {
  if (content === null || content === undefined) return <span className="dim">(empty)</span>;
  const text = typeof content === "string" ? content : pretty(content);
  const parts = text.split(/(<bolts-guidance>[\s\S]*?<\/bolts-guidance>)/g);
  return parts.map((p, i) =>
    p.startsWith("<bolts-guidance>") ? (
      <span key={i} className="guidance-mark">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function Messages({ value }: { value: unknown }) {
  if (Array.isArray(value) && value.every((m) => m && typeof m === "object" && "role" in m)) {
    return (
      <div>
        {(value as Record<string, unknown>[]).map((m, i) => {
          const guided = JSON.stringify(m).includes("<bolts-guidance>");
          const calls = Array.isArray(m.tool_calls) ? (m.tool_calls as Record<string, unknown>[]) : [];
          return (
            <div key={i} className={`msg ${guided ? "guided" : ""}`}>
              <div className="msg-role">
                <span>{String(m.role)}</span>
                {guided && <span style={{ color: "var(--signal)" }}>includes a Bolts note</span>}
              </div>
              <div className="msg-body">
                {m.content !== undefined && m.content !== null && m.content !== "null" && renderContent(m.content)}
                {m.role === "assistant" && (m.content == null || m.content === "null") && !calls.length && <span className="dim">(tool call; the SDK did not record its arguments here)</span>}
                {calls.map((c, j) => (
                  <div key={j} className="mono" style={{ color: "var(--k-tool)", marginTop: 4 }}>
                    → {String(c.name)}({typeof c.arguments === "string" ? c.arguments : JSON.stringify(c.arguments)})
                  </div>
                ))}
                {m.role !== "assistant" && (m.content == null || m.content === "null") && !calls.length && <span className="dim">(empty)</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (value === undefined) return <div className="dim">(not captured)</div>;
  return <pre className="json">{renderContent(value)}</pre>;
}

export function SpanPanel({
  traceId,
  spanId,
  findings,
  annotations,
  onClose,
  onAnnotate,
}: {
  traceId: string;
  spanId: string;
  findings: Finding[];
  annotations: { id: string; label: string; text: string | null; author: string }[];
  onClose: () => void;
  onAnnotate: () => void;
}) {
  const [d, setD] = useState<SpanDetail>();
  const [tab, setTab] = useState<"io" | "attrs" | "raw">("io");
  useEffect(() => {
    setD(undefined);
    void api<SpanDetail>(`/api/runs/${traceId}/spans/${spanId}`).then(setD);
  }, [traceId, spanId]);
  if (!d) return <div className="card span-panel card-body muted">Loading span…</div>;
  const v = d.view;
  const annotate = async (label: string) => {
    const text = label === "note" ? window.prompt("Note for this span") : null;
    if (label === "note" && !text) return;
    await post("/api/annotations", { trace_id: traceId, span_id: spanId, label, text });
    toast(`Marked as ${label}`);
    onAnnotate();
  };
  return (
    <div className="card span-panel section">
      <div className="card-head">
        <h3 style={{ textTransform: "none", letterSpacing: 0, fontSize: 14, color: "var(--ink)" }}>
          <span className="kind-tag" style={{ background: kindColor(d.kind) }}>
            {d.kind}
          </span>
          {v.toolName ?? d.name}
          {d.status.code === 2 && <Pill kind="error">error</Pill>}
        </h3>
        <div className="label-row">
          <div className="tabs">
            <button className={tab === "io" ? "on" : ""} onClick={() => setTab("io")}>
              Input / output
            </button>
            <button className={tab === "attrs" ? "on" : ""} onClick={() => setTab("attrs")}>
              Attributes
            </button>
            <button className={tab === "raw" ? "on" : ""} onClick={() => setTab("raw")}>
              Raw
            </button>
          </div>
          <button className="btn small ghost" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      <div className="card-body">
        <div className="label-row hint" style={{ marginBottom: 12 }}>
          <span className="mono">{d.span_id}</span>
          {v.model && <span>model {v.model}</span>}
          {v.totalTokens !== undefined && (
            <span>
              tokens {v.promptTokens ?? "?"} in · {v.completionTokens ?? "?"} out
            </span>
          )}
          <span>{dur(Number(BigInt(d.end_ns || "0") - BigInt(d.start_ns || "0")) / 1e6)}</span>
          {annotations.map((a) => (
            <Pill key={a.id} kind={a.label === "issue" ? "error" : a.label === "good" ? "ok" : ""}>
              {a.label}
              {a.text ? `: ${a.text}` : ""}
            </Pill>
          ))}
          <span style={{ flex: 1 }} />
          <button className="btn small ghost" onClick={() => annotate("issue")}>
            Mark issue
          </button>
          <button className="btn small ghost" onClick={() => annotate("good")}>
            Mark good
          </button>
          <button className="btn small ghost" onClick={() => annotate("note")}>
            Note
          </button>
        </div>
        {findings.length > 0 && (
          <div className="hint" style={{ marginBottom: 12, color: "var(--signal)" }}>
            Evidence for: {findings.map((f) => f.title).join(" · ")}
          </div>
        )}
        {v.error && (
          <pre className="json" style={{ borderColor: "var(--err)", color: "var(--err)", marginBottom: 12 }}>
            {v.error}
          </pre>
        )}
        {tab === "io" && (
          <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div className="hint" style={{ marginBottom: 6 }}>
                Input
              </div>
              <Messages value={v.input} />
            </div>
            <div>
              <div className="hint" style={{ marginBottom: 6 }}>
                Output
              </div>
              <Messages value={v.output} />
              {v.tools && v.tools.length > 0 && <div className="hint">tools offered: {v.tools.join(", ")}</div>}
            </div>
          </div>
        )}
        {tab === "attrs" && (
          <div className="kv mono">
            {Object.entries(d.attributes).map(([k, val]) => (
              <Frag key={k} k={k} v={val} />
            ))}
            <div className="dim">resource</div>
            <div className="dim">{d.scope.name}</div>
            {Object.entries(d.resource).map(([k, val]) => (
              <Frag key={`r-${k}`} k={k} v={val} />
            ))}
            {d.events.map((e, i) => (
              <Frag key={`e-${i}`} k={`event: ${e.name}`} v={e.attributes} />
            ))}
          </div>
        )}
        {tab === "raw" && <pre className="json">{JSON.stringify(d, null, 2)}</pre>}
      </div>
    </div>
  );
}

function Frag({ k, v }: { k: string; v: unknown }) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return (
    <>
      <div>{k}</div>
      <div>{s.length > 2000 ? s.slice(0, 2000) + "…" : s}</div>
    </>
  );
}
