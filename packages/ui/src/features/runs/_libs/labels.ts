import type { BadgeVariant } from "../../../components/ui/neat-badge";
import type { Tone } from "../../../components/ui/status-pill";
import type { FindingStatus, NoteStatus, RunStatus } from "../../../lib/api";

/** STATE mappers: outcomes that change over time. */
export const RUN_STATE: Record<RunStatus, { tone: Tone; label: string }> = {
  running: { tone: "info", label: "Running" },
  ok: { tone: "success", label: "Succeeded" },
  error: { tone: "danger", label: "Failed" },
  interrupted: { tone: "warning", label: "Interrupted" },
};

export const FINDING_STATE: Record<FindingStatus, { tone: Tone; label: string }> = {
  raised: { tone: "warning", label: "Open" },
  active: { tone: "warning", label: "Sent to agent" },
  resolved: { tone: "success", label: "Resolved" },
  dismissed: { tone: "neutral", label: "Dismissed" },
  failed: { tone: "neutral", label: "Not checked" },
};

export const NOTE_STATE: Record<NoteStatus, { tone: Tone; label: string }> = {
  pending: { tone: "info", label: "Queued" },
  delivered: { tone: "success", label: "Delivered" },
  superseded: { tone: "neutral", label: "Replaced" },
  expired: { tone: "neutral", label: "Not sent" },
  blocked: { tone: "danger", label: "Blocked" },
};

/** CATEGORY mappers: fixed taxonomies, never verdicts. */
const KIND: Record<string, { variant: BadgeVariant; label: string }> = {
  LLM: { variant: "blue", label: "LLM" },
  TOOL: { variant: "amber", label: "Tool" },
  MCP_TOOL: { variant: "amber", label: "MCP" },
  AGENT: { variant: "purple", label: "Agent" },
  WORKFLOW: { variant: "tag", label: "Workflow" },
  CHAIN: { variant: "tag", label: "Chain" },
  TASK: { variant: "tag", label: "Task" },
  RETRIEVER: { variant: "green", label: "Retriever" },
  RERANKER: { variant: "green", label: "Reranker" },
  EMBEDDING: { variant: "green", label: "Embedding" },
  VECTOR_STORE: { variant: "green", label: "Vector" },
  GUARDRAIL: { variant: "outline", label: "Guardrail" },
};

export function spanKindBadge(kind: string): { variant: BadgeVariant; label: string } {
  return KIND[kind] ?? { variant: "outline", label: kind.charAt(0) + kind.slice(1).toLowerCase() };
}

export const CHECK_SOURCE: Record<string, { variant: BadgeVariant; label: string }> = {
  library: { variant: "tag", label: "Library" },
  user: { variant: "blue", label: "Yours" },
  project: { variant: "green", label: "Project" },
  planner: { variant: "purple", label: "Planner" },
  mcp: { variant: "amber", label: "Coding agent" },
};
