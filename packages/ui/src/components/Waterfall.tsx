import { useMemo } from "react";
import type { Finding, Run, Span } from "../api";
import { dur, kindColor } from "../format";

interface Row {
  span: Span;
  depth: number;
}

function treeOrder(spans: Span[]): Row[] {
  const ids = new Set(spans.map((s) => s.span_id));
  const children = new Map<string | null, Span[]>();
  for (const s of spans) {
    const parent = s.parent_span_id && ids.has(s.parent_span_id) ? s.parent_span_id : null;
    children.set(parent, [...(children.get(parent) ?? []), s]);
  }
  for (const list of children.values()) list.sort((a, b) => a.start_ms - b.start_ms);
  const out: Row[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const s of children.get(parent) ?? []) {
      out.push({ span: s, depth });
      walk(s.span_id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

const KIND_LABEL: Record<string, string> = {
  WORKFLOW: "FLOW",
  AGENT: "AGENT",
  LLM: "LLM",
  TOOL: "TOOL",
  MCP_TOOL: "MCP",
  RETRIEVER: "RETR",
  RERANKER: "RANK",
  EMBEDDING: "EMB",
  GUARDRAIL: "BOLTS",
  CHAIN: "CHAIN",
  TASK: "TASK",
};

export function Waterfall({
  spans,
  run,
  flagged,
  selected,
  onSelect,
}: {
  spans: Span[];
  run: Run;
  flagged: Map<string, Finding[]>;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const rows = useMemo(() => treeOrder(spans), [spans]);
  if (!rows.length) return <div className="card-body muted">No spans yet.</div>;
  const start = Math.min(...spans.map((s) => s.start_ms));
  const end = Math.max(...spans.map((s) => s.end_ms), start + 1);
  const total = end - start;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="waterfall">
      <div className="wf-axis mono">
        <span>span</span>
        <div className="wf-ticks" style={{ margin: "0 10px" }}>
          {ticks.map((t) => (
            <span key={t} style={{ left: `${t * 100}%` }}>
              {t === 0 ? "0" : dur(total * t)}
            </span>
          ))}
        </div>
        <span style={{ textAlign: "right" }}>dur</span>
      </div>
      {rows.map(({ span: s, depth }) => {
        const left = ((s.start_ms - start) / total) * 100;
        const width = Math.max(0.4, (s.duration_ms / total) * 100);
        const isFlagged = flagged.has(s.span_id);
        const guidance = s.name === "bolts.guidance";
        const label = guidance ? `note sent: ${s.input_preview ?? ""}` : s.tool_name ?? s.name;
        return (
          <div key={s.span_id} className={`wf-row ${selected === s.span_id ? "selected" : ""}`} onClick={() => onSelect(s.span_id)} title={s.error ?? s.output_preview ?? ""}>
            <div className="wf-name" style={{ paddingLeft: depth * 14 }}>
              <span className="kind-tag" style={{ background: kindColor(s.span_kind) }}>
                {KIND_LABEL[s.span_kind] ?? s.span_kind.slice(0, 5)}
              </span>
              <span className="label" style={guidance ? { color: "var(--signal)" } : s.status_code === 2 ? { color: "var(--err)" } : undefined}>
                {label}
              </span>
              {s.tool_result && s.tool_result !== "success" && s.status_code !== 2 && <span className="hint">· {s.tool_result}</span>}
              {s.model && <span className="hint mono">{s.model}</span>}
            </div>
            <div className="wf-track">
              <div
                className={`wf-bar ${s.status_code === 2 ? "err" : ""} ${isFlagged ? "flagged" : ""}`}
                style={{ left: `${left}%`, width: `${width}%`, background: kindColor(s.span_kind) }}
              />
            </div>
            <div className="wf-dur mono">{dur(s.duration_ms)}</div>
          </div>
        );
      })}
      {run.status === "running" && (
        <div style={{ position: "relative", height: 0 }}>
          <div className="wf-scan" />
        </div>
      )}
    </div>
  );
}
