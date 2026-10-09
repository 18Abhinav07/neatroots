import type { KeyValue, OtlpSpan, ResourceSpansBatch } from "../../otlp/types.js";
import { plainToAny, STATUS_ERROR, STATUS_OK, STATUS_UNSET } from "../../otlp/types.js";
import { hexId, toNs } from "../build.js";
import { getJson, iso, trimSlash, ImportError, type ImportSource } from "./types.js";

// Arize Phoenix REST API: GET /v1/projects/{project}/spans. Phoenix spans are OpenInference
// spans, so their attributes are kept as they are; neatroots already reads OpenInference.

interface PxSpan {
  id?: string;
  name: string;
  context: { trace_id: string; span_id: string };
  span_kind?: string;
  parent_id?: string | null;
  start_time: string;
  end_time?: string | null;
  status_code?: string;
  status_message?: string;
  attributes?: Record<string, unknown>;
  events?: { name: string; timestamp?: string; attributes?: Record<string, unknown> }[];
}

/** Nested attribute objects ({llm: {model_name: …}}) to the dotted keys OpenInference uses. */
export function flatten(obj: Record<string, unknown>, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
    else if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) v.forEach((x, i) => (x && typeof x === "object" ? flatten(x as Record<string, unknown>, `${key}.${i}`, out) : (out[`${key}.${i}`] = x)));
    else out[key] = v;
  }
  return out;
}

const kvs = (o: Record<string, unknown>): KeyValue[] => Object.entries(o).filter(([, v]) => v !== null && v !== undefined).map(([key, v]) => ({ key, value: plainToAny(v) }));

export function phoenixSpan(s: PxSpan): OtlpSpan {
  const attrs = flatten(s.attributes ?? {});
  if (s.span_kind && !attrs["openinference.span.kind"]) attrs["openinference.span.kind"] = s.span_kind;
  const start = toNs(s.start_time) ?? 0n;
  const end = toNs(s.end_time ?? undefined) ?? start;
  const code = s.status_code === "ERROR" ? STATUS_ERROR : s.status_code === "OK" ? STATUS_OK : STATUS_UNSET;
  return {
    traceId: hexId(s.context.trace_id, 16),
    spanId: hexId(s.context.span_id, 8),
    parentSpanId: s.parent_id ? hexId(s.parent_id, 8) : "",
    name: s.name,
    kind: 1,
    startTimeUnixNano: String(start),
    endTimeUnixNano: String(end),
    attributes: kvs(attrs),
    events: (s.events ?? []).map((e) => ({ name: e.name, timeUnixNano: String(toNs(e.timestamp) ?? start), attributes: kvs(flatten(e.attributes ?? {})) })),
    links: [],
    status: code === STATUS_ERROR ? { code, message: s.status_message ?? "error" } : { code },
  };
}

export const phoenix: ImportSource = {
  id: "phoenix",
  label: "Arize Phoenix",
  description: "OpenInference spans from a Phoenix server or Phoenix Cloud space.",
  fields: [
    { name: "baseUrl", label: "Phoenix URL", required: true, placeholder: "http://localhost:6006 or https://app.phoenix.arize.com/s/<space>", env: "PHOENIX_COLLECTOR_ENDPOINT", default: "http://localhost:6006" },
    { name: "apiKey", label: "API key (Phoenix Cloud)", secret: true, env: "PHOENIX_API_KEY" },
    { name: "sourceProject", label: "Phoenix project", required: true, placeholder: "default", env: "PHOENIX_PROJECT_NAME", default: "default" },
  ],
  async *traces(o) {
    const base = trimSlash(o.values.baseUrl || "http://localhost:6006");
    const headers: Record<string, string> = o.values.apiKey ? { authorization: `Bearer ${o.values.apiKey}` } : {};
    const project = o.values.sourceProject || "default";
    const byTrace = new Map<string, OtlpSpan[]>();
    let cursor: string | null | undefined;
    do {
      const q = new URLSearchParams({ start_time: iso(o.sinceMs), end_time: iso(o.untilMs), limit: "1000" });
      if (cursor) q.set("cursor", cursor);
      const r = await getJson<{ data: PxSpan[]; next_cursor?: string | null }>(`${base}/v1/projects/${encodeURIComponent(project)}/spans?${q}`, { headers, signal: o.signal });
      if (!Array.isArray(r.data)) throw new ImportError("Phoenix returned no span list; check the URL and project");
      for (const s of r.data) {
        const span = phoenixSpan(s);
        const list = byTrace.get(span.traceId) ?? [];
        list.push(span);
        byTrace.set(span.traceId, list);
      }
      cursor = r.next_cursor;
    } while (cursor && byTrace.size < o.limit * 2);
    let count = 0;
    for (const [traceId, spans] of byTrace) {
      if (count++ >= o.limit) return;
      const batch: ResourceSpansBatch = {
        resource: { attributes: kvs({ "service.name": o.project || project, "neatroots.import.source": "phoenix" }) },
        scope: { name: "neatroots.import.phoenix" },
        spans,
      };
      yield { sourceId: traceId, batches: [batch] };
    }
  },
};
