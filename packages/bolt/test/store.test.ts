import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Store } from "../src/store/db.js";
import { traceReadback } from "../src/server/readback.js";
import { batch, hex, llmSpan, markerSpan, s, span, tmpHome, toolSpan } from "./helpers.js";

const homes: string[] = [];
function store(): Store {
  const h = tmpHome();
  homes.push(h);
  return new Store(path.join(h, "data"));
}
afterEach(() => {
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

describe("store", () => {
  it("aggregates a run from child spans, root and completion marker", () => {
    const st = store();
    const t = hex(16);
    const root = hex(8);
    const u1 = st.ingest([batch([llmSpan(t, root, { system: "sys", user: "refund 4512", toolCalls: [{ name: "lookup_order", args: '{"order_id":"4512"}' }] }), toolSpan(t, root, "lookup_order", '{"order_id":"4512"}', undefined, "404 not found")])]);
    expect(u1[0]).toMatchObject({ runCreated: true, rootEnded: false });
    let run = st.getRun(t)!;
    expect(run).toMatchObject({ status: "running", span_count: 2, llm_calls: 1, tool_calls: 1, error_count: 1, total_tokens: 15, project: "test-agent" });
    const u2 = st.ingest([batch([span({ traceId: t, spanId: root, name: "refund", kind: "workflow", attrs: [s("neatlogs.session.id", "sess-9"), s("neatlogs.workflow.input", '{"q":"refund"}'), s("neatlogs.workflow.output", '"done"')] })])]);
    expect(u2[0].rootEnded).toBe(true);
    run = st.getRun(t)!;
    expect(run).toMatchObject({ status: "ok", root_span_id: root, root_name: "refund", session_id: "sess-9", span_count: 3 });
    const u3 = st.ingest([batch([markerSpan(t, root)])]);
    expect(u3[0].completed).toBe(true);
    expect(st.getRun(t)!.complete).toBe(1);
    expect(st.getRun(t)!.span_count).toBe(3);
    // re-sent spans do not double count
    st.ingest([batch([toolSpan(t, root, "x", "{}")].map((x) => ({ ...x, spanId: st.getSpans(t)[1].span_id })))]);
    expect(st.getRun(t)!.span_count).toBe(3);
  });

  it("offloads large payloads to blobs and restores them losslessly", () => {
    const st = store();
    const t = hex(16);
    const big = "x".repeat(100_000);
    const sp = span({ traceId: t, name: "big", kind: "tool", attrs: [s("neatlogs.tool.output", big), s("n", 3)] });
    const b = batch([sp]);
    st.ingest([b]);
    const raw = st.db.prepare("SELECT attributes, blobs FROM spans").get() as { attributes: string; blobs: string };
    expect(raw.attributes.length).toBeLessThan(2000);
    expect(JSON.parse(raw.blobs)).toHaveLength(1);
    const [back] = st.batchesForTraces([t]);
    expect(back.spans[0].attributes).toEqual(sp.attributes);
    expect(back.resource).toEqual(b.resource);
    st.deleteRun(t);
    expect(st.blobs.size()).toBe(0);
  });

  it("searches span content and keeps pinned runs through retention", () => {
    const st = store();
    const a = hex(16);
    const b = hex(16);
    st.ingest([batch([toolSpan(a, "", "lookup_order", '{"order_id":"77"}', '{"owner":"zelda"}')]), batch([toolSpan(b, "", "other", "{}", "{}")])]);
    expect(st.searchSpans("zelda").map((h) => h.trace_id)).toEqual([a]);
    st.setPinned(a, true);
    st.db.prepare("UPDATE runs SET received_ms = 0, ended_ms = 0").run();
    expect(st.sweep(14, 5 * 1024 ** 3)).toBe(1);
    expect(st.getRun(a)).toBeDefined();
    expect(st.getRun(b)).toBeUndefined();
  });

  it("serves the doctor read-back shape", () => {
    const st = store();
    const t = hex(16);
    const root = hex(8);
    const agent = hex(8);
    const doctorAttrs = [s("neatlogs.doctor", true), s("neatlogs.doctor.version", "v1"), s("service.name", "neatlogs.doctor.v2"), s("telemetry.sdk.version", "1.4.24")];
    st.ingest([
      batch([
        span({ traceId: t, spanId: agent, parent: root, name: "doctor.probe.agent", kind: "agent", attrs: [...doctorAttrs, s("input.value", '{"prompt":"generated diagnostic input"}'), s("output.value", '{"text":"generated diagnostic output"}')] }),
        span({ traceId: t, parent: agent, name: "doctor.probe.llm", kind: "llm", status: 0, attrs: [...doctorAttrs, s("input.value", '{"messages":[{"role":"user","content":"generated diagnostic input"}]}'), s("output.value", '{"text":"generated diagnostic output"}'), s("neatlogs.llm.token_count.prompt", "11"), s("neatlogs.llm.token_count.completion", "7"), s("neatlogs.llm.token_count.total", "18")] }),
      ], "neatlogs.doctor.v2"),
    ]);
    expect(traceReadback(st, t).status).toBe(202);
    expect(traceReadback(st, hex(16)).status).toBe(404);
    st.ingest([batch([span({ traceId: t, spanId: root, name: "doctor.probe.root", kind: "workflow", status: 0, attrs: [...doctorAttrs, s("input.value", '{"prompt":"generated diagnostic input"}'), s("output.value", '{"result":{"value":2}}')] }), markerSpan(t, root)], "neatlogs.doctor.v2")]);
    const r = traceReadback(st, t);
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body).toMatchObject({ _id: t, status: "success", spanCount: 3, promptTokens: 11, completionTokens: 7, totalTokensUsed: 18 });
    const byName = Object.fromEntries(body.spans.map((x: any) => [x.node_name, x]));
    expect(byName["doctor.probe.agent"].node_type).toBe("agent_action");
    expect(byName["doctor.probe.llm"].data.input_value).toEqual({ messages: [{ role: "user", content: "generated diagnostic input" }] });
    expect(byName["doctor.probe.root"].data.output_value).toEqual({ result: { value: 2 } });
    expect(byName["doctor.probe.root"].span_metadata["neatlogs.doctor"]).toBe(true);
    expect(byName["doctor.probe.root"].span_metadata["telemetry.sdk.language"]).toBe("python");
    expect(body.spans.some((x: any) => x.node_name === "neatlogs.trace.complete")).toBe(false);
  });
});
