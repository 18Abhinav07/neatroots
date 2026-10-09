import { toBatches, toNs, type SpanNode } from "../build.js";
import { getJson, iso, type ImportSource } from "./types.js";

// Raindrop Query API (query.raindrop.ai): events, and the spans recorded for each event.
// An event without spans still becomes a run: the user input and the assistant output.

interface RdEvent {
  id: string;
  event_name: string;
  user_id?: string | null;
  convo_id?: string | null;
  timestamp: string;
  user_input?: string | null;
  assistant_output?: string | null;
  model?: string | null;
  tool_calls?: { tool_name: string; status?: string; duration_ms?: number; started_at?: string; span_id?: string }[];
  properties?: Record<string, unknown>;
}

interface RdSpan {
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  span_name: string;
  span_type?: string | null;
  status?: string | null;
  start_time_ns: number;
  end_time_ns?: number | null;
  input?: string | null;
  output?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  model?: string | null;
  provider?: string | null;
  attributes?: Record<string, unknown> | null;
}

export const raindrop: ImportSource = {
  id: "raindrop",
  label: "Raindrop",
  description: "Events and their traces from Raindrop, through its read-only Query API.",
  fields: [
    { name: "apiKey", label: "Query API key (not the write key)", required: true, secret: true, env: "RAINDROP_QUERY_API_KEY" },
    { name: "sourceProject", label: "Raindrop project slug", placeholder: "default", env: "RAINDROP_PROJECT" },
  ],
  async *traces(o) {
    const base = "https://query.raindrop.ai";
    const headers: Record<string, string> = { authorization: `Bearer ${o.values.apiKey}` };
    if (o.values.sourceProject) headers["x-raindrop-project-id"] = o.values.sourceProject;
    let cursor: string | undefined;
    let count = 0;
    do {
      const q = new URLSearchParams({ limit: "100", "timestamp[gte]": iso(o.sinceMs), "timestamp[lt]": iso(o.untilMs) });
      if (cursor) q.set("cursor", cursor);
      const r = await getJson<{ data: RdEvent[]; meta?: { cursor?: string; has_more?: boolean } }>(`${base}/v1/events?${q}`, { headers, signal: o.signal });
      for (const e of r.data ?? []) {
        if (count >= o.limit) return;
        const spans = await getJson<{ data: RdSpan[] }>(`${base}/v1/traces?${new URLSearchParams({ event_id: e.id, limit: "1000" })}`, { headers, signal: o.signal }).catch(() => ({ data: [] as RdSpan[] }));
        count++;
        yield { sourceId: e.id, batches: toBatches(raindropNodes(e, spans.data ?? []), { project: o.project || e.event_name || "raindrop", source: "raindrop" }) };
      }
      cursor = r.meta?.has_more ? r.meta.cursor : undefined;
    } while (cursor && count < o.limit);
  },
};

export function raindropNodes(e: RdEvent, spans: RdSpan[]): SpanNode[] {
  if (spans.length) {
    const ids = new Set(spans.map((s) => s.span_id));
    return spans.map((s) => ({
      traceId: s.trace_id,
      spanId: s.span_id,
      parentSpanId: s.parent_span_id && ids.has(s.parent_span_id) ? s.parent_span_id : null,
      name: s.span_name,
      kind: s.span_type ?? (s.model ? "llm" : null),
      start: s.start_time_ns,
      end: s.end_time_ns ?? null,
      status: s.status,
      error: (s.status ?? "").toLowerCase() === "error" ? (s.output ?? "error") : null,
      input: s.input,
      output: s.output,
      model: s.model,
      provider: s.provider,
      promptTokens: s.input_tokens,
      completionTokens: s.output_tokens,
      sessionId: e.convo_id,
      userId: e.user_id,
      attributes: s.attributes ?? undefined,
    }));
  }
  // No spans: one run with the conversation turn and the tool calls Raindrop summarised.
  const start = Number(toNs(e.timestamp) ?? 0n);
  const tools = (e.tool_calls ?? []).map<SpanNode>((t, i) => ({
    traceId: e.id,
    spanId: t.span_id ?? `${e.id}:tool:${i}`,
    parentSpanId: `${e.id}:root`,
    name: t.tool_name,
    kind: "tool",
    toolName: t.tool_name,
    start: t.started_at ?? start,
    durationMs: t.duration_ms ?? 0,
    status: t.status,
    error: (t.status ?? "").toLowerCase() === "error" ? "tool call failed" : null,
  }));
  const end = Math.max(start, ...tools.map((t) => Number(toNs(t.start) ?? 0n) + (t.durationMs ?? 0) * 1e6));
  return [
    { traceId: e.id, spanId: `${e.id}:root`, name: e.event_name, kind: "agent", start, end, input: e.user_input, output: e.assistant_output, model: e.model, sessionId: e.convo_id, userId: e.user_id, attributes: e.properties ? { "neatlogs.metadata": e.properties } : undefined },
    ...tools,
  ];
}
