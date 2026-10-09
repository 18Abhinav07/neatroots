import { toBatches, type SpanNode } from "../build.js";
import { getJson, trimSlash, ImportError, type ImportSource } from "./types.js";

// Braintrust REST API: resolve the project, then page through its logs with
// POST /v1/project_logs/{id}/fetch. Each event is one span; root_span_id is the trace.

interface BtEvent {
  id: string;
  span_id: string;
  root_span_id: string;
  span_parents?: string[] | null;
  created?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown> | null;
  metrics?: { start?: number; end?: number; prompt_tokens?: number; completion_tokens?: number; tokens?: number } | null;
  span_attributes?: { name?: string; type?: string } | null;
}

export const braintrust: ImportSource = {
  id: "braintrust",
  label: "Braintrust",
  description: "Project logs (spans and their inputs, outputs and metrics) from Braintrust.",
  fields: [
    { name: "apiKey", label: "API key", required: true, secret: true, env: "BRAINTRUST_API_KEY" },
    { name: "sourceProject", label: "Braintrust project", required: true, env: "BRAINTRUST_PROJECT" },
    { name: "host", label: "API URL", placeholder: "https://api.braintrust.dev (EU: https://api-eu.braintrust.dev)", env: "BRAINTRUST_API_URL", default: "https://api.braintrust.dev" },
  ],
  async *traces(o) {
    const host = trimSlash(o.values.host || "https://api.braintrust.dev");
    const headers = { authorization: `Bearer ${o.values.apiKey}`, "content-type": "application/json" };
    const projects = await getJson<{ objects: { id: string; name: string }[] }>(`${host}/v1/project?${new URLSearchParams({ project_name: o.values.sourceProject })}`, { headers, signal: o.signal });
    const project = projects.objects?.find((p) => p.name === o.values.sourceProject) ?? projects.objects?.[0];
    if (!project) throw new ImportError(`no Braintrust project named "${o.values.sourceProject}"`);
    const byTrace = new Map<string, BtEvent[]>();
    let cursor: string | undefined;
    do {
      const body: Record<string, unknown> = { limit: 500 };
      if (cursor) body.cursor = cursor;
      const r = await getJson<{ events: BtEvent[]; cursor?: string | null }>(`${host}/v1/project_logs/${project.id}/fetch`, { method: "POST", headers, body: JSON.stringify(body), signal: o.signal });
      for (const e of r.events ?? []) {
        const startMs = (e.metrics?.start ?? 0) * 1000 || Date.parse(e.created ?? "");
        if (startMs < o.sinceMs || startMs >= o.untilMs) continue;
        const list = byTrace.get(e.root_span_id) ?? [];
        list.push(e);
        byTrace.set(e.root_span_id, list);
      }
      cursor = r.cursor ?? undefined;
      if (!r.events?.length) break;
    } while (cursor && byTrace.size < o.limit * 2);
    let count = 0;
    for (const [root, events] of byTrace) {
      if (count++ >= o.limit) return;
      yield { sourceId: root, batches: toBatches(braintrustNodes(events), { project: o.project || project.name, source: "braintrust" }) };
    }
  },
};

export function braintrustNodes(events: BtEvent[]): SpanNode[] {
  const ids = new Set(events.map((e) => e.span_id));
  return events.map((e) => {
    const parent = e.span_parents?.find((p) => ids.has(p)) ?? null;
    const type = e.span_attributes?.type ?? (parent ? "task" : "workflow");
    const meta = e.metadata ?? {};
    return {
      traceId: e.root_span_id,
      spanId: e.span_id,
      parentSpanId: parent,
      name: e.span_attributes?.name ?? type,
      kind: type === "task" || type === "function" ? (parent ? "chain" : "workflow") : type,
      start: e.metrics?.start ? e.metrics.start * 1000 : (e.created ?? Date.now()),
      end: e.metrics?.end ? e.metrics.end * 1000 : null,
      error: e.error ? (typeof e.error === "string" ? e.error : JSON.stringify(e.error)) : null,
      input: e.input,
      output: e.output,
      model: (meta.model as string) ?? null,
      provider: (meta.provider as string) ?? null,
      promptTokens: e.metrics?.prompt_tokens ?? null,
      completionTokens: e.metrics?.completion_tokens ?? null,
      totalTokens: e.metrics?.tokens ?? null,
      toolName: type === "tool" ? (e.span_attributes?.name ?? null) : null,
      attributes: Object.keys(meta).length ? { "neatlogs.metadata": meta } : undefined,
    };
  });
}
