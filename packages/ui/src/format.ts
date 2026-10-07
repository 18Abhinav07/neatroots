export function ago(ms: number | null | undefined): string {
  if (!ms) return "—";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  const m = Math.floor(ms / 60_000);
  return `${m}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${Math.round(p * 100)}%`;
}

export function shortId(id: string, n = 8): string {
  return id.slice(0, n);
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const KIND_COLOR: Record<string, string> = {
  LLM: "var(--k-llm)",
  TOOL: "var(--k-tool)",
  MCP_TOOL: "var(--k-tool)",
  WORKFLOW: "var(--k-flow)",
  AGENT: "var(--k-flow)",
  CHAIN: "var(--k-flow)",
  TASK: "var(--k-flow)",
  RETRIEVER: "var(--k-retr)",
  RERANKER: "var(--k-retr)",
  EMBEDDING: "var(--k-retr)",
  VECTOR_STORE: "var(--k-retr)",
  GUARDRAIL: "var(--k-guard)",
};

export function kindColor(kind: string): string {
  return KIND_COLOR[kind] ?? "var(--k-other)";
}

export function pretty(v: unknown): string {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}
