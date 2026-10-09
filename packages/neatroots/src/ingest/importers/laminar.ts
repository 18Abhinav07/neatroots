import { toBatches, type SpanNode } from "../build.js";
import { getJson, trimSlash, type ImportSource } from "./types.js";

// Laminar SQL API (POST /v1/sql/query, read-only ClickHouse SQL scoped to the key's project):
// spans in the window, plus each trace's session and user from the traces table.

interface LmSpan {
  span_id: string;
  trace_id: string;
  parent_span_id?: string | null;
  name: string;
  span_type?: string | null;
  start_time: string;
  end_time?: string | null;
  input?: string | null;
  output?: string | null;
  attributes?: string | null;
  status?: string | null;
  model?: string | null;
  provider?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
}

const NIL = "00000000-0000-0000-0000-000000000000";
/** ClickHouse "2026-10-09 12:00:00.123456789" (UTC) to ISO. */
const chTime = (t: string) => (t.includes("T") ? t : `${t.replace(" ", "T")}Z`);
const chLit = (ms: number) => `parseDateTime64BestEffort('${new Date(ms).toISOString()}', 9)`;

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  const d = (r as { data?: unknown; result?: unknown }).data ?? (r as { result?: unknown }).result;
  return Array.isArray(d) ? (d as T[]) : [];
}

export const laminar: ImportSource = {
  id: "laminar",
  label: "Laminar",
  description: "Spans and traces from a Laminar project, through its read-only SQL API.",
  fields: [
    { name: "apiKey", label: "Project API key", required: true, secret: true, env: "LMNR_PROJECT_API_KEY" },
    { name: "baseUrl", label: "API URL", placeholder: "https://api.lmnr.ai", env: "LMNR_BASE_URL", default: "https://api.lmnr.ai" },
  ],
  async *traces(o) {
    const base = trimSlash(o.values.baseUrl || "https://api.lmnr.ai");
    const headers = { authorization: `Bearer ${o.values.apiKey}`, "content-type": "application/json" };
    const sql = (query: string) => getJson<unknown>(`${base}/v1/sql/query`, { method: "POST", headers, body: JSON.stringify({ query }), signal: o.signal, timeoutMs: 60_000 });
    const window = `start_time >= ${chLit(o.sinceMs)} AND start_time < ${chLit(o.untilMs)}`;
    const traces = rows<{ id: string; session_id?: string; user_id?: string; top_span_name?: string }>(
      await sql(`SELECT id, session_id, user_id, top_span_name FROM traces WHERE ${window} ORDER BY start_time DESC LIMIT ${Math.max(1, o.limit)}`),
    );
    if (!traces.length) return;
    const ids = traces.map((t) => `'${String(t.id).replace(/'/g, "")}'`).join(",");
    const spans = rows<LmSpan>(
      await sql(
        `SELECT span_id, trace_id, parent_span_id, name, span_type, start_time, end_time, input, output, attributes, status, model, provider, input_tokens, output_tokens, total_tokens FROM spans WHERE ${window} AND trace_id IN (${ids}) ORDER BY start_time LIMIT 50000`,
      ),
    );
    const byTrace = new Map<string, LmSpan[]>();
    for (const s of spans) byTrace.set(s.trace_id, [...(byTrace.get(s.trace_id) ?? []), s]);
    for (const t of traces) {
      const list = byTrace.get(t.id);
      if (!list?.length) continue;
      yield { sourceId: t.id, batches: toBatches(laminarNodes(list, t), { project: o.project || t.top_span_name || "laminar", source: "laminar" }) };
    }
  },
};

export function laminarNodes(spans: LmSpan[], t: { session_id?: string; user_id?: string }): SpanNode[] {
  const ids = new Set(spans.map((s) => s.span_id));
  return spans.map((s) => {
    let attrs: Record<string, unknown> = {};
    try {
      attrs = s.attributes ? (JSON.parse(s.attributes) as Record<string, unknown>) : {};
    } catch {
      /* not JSON */
    }
    const type = (s.span_type ?? "DEFAULT").toUpperCase();
    return {
      traceId: s.trace_id,
      spanId: s.span_id,
      parentSpanId: s.parent_span_id && s.parent_span_id !== NIL && ids.has(s.parent_span_id) ? s.parent_span_id : null,
      name: s.name,
      kind: type === "DEFAULT" || type === "EXECUTOR" ? "chain" : type === "EVALUATOR" || type === "EVALUATION" || type === "HUMAN_EVALUATOR" ? "internal" : type,
      start: chTime(s.start_time),
      end: s.end_time ? chTime(s.end_time) : null,
      status: s.status,
      error: (s.status ?? "").toLowerCase() === "error" ? "error" : null,
      input: s.input,
      output: s.output,
      model: s.model || null,
      provider: s.provider || null,
      promptTokens: s.input_tokens,
      completionTokens: s.output_tokens,
      totalTokens: s.total_tokens,
      toolName: type === "TOOL" ? s.name : null,
      sessionId: t.session_id || null,
      userId: t.user_id || null,
      attributes: attrs,
    };
  });
}
