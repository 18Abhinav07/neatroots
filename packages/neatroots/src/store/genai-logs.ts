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

/** GenAI message events logged against a span, oldest first. */
export function genAiLogEvents(db: Database.Database, traceId: string, spanId: string): GenAiEvent[] {
  const rows = db
    .prepare("SELECT event_name, time_ns, body, attributes FROM logs WHERE trace_id = ? AND span_id = ? AND event_name LIKE 'gen_ai.%' ORDER BY id")
    .all(traceId, spanId) as { event_name: string; time_ns: string | null; body: string | null; attributes: string | null }[];
  return rows
    .filter((r) => isGenAiEvent(r.event_name))
    .map((r) => ({ name: r.event_name, timeNs: r.time_ns ?? undefined, attributes: kvToPlain(attributes(r.attributes)), body: r.body ?? undefined }));
}
