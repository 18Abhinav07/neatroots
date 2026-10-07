import { useEffect, useRef, useState } from "react";

export type RunStatus = "running" | "ok" | "error" | "interrupted";

export interface Run {
  trace_id: string;
  session_id: string | null;
  project: string | null;
  workflow: string | null;
  root_name: string | null;
  status: RunStatus;
  started_ms: number | null;
  ended_ms: number | null;
  duration_ms: number | null;
  span_count: number;
  llm_calls: number;
  tool_calls: number;
  error_count: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  input_preview: string | null;
  output_preview: string | null;
  finding_count: number;
  open_finding_count: number;
  pinned: number;
  summary: string | null;
  steering: string;
  termination_reason: string | null;
  plan_id: string | null;
}

export interface Span {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  span_kind: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  status_code: number;
  status_message: string | null;
  model: string | null;
  tool_name: string | null;
  total_tokens: number | null;
  input_preview: string | null;
  output_preview: string | null;
  error: string | null;
  tool_result: string | null;
}

export interface Explanation {
  id: string;
  cause: string;
  fix: string | null;
  evidence_span_ids: string[];
  grounding: number | null;
  model: string | null;
  created_ms: number;
}

export interface Finding {
  id: string;
  trace_id: string;
  check_id: string;
  check_kind: "rule" | "question";
  title: string;
  probability: number | null;
  status: "raised" | "active" | "resolved" | "dismissed" | "failed";
  evidence_span_ids: string[];
  detail: Record<string, unknown>;
  model: string | null;
  triage_score: number | null;
  explanation: Explanation | null;
  precision: { hits: number; dismissed: number; precision: number | null; noisy: boolean };
  created_ms: number;
}

export interface Note {
  id: string;
  finding_id: string | null;
  kind: "template" | "llm" | "halt";
  text: string;
  status: "pending" | "delivered" | "superseded" | "blocked" | "expired";
  created_ms: number;
  delivered_ms: number | null;
  checks: { unsupported?: number; copied?: number; model?: string } | null;
}

export interface Plan {
  id: string;
  workflow: string;
  created_by: string;
  model: string | null;
  rationale: string | null;
  check_ids: string[];
  created_ms: number;
}

export interface RunDetail {
  run: Run;
  spans: Span[];
  findings: Finding[];
  notes: Note[];
  explanation: Explanation | null;
  summary: { text: string; model: string | null } | null;
  annotations: { id: string; span_id: string | null; label: string; text: string | null; author: string; created_ms: number }[];
  plan: Plan | null;
  forwarded: boolean;
}

export interface SpanDetail {
  span_id: string;
  start_ns: string;
  end_ns: string;
  name: string;
  kind: string;
  status: { code: number; message?: string };
  view: {
    kind: string;
    model?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    error?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    tools?: string[];
  };
  attributes: Record<string, unknown>;
  events: { name: string; time_ns: string; attributes: Record<string, unknown> }[];
  resource: Record<string, unknown>;
  scope: { name: string; version: string | null };
}

export interface Status {
  version: string;
  port: number;
  stats: { runs: number; spans: number; findings: number; bytes: number };
  engine: {
    llm: { ok: boolean; model?: string; error?: string; busy: number };
    decision: { backend: string | null; model: string | null };
    liveRuns: number;
    pendingJobs: number;
  } | null;
  tier: { tier: string; memoryGb: number; description: string; platform: string };
  steering: { enabled: boolean; hooks_connected: number };
  cloud: { endpoint: string; has_key: boolean };
  check_errors: { path: string; id?: string; message: string }[];
  config: {
    llm: { baseUrl: string; model: string; enabled: boolean };
    classifier: { backend: string; baseUrl: string; model: string };
    budgets: Record<string, number>;
    retention: { days: number; maxGb: number };
  };
  home: string;
}

export interface CheckRow {
  id: string;
  kind: string;
  title: string;
  source: string;
  path: string | null;
  enabled: boolean;
  precision: { hits: number; dismissed: number; precision: number | null; noisy: boolean };
  yaml: string;
  check: Record<string, unknown>;
}

export interface ProjectRow {
  project: string;
  runs: number;
  last_ms: number | null;
  with_findings: number;
  settings: { steering: string; forward: boolean };
}

export interface Push {
  id: string;
  trace_ids: string[];
  requested_by: string;
  created_ms: number;
  status: "pending" | "sent" | "failed" | "declined";
  error?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body });
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError((data as { error?: string })?.error ?? `HTTP ${res.status}`, res.status);
  return data as T;
}

export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: "POST", json: json ?? {} });

/** Subscribes to Bolts' live event stream; reconnects on its own. */
export function useEvents(onEvent: (event: string, data: Record<string, unknown>) => void): boolean {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let es: EventSource | undefined;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      es = new EventSource("/api/events");
      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (!closed) retry = setTimeout(open, 2000);
      };
      for (const name of ["trace", "finding", "note", "explanation", "summary", "plan", "settings", "activity"]) {
        es.addEventListener(name, (e) => {
          try {
            handler.current(name, JSON.parse((e as MessageEvent).data));
          } catch {
            /* ignore malformed */
          }
        });
      }
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      es?.close();
    };
  }, []);
  return connected;
}

/** Fetches on mount and whenever `deps` change; `reload` refetches. */
export function useFetch<T>(path: string | null, deps: unknown[] = []): { data: T | undefined; error: string | undefined; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(undefined);
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, n, ...deps]);
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}
