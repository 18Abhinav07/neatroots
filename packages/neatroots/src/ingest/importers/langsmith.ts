import { toBatches, type SpanNode } from "../build.js";
import { getJson, iso, trimSlash, ImportError, type ImportSource } from "./types.js";

// LangSmith REST API: find the tracing project (a "session"), query its runs in the window,
// and group them by trace. x-api-key auth.

interface LsRun {
  id: string;
  name: string;
  run_type: string;
  start_time: string;
  end_time?: string | null;
  inputs?: unknown;
  outputs?: unknown;
  error?: string | null;
  parent_run_id?: string | null;
  trace_id: string;
  session_id?: string;
  extra?: { metadata?: Record<string, unknown>; invocation_params?: Record<string, unknown> } | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  tags?: string[] | null;
}

export const langsmith: ImportSource = {
  id: "langsmith",
  label: "LangSmith",
  description: "Runs from a LangSmith tracing project, grouped into traces.",
  fields: [
    { name: "apiKey", label: "API key", required: true, secret: true, placeholder: "lsv2_…", env: "LANGSMITH_API_KEY" },
    { name: "sourceProject", label: "LangSmith project", required: true, placeholder: "default", env: "LANGSMITH_PROJECT" },
    { name: "host", label: "API URL", placeholder: "https://api.smith.langchain.com", env: "LANGSMITH_ENDPOINT", default: "https://api.smith.langchain.com" },
  ],
  async *traces(o) {
    const host = trimSlash(o.values.host || "https://api.smith.langchain.com");
    const headers = { "x-api-key": o.values.apiKey, "content-type": "application/json" };
    const sessions = await getJson<{ id: string; name: string }[]>(`${host}/api/v1/sessions?${new URLSearchParams({ name: o.values.sourceProject })}`, { headers, signal: o.signal });
    const session = sessions.find((s) => s.name === o.values.sourceProject) ?? sessions[0];
    if (!session) throw new ImportError(`no LangSmith project named "${o.values.sourceProject}"`);
    const byTrace = new Map<string, LsRun[]>();
    let cursor: string | null | undefined;
    // Runs come newest first; keep paging until enough whole traces are in hand.
    do {
      const body: Record<string, unknown> = { session: [session.id], start_time: iso(o.sinceMs), limit: 100 };
      if (cursor) body.cursor = cursor;
      const r = await getJson<{ runs: LsRun[]; cursors?: { next?: string | null } }>(`${host}/api/v1/runs/query`, { method: "POST", headers, body: JSON.stringify(body), signal: o.signal });
      for (const run of r.runs) {
        if (Date.parse(run.start_time) >= o.untilMs) continue;
        const list = byTrace.get(run.trace_id) ?? [];
        list.push(run);
        byTrace.set(run.trace_id, list);
      }
      cursor = r.cursors?.next;
    } while (cursor && byTrace.size < o.limit * 2);
    let count = 0;
    for (const [traceId, runs] of byTrace) {
      if (count++ >= o.limit) return;
      yield { sourceId: traceId, batches: toBatches(langsmithNodes(runs), { project: o.project || session.name, source: "langsmith" }) };
    }
  },
};

const lsTime = (t: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(t) ? t : `${t}Z`);

export function langsmithNodes(runs: LsRun[]): SpanNode[] {
  const ids = new Set(runs.map((r) => r.id));
  return runs.map((r) => {
    const params = r.extra?.invocation_params ?? {};
    const meta = r.extra?.metadata ?? {};
    return {
      traceId: r.trace_id,
      spanId: r.id,
      parentSpanId: r.parent_run_id && ids.has(r.parent_run_id) ? r.parent_run_id : null,
      name: r.name,
      kind: r.run_type,
      start: lsTime(r.start_time),
      end: r.end_time ? lsTime(r.end_time) : null,
      error: r.error ?? null,
      input: r.inputs,
      output: r.outputs,
      model: (params.model as string) ?? (params.model_name as string) ?? (meta.ls_model_name as string) ?? null,
      provider: (meta.ls_provider as string) ?? null,
      promptTokens: r.prompt_tokens ?? null,
      completionTokens: r.completion_tokens ?? null,
      totalTokens: r.total_tokens ?? null,
      toolName: r.run_type === "tool" ? r.name : null,
      sessionId: (meta.thread_id as string) ?? (meta.session_id as string) ?? (meta.conversation_id as string) ?? null,
      attributes: r.tags?.length ? { "neatlogs.tags": r.tags.join(",") } : undefined,
    };
  });
}
