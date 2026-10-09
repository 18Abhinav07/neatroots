import { toBatches, type SpanNode } from "../build.js";
import { getJson, iso, trimSlash, ImportError, type ImportSource } from "./types.js";

// Neatlogs Cloud Public API (app.neatlogs.com/api/v1/public), with the same project API key
// neatroots uses to send runs (x-api-key). A trace comes from /traces/{id}/export (trace and
// spans) plus each span's input, output and error from /spans/{id}/payload.

export interface CloudTraceSummary {
  traceId: string;
  traceName?: string | null;
  workflowName?: string | null;
  sessionId?: string | null;
  startedAt: string;
  durationMs?: number | null;
  status?: string | null;
  spansCount?: number | null;
  llmCallsCount?: number | null;
  toolCallsCount?: number | null;
  totalTokens?: number | null;
}

interface CloudSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  spanName: string;
  spanType: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  status: string;
  model: string | null;
  provider: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface Field {
  available: boolean;
  value: string | null;
  truncated?: boolean;
}

/** The public API's host for an ingest endpoint: ingest.neatlogs.com → app.neatlogs.com. */
export function cloudApiBase(ingest: string, override?: string): string {
  if (override) return trimSlash(override);
  try {
    const u = new URL(ingest);
    if (u.hostname.endsWith("neatlogs.com")) u.hostname = u.hostname.replace(/(^|\.)ingest\./, "$1app.");
    return `${u.origin}/api/v1/public`;
  } catch {
    return "https://app.neatlogs.com/api/v1/public";
  }
}

const headers = (key: string) => ({ "x-api-key": key, accept: "application/json" });

export async function listCloudTraces(
  base: string,
  key: string,
  opts: { limit?: number; cursor?: string; sinceMs?: number; untilMs?: number; workflowName?: string; signal?: AbortSignal } = {},
): Promise<{ traces: CloudTraceSummary[]; nextCursor: string | null }> {
  const q = new URLSearchParams({ limit: String(Math.min(50, opts.limit ?? 50)) });
  if (opts.cursor) q.set("cursor", opts.cursor);
  if (opts.sinceMs) q.set("from", iso(opts.sinceMs));
  if (opts.untilMs) q.set("to", iso(opts.untilMs));
  if (opts.workflowName) q.set("workflowName", opts.workflowName);
  const r = await getJson<{ data: { traces: CloudTraceSummary[]; page: { nextCursor: string | null; hasMore: boolean } } }>(`${base}/traces?${q}`, {
    headers: headers(key),
    signal: opts.signal ?? AbortSignal.timeout(30_000),
  });
  return { traces: r.data.traces, nextCursor: r.data.page.hasMore ? r.data.page.nextCursor : null };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

/** One cloud trace as span nodes, payloads included. */
export async function fetchCloudTrace(base: string, key: string, traceId: string, signal: AbortSignal = AbortSignal.timeout(120_000)): Promise<{ nodes: SpanNode[]; workflow: string }> {
  const id = encodeURIComponent(traceId);
  const exp = await getJson<{ data: { trace?: CloudTraceSummary & { tags?: string[] }; spans?: CloudSpan[] } }>(`${base}/traces/${id}/export?format=json`, { headers: headers(key), signal });
  const trace = exp.data.trace;
  const spans = exp.data.spans;
  if (!trace || !Array.isArray(spans)) throw new ImportError("Neatlogs Cloud did not return the trace's spans");
  const payloads = await pool(spans, 4, (s) =>
    getJson<{ data: { fields: { input?: Field; output?: Field; error?: Field } } }>(`${base}/traces/${id}/spans/${encodeURIComponent(s.spanId)}/payload?fields=input,output,error`, {
      headers: headers(key),
      signal,
    })
      .then((r) => r.data.fields)
      .catch(() => ({}) as { input?: Field; output?: Field; error?: Field }),
  );
  const ids = new Set(spans.map((s) => s.spanId));
  const nodes = spans.map<SpanNode>((s, i) => {
    const f = payloads[i] ?? {};
    const err = f.error?.available ? f.error.value : null;
    return {
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId: s.parentSpanId && ids.has(s.parentSpanId) ? s.parentSpanId : null,
      name: s.spanName,
      kind: s.spanType,
      start: s.startedAt,
      end: s.endedAt,
      durationMs: s.durationMs,
      status: s.status?.toUpperCase().startsWith("ERR") ? "ERROR" : "OK",
      error: err || (s.status?.toUpperCase().startsWith("ERR") ? "error" : null),
      input: f.input?.available ? f.input.value : undefined,
      output: f.output?.available ? f.output.value : undefined,
      model: s.model,
      provider: s.provider,
      promptTokens: s.promptTokens,
      completionTokens: s.completionTokens,
      totalTokens: s.totalTokens,
      toolName: /tool/i.test(s.spanType) ? s.spanName : null,
      sessionId: trace.sessionId ?? null,
      attributes: { "neatroots.import.cloud_trace_id": traceId },
    };
  });
  return { nodes, workflow: trace.workflowName || trace.traceName || "neatlogs-cloud" };
}

/** Built by the import runner with the stored cloud key and API base. */
export function neatlogsCloudSource(base: () => string, key: () => Promise<string | undefined>): ImportSource {
  return {
    id: "neatlogs-cloud",
    label: "Neatlogs Cloud",
    description: "Traces from your Neatlogs Cloud project, with the API key stored in Settings → Neatlogs Cloud.",
    fields: [{ name: "traceIds", label: "Trace ids (comma-separated; empty imports the most recent)", placeholder: "4bf92f35…" }],
    async *traces(o) {
      const k = await key();
      if (!k) throw new ImportError("store your Neatlogs Cloud API key first (Settings → Neatlogs Cloud, or neatroots cloud login)");
      const b = base();
      let ids = (o.values.traceIds ?? "").split(/[\s,]+/).filter(Boolean);
      if (!ids.length) {
        let cursor: string | undefined;
        do {
          const page = await listCloudTraces(b, k, { cursor, sinceMs: o.sinceMs, untilMs: o.untilMs, signal: o.signal });
          ids.push(...page.traces.map((t) => t.traceId));
          cursor = page.nextCursor ?? undefined;
        } while (cursor && ids.length < o.limit);
        ids = ids.slice(0, o.limit);
      }
      for (const id of ids) {
        const { nodes, workflow } = await fetchCloudTrace(b, k, id, o.signal);
        yield { sourceId: id, batches: toBatches(nodes, { project: o.project || workflow, source: "neatlogs-cloud" }) };
      }
    },
  };
}
