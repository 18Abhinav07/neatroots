import type Database from "better-sqlite3";
import { isGenAiEvent, type GenAiEvent } from "../semantics/genai-events.js";
import { kvToPlain, type KeyValue } from "../otlp/types.js";

function attributes(raw: string | null): KeyValue[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as KeyValue[];
  } catch {
    return [];
  }
}

/** Most events read per span, so a chatty sender cannot make every late-log refresh unbounded work on the event loop. */
export const MAX_LOG_EVENTS = 500;

/** GenAI message events logged against a span (the newest MAX_LOG_EVENTS), oldest first. */
export function genAiLogEvents(db: Database.Database, traceId: string, spanId: string): GenAiEvent[] {
  const rows = db
    .prepare("SELECT event_name, time_ns, body, attributes FROM logs WHERE trace_id = ? AND span_id = ? AND event_name LIKE 'gen_ai.%' ORDER BY id DESC LIMIT ?")
    .all(traceId, spanId, MAX_LOG_EVENTS) as { event_name: string; time_ns: string | null; body: string | null; attributes: string | null }[];
  return rows
    .reverse()
    .filter((r) => isGenAiEvent(r.event_name))
    .map((r) => ({ name: r.event_name, timeNs: r.time_ns ?? undefined, attributes: kvToPlain(attributes(r.attributes)), body: r.body ?? undefined }));
}
