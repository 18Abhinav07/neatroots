import type { SpanInfo, TraceSnapshot } from "../engine/trace.js";
import type { Plain } from "../otlp/types.js";
import { preview } from "./view.js";

// A run read as a conversation: what the user asked, what the model said and which tools it
// called, in order. Built from LLM spans (their messages), tool spans, and agent spans, which
// become cards you can open as their own conversation (sub-agents).

export type ChatItem =
  | { type: "system"; text: string; span_id: string }
  | { type: "user"; text: string; span_id: string }
  | { type: "assistant"; text: string; span_id: string; model?: string; tokens?: number; tool_calls: { name: string; arguments: Plain }[]; error?: string }
  | { type: "tool"; name: string; span_id: string; input: Plain | undefined; output: Plain | undefined; status: SpanInfo["status"]; error?: string; duration_ms: number }
  | { type: "agent"; name: string; span_id: string; status: SpanInfo["status"]; duration_ms: number; llm_calls: number; tool_calls: number; input?: string; output?: string; error?: string };

function text(v: Plain | undefined): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v === "null" ? "" : v;
  if (Array.isArray(v)) return v.map((p) => (p && typeof p === "object" && !Array.isArray(p) ? text((p as Record<string, Plain>).text ?? (p as Record<string, Plain>).content) : text(p))).join("\n");
  if (typeof v === "object") {
    const o = v as Record<string, Plain>;
    if (typeof o.content === "string") return o.content;
    if (typeof o.text === "string") return o.text;
  }
  return JSON.stringify(v);
}

function messages(v: Plain | undefined): Record<string, Plain>[] {
  if (Array.isArray(v)) return v.filter((m): m is Record<string, Plain> => !!m && typeof m === "object" && !Array.isArray(m) && "role" in m);
  return [];
}

/**
 * The conversation under one span (the root, or a sub-agent). Spans inside a nested agent are
 * folded into that agent's card.
 */
export function buildChat(t: TraceSnapshot, rootSpanId?: string): { root: string | null; items: ChatItem[] } {
  const spans = [...t.spans].sort((a, b) => a.startMs - b.startMs || a.seq - b.seq);
  const byId = new Map(spans.map((s) => [s.id, s]));
  const children = new Map<string, SpanInfo[]>();
  for (const s of spans) if (s.parentId) children.set(s.parentId, [...(children.get(s.parentId) ?? []), s]);
  const root = rootSpanId ? byId.get(rootSpanId) : (spans.find((s) => !s.parentId || !byId.has(s.parentId)) ?? spans[0]);
  if (!root) return { root: null, items: [] };

  // Walk the subtree in time order, stopping at nested agents.
  const inScope: SpanInfo[] = [];
  const walk = (s: SpanInfo) => {
    for (const c of children.get(s.id) ?? []) {
      if (c.kind === "AGENT" && c.id !== root.id) {
        inScope.push(c);
        continue;
      }
      inScope.push(c);
      walk(c);
    }
  };
  walk(root);
  inScope.sort((a, b) => a.startMs - b.startMs || a.seq - b.seq);
  const hasTools = inScope.some((s) => s.kind === "TOOL" || s.kind === "MCP_TOOL");
  const count = (s: SpanInfo, kind: string): number => (children.get(s.id) ?? []).reduce((n, c) => n + (c.kind === kind ? 1 : 0) + count(c, kind), 0);

  const items: ChatItem[] = [];
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));
  let llmCalls = 0;
  for (const s of inScope) {
    if (s.kind === "LLM") {
      llmCalls++;
      for (const m of messages(s.input)) {
        const role = String(m.role);
        const body = text(m.content);
        if (role === "system" && body && once(`system:${body}`)) items.push({ type: "system", text: body, span_id: s.id });
        else if (role === "user" && body && once(`user:${body}`)) items.push({ type: "user", text: body, span_id: s.id });
        else if ((role === "tool" || role === "function") && !hasTools && body && once(`tool:${body}`))
          items.push({ type: "tool", name: String(m.name ?? "tool"), span_id: s.id, input: undefined, output: body, status: "ok", duration_ms: 0 });
      }
      if (typeof s.input === "string" && s.input && once(`user:${s.input}`)) items.push({ type: "user", text: s.input, span_id: s.id });
      const out = messages(s.output);
      const reply = out.length ? out.map((m) => text(m.content)).filter(Boolean).join("\n") : text(s.output);
      const calls = s.toolCalls?.map((c) => ({ name: c.name, arguments: c.arguments })) ?? out.flatMap((m) => (Array.isArray(m.tool_calls) ? (m.tool_calls as Record<string, Plain>[]).map((c) => ({ name: String(c.name ?? "tool"), arguments: c.arguments ?? null })) : []));
      items.push({ type: "assistant", text: reply, span_id: s.id, model: s.model, tokens: s.tokens, tool_calls: calls, error: s.error });
      // Later calls repeat earlier assistant turns in their input; don't show them twice.
      if (reply) seen.add(`assistant:${reply}`);
    } else if (s.kind === "TOOL" || s.kind === "MCP_TOOL") {
      items.push({ type: "tool", name: s.toolName ?? s.name, span_id: s.id, input: s.input, output: s.output, status: s.status, error: s.error, duration_ms: Math.round(s.durationMs) });
    } else if (s.kind === "AGENT" && s.id !== root.id) {
      items.push({
        type: "agent",
        name: s.name.replace(/^openai_agents\.agent\./, ""),
        span_id: s.id,
        status: s.status,
        duration_ms: Math.round(s.durationMs),
        llm_calls: count(s, "LLM"),
        tool_calls: count(s, "TOOL") + count(s, "MCP_TOOL"),
        input: preview(s.input, 300) || undefined,
        output: preview(s.output, 300) || undefined,
        error: s.error,
      });
    }
  }
  if (!llmCalls) {
    // No LLM spans in scope: the root's own input and output still make a turn.
    const input = text(root.input);
    const output = text(root.output);
    if (input) items.unshift({ type: "user", text: input, span_id: root.id });
    if (output) items.push({ type: "assistant", text: output, span_id: root.id, tool_calls: [], error: root.error });
  }
  return { root: root.id, items };
}
