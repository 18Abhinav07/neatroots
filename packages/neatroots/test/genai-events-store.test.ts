import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OtlpLogRecord } from "../src/otlp/codec.js";
import type { OtlpSpan } from "../src/otlp/types.js";
import { batch, closeTrackedStores, hex, llmSpan, s, span, tmpHome, trackedStore } from "./helpers.js";

const homes: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  closeTrackedStores();
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});
const dir = () => {
  const h = tmpHome();
  homes.push(h);
  return path.join(h, "data");
};

const resource = { attributes: [{ key: "service.name", value: { stringValue: "app" } }] };
const userLog = (traceId: string, spanId: string, content: string): OtlpLogRecord => ({
  timeUnixNano: "1",
  eventName: "gen_ai.user.message",
  body: { kvlistValue: { values: [{ key: "content", value: { stringValue: content } }] } },
  attributes: [],
  traceId,
  spanId,
  resource,
  scope: { name: "app" },
});
const bare = (t: string) => span({ traceId: t, name: "chat gpt-4o", kind: "llm", attrs: [s("gen_ai.request.model", "gpt-4o")] });
const lookups = (st: Store) => vi.spyOn(st as unknown as { genAiLogEvents: (t: string, sp: string) => unknown }, "genAiLogEvents");

describe("GenAI log events in the store", () => {
  it("only looks up log events for a span that is missing content or a finish reason", () => {
    const st = trackedStore(dir());
    const spy = lookups(st);
    const full: OtlpSpan = llmSpan(hex(16), "", { system: "sys", user: "q", out: "a" });
    full.attributes.push(s("gen_ai.response.finish_reasons.0", "stop"));
    st.viewOf({ span: full, resource });
    expect(spy).not.toHaveBeenCalled();

    st.viewOf({ span: bare(hex(16)), resource });
    expect(spy).toHaveBeenCalledTimes(1);

    const noFinish = llmSpan(hex(16), "", { user: "q", out: "a" });
    st.viewOf({ span: noFinish, resource });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("adds the logs_span index and event_name column to a database created before them", () => {
    const d = dir();
    trackedStore(d).close();
    const raw = new Database(path.join(d, "neatroots.db"));
    raw.exec("DROP INDEX logs_span; ALTER TABLE logs DROP COLUMN event_name;");
    raw.close();
    const st = trackedStore(d);
    const idx = st.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='logs_span'").all();
    const cols = (st.db.prepare("PRAGMA table_info(logs)").all() as { name: string }[]).map((c) => c.name);
    expect(idx).toHaveLength(1);
    expect(cols).toContain("event_name");
    const plan = st.db.prepare("EXPLAIN QUERY PLAN SELECT body FROM logs WHERE trace_id = ? AND span_id = ?").all("a", "b") as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toContain("logs_span");
  });

  it("drops view revisions of deleted runs and keeps the others", () => {
    const st = trackedStore(dir());
    const [a, b] = [hex(16), hex(16)];
    const sa = bare(a);
    const sb = bare(b);
    st.ingest([batch([sa, sb])]);
    st.ingestLogs([userLog(a, sa.spanId, "one"), userLog(b, sb.spanId, "two")]);
    expect(st.viewRevision(a, sa.spanId)).toBe(1);
    expect(st.viewRevision(b, sb.spanId)).toBe(1);
    st.deleteRuns([a]);
    expect(st.viewRevision(a, sa.spanId)).toBe(0);
    expect(st.viewRevision(b, sb.spanId)).toBe(1);
    expect((st as unknown as { viewRevs: Map<string, number> }).viewRevs.size).toBe(1);
  });
});

