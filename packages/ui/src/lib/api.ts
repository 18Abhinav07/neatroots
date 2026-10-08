/** Typed client for the Bolts app API. */

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
  input_preview: string | null;
  output_preview: string | null;
  finding_count: number;
  open_finding_count: number;
  pinned: number;
  summary: string | null;
  /** Title of the most important open finding. */
  top_finding: string | null;
  steering: string;
  termination_reason: string | null;
  plan_id: string | null;
}

export interface Span {
  span_id: string;
  parent_span_id: string | null;
  name: string;
  span_kind: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  status_code: number;
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

export type FindingStatus = "raised" | "active" | "resolved" | "dismissed" | "failed";

export interface Finding {
  id: string;
  trace_id: string;
  check_id: string;
  check_kind: "rule" | "question";
  title: string;
  probability: number | null;
  status: FindingStatus;
  evidence_span_ids: string[];
  detail: Record<string, unknown>;
  model: string | null;
  triage_score: number | null;
  explanation: Explanation | null;
  precision: { hits: number; dismissed: number; precision: number | null; noisy: boolean };
  created_ms: number;
}

export type NoteStatus = "pending" | "delivered" | "superseded" | "blocked" | "expired";

export interface Note {
  id: string;
  finding_id: string | null;
  kind: "template" | "llm" | "halt";
  text: string;
  status: NoteStatus;
  created_ms: number;
  delivered_ms: number | null;
  checks: { unsupported?: number; copied?: number; model?: string } | null;
}

export interface Plan {
  id: string;
  created_by: string;
  model: string | null;
  rationale: string | null;
  check_ids: string[];
}

export interface Annotation {
  id: string;
  span_id: string | null;
  label: "issue" | "good" | "note";
  text: string | null;
  author: string;
  created_ms: number;
}

export interface RunDetail {
  run: Run;
  spans: Span[];
  findings: Finding[];
  notes: Note[];
  explanation: Explanation | null;
  summary: { text: string; model: string | null } | null;
  annotations: Annotation[];
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
  home: string;
  stats: { runs: number; spans: number; findings: number; bytes: number };
  engine: {
    llm: { ok: boolean; where?: string; model?: string; error?: string; busy: number };
    decision: { backend: string | null; model: string | null };
    liveRuns: number;
    pendingJobs: number;
  } | null;
  tier: { tier: string; memoryGb: number; description: string; platform: string };
  steering: { enabled: boolean; hooks_connected: number };
  mcp?: { last_seen_ms: number | null };
  cloud: { endpoint: string; has_key: boolean };
  classifier?: {
    laya: { state: string; message: string | null; progress: number | null; url: string | null };
    trust: { question: string; n: number; agreement: number | null; trusted: boolean }[];
    jev_cloud: { enabled: boolean; has_key: boolean };
  };
  check_errors: { path: string; id?: string; message: string }[];
  config: {
    llm: { baseUrl: string; model: string; enabled: boolean; external: ExternalLlmConfig };
    classifier: { backend: string; baseUrl: string; model: string };
    budgets: Record<string, number>;
    retention: { days: number; maxGb: number };
  };
}

export interface ExternalLlmConfig {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  redact: "secrets" | "all" | "off";
  fallbackToLocal: boolean;
  timeoutSec: number;
}

export interface LlmProbe {
  ok: boolean;
  model?: string;
  models?: string[];
  error?: string;
}

export interface LlmInfo {
  active: string | null;
  local: LlmProbe & { baseUrl: string };
  external: (LlmProbe & { enabled: boolean; provider: string; label: string; hasKey: boolean }) | null;
  config: ExternalLlmConfig;
  providers: { id: string; label: string; api: string; base_url: string; default_model: string; suggested: string[]; key_url: string; key: string | null }[];
}

export type InsightWindow = "24h" | "7d" | "30d";

export interface InsightTotals {
  runs: number;
  failed: number;
  with_problems: number;
  tokens: number;
  llm_calls: number;
  tool_calls: number;
  p50_ms: number | null;
  p95_ms: number | null;
}

export interface Digest {
  window: InsightWindow;
  insights: { tone: "good" | "bad" | "neutral"; text: string }[];
  model: string | null;
  where: string | null;
  created_ms: number;
  runs: number;
}

export interface Insights {
  window: { key: InsightWindow; from_ms: number; to_ms: number; bucket_ms: number };
  totals: InsightTotals;
  previous: InsightTotals;
  buckets: { start_ms: number; runs: number; failed: number; with_problems: number }[];
  problems: { check_id: string; title: string; kind: string; runs: number; prev_runs: number; dismissed: number; last_ms: number; example_trace_id: string; projects: string[] }[];
  tools: { name: string; calls: number; failures: number; empty: number; runs: number; prev_calls: number; prev_failures: number; p50_ms: number | null }[];
  models: { name: string; calls: number; errors: number; tokens: number; p50_ms: number | null }[];
  projects: { name: string; runs: number; failed: number; with_problems: number; prev_runs: number; prev_with_problems: number; last_ms: number; top_problem: string | null }[];
  passing: { check_id: string; title: string; kind: string; runs: number }[];
  gone: { check_id: string; title: string; prev_runs: number }[];
  digest: Digest | null;
  digest_pending: boolean;
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

export interface ForwardPreview {
  span_count: number;
  redactions: { kind: string; count: number; samples: { where: string; sample: string }[] }[];
  has_key: boolean;
  endpoint: string;
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
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError((data as { error?: string })?.error ?? `Bolts returned HTTP ${res.status}`, res.status);
  return data as T;
}

export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: "POST", json: json ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
