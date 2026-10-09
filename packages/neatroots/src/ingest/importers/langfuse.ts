import { toBatches, type SpanNode } from "../build.js";
import { getJson, iso, trimSlash, type ImportSource } from "./types.js";

// Langfuse public API: traces, then each trace's observations (spans, generations, events).
// https://api.reference.langfuse.com — Basic auth with the public and secret key.

interface LfTrace {
  id: string;
  timestamp: string;
  name?: string | null;
  input?: unknown;
  output?: unknown;
  sessionId?: string | null;
  userId?: string | null;
  tags?: string[];
}

interface LfObservation {
  id: string;
  traceId: string;
  type: string;
  name?: string | null;
  startTime: string;
  endTime?: string | null;
  model?: string | null;
  input?: unknown;
  output?: unknown;
  usage?: { input?: number; output?: number; total?: number } | null;
  usageDetails?: Record<string, number> | null;
  level?: string | null;
  statusMessage?: string | null;
  parentObservationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface Page<T> {
  data: T[];
  meta: { page: number; totalPages: number };
}

export const langfuse: ImportSource = {
  id: "langfuse",
  label: "Langfuse",
  description: "Traces and their observations from Langfuse Cloud or a self-hosted Langfuse.",
  fields: [
    { name: "publicKey", label: "Public key", required: true, placeholder: "pk-lf-…", env: "LANGFUSE_PUBLIC_KEY" },
    { name: "secretKey", label: "Secret key", required: true, secret: true, placeholder: "sk-lf-…", env: "LANGFUSE_SECRET_KEY" },
    { name: "host", label: "Host", placeholder: "https://cloud.langfuse.com", env: "LANGFUSE_HOST", default: "https://cloud.langfuse.com" },
  ],
  async *traces(o) {
    const host = trimSlash(o.values.host || "https://cloud.langfuse.com");
    const headers = { authorization: `Basic ${Buffer.from(`${o.values.publicKey}:${o.values.secretKey}`).toString("base64")}` };
    let count = 0;
    for (let page = 1; count < o.limit; page++) {
      const q = new URLSearchParams({ page: String(page), limit: "50", fromTimestamp: iso(o.sinceMs), toTimestamp: iso(o.untilMs) });
      const traces = await getJson<Page<LfTrace>>(`${host}/api/public/traces?${q}`, { headers, signal: o.signal });
      for (const t of traces.data) {
        if (count >= o.limit) return;
        const obs: LfObservation[] = [];
        for (let p = 1; ; p++) {
          const r = await getJson<Page<LfObservation>>(`${host}/api/public/observations?${new URLSearchParams({ traceId: t.id, page: String(p), limit: "100" })}`, { headers, signal: o.signal });
          obs.push(...r.data);
          if (p >= (r.meta?.totalPages ?? 1) || !r.data.length) break;
        }
        count++;
        yield { sourceId: t.id, batches: toBatches(langfuseNodes(t, obs), { project: o.project || t.name || "langfuse", source: "langfuse" }) };
      }
      if (page >= (traces.meta?.totalPages ?? 1) || !traces.data.length) return;
    }
  },
};

export function langfuseNodes(t: LfTrace, obs: LfObservation[]): SpanNode[] {
  const rootId = `trace:${t.id}`;
  const ends = obs.map((x) => Date.parse(x.endTime ?? x.startTime)).filter(Number.isFinite);
  const root: SpanNode = {
    traceId: t.id,
    spanId: rootId,
    name: t.name || "trace",
    kind: "workflow",
    start: t.timestamp,
    end: ends.length ? Math.max(Date.parse(t.timestamp), ...ends) : t.timestamp,
    input: t.input,
    output: t.output,
    sessionId: t.sessionId,
    userId: t.userId,
    attributes: t.tags?.length ? { "neatlogs.tags": t.tags.join(",") } : undefined,
  };
  const ids = new Set(obs.map((x) => x.id));
  const nodes = obs.map<SpanNode>((x) => {
    const usage = x.usageDetails ?? x.usage ?? {};
    return {
      traceId: t.id,
      spanId: x.id,
      parentSpanId: x.parentObservationId && ids.has(x.parentObservationId) ? x.parentObservationId : rootId,
      name: x.name || x.type.toLowerCase(),
      kind: x.type,
      start: x.startTime,
      end: x.endTime ?? x.startTime,
      error: x.level === "ERROR" ? x.statusMessage || "error" : null,
      input: x.input,
      output: x.output,
      model: x.model,
      promptTokens: usage.input ?? null,
      completionTokens: usage.output ?? null,
      totalTokens: usage.total ?? null,
      toolName: x.type === "TOOL" ? x.name : null,
      sessionId: t.sessionId,
      attributes: x.metadata ? { "neatlogs.metadata": x.metadata } : undefined,
    };
  });
  return [root, ...nodes];
}
