import { afterEach, describe, expect, it } from "vitest";
import { loadTrace } from "../src/engine/trace.js";
import { EXPLORE_TOOLS } from "../src/mcp/explore-tools.js";
import { toChat } from "../src/replay/replay.js";
import { buildChat } from "../src/semantics/chat-view.js";
import { parseSearch } from "../src/server/api-explore.js";
import { batch, hex, llmSpan, makeRoots, mockLlm, span, toolSpan, until, type TestRoots } from "./helpers.js";

let t: TestRoots | undefined;
let llm: Awaited<ReturnType<typeof mockLlm>> | undefined;
afterEach(async () => {
  await t?.close();
  await llm?.close();
  t = undefined;
  llm = undefined;
});

const tool = (name: string) => EXPLORE_TOOLS.find((x) => x.name === name)!;

/** root agent → LLM (asks for lookup) → tool → LLM (answers); plus a sub-agent with its own LLM call. */
function seed(tr: TestRoots, session = "conv-1") {
  const traceId = hex(16);
  const root = span({ traceId, name: "support", kind: "workflow", attrs: [{ key: "neatlogs.session.id", value: { stringValue: session } }] });
  const l1 = llmSpan(traceId, root.spanId, { system: "Be careful.", user: "Is order 1001 ok?", toolCalls: [{ name: "lookup_order", args: '{"id":1001}' }] });
  const t1 = toolSpan(traceId, root.spanId, "lookup_order", '{"id":1001}', '{"status":"delivered"}');
  const l2 = llmSpan(traceId, root.spanId, { system: "Be careful.", user: "Is order 1001 ok?", out: "Order 1001 was delivered." });
  const sub = span({ traceId, parent: root.spanId, name: "billing-agent", kind: "agent" });
  const l3 = llmSpan(traceId, sub.spanId, { user: "Check the refund", out: "No refund due." });
  tr.roots.ingest([batch([root, l1, t1, l2, sub, l3], "support-agent")]);
  return { traceId, root, l1, t1, l2, sub, l3 };
}

describe("run as a chat", () => {
  it("reads user, assistant, tool calls and a sub-agent card in order", async () => {
    t = await makeRoots({ noEngine: true });
    const x = seed(t);
    const chat = buildChat(loadTrace(t.roots.store, x.traceId));
    expect(chat.items.map((i) => i.type)).toEqual(["system", "user", "assistant", "tool", "assistant", "agent"]);
    expect(chat.items[2]).toMatchObject({ type: "assistant", tool_calls: [{ name: "lookup_order" }] });
    expect(chat.items[5]).toMatchObject({ type: "agent", name: "billing-agent", llm_calls: 1 });
    const sub = buildChat(loadTrace(t.roots.store, x.traceId), x.sub.spanId);
    expect(sub.items.map((i) => i.type)).toEqual(["user", "assistant"]);
  });
});

describe("replay", () => {
  it("turns recorded messages into chat turns", () => {
    expect(toChat([{ role: "system", content: "s" }, { role: "assistant", content: "", tool_calls: [{ name: "f", arguments: { a: 1 } }] }, { role: "tool", name: "f", content: "ok" }])).toEqual([
      { role: "system", content: "s" },
      { role: "assistant", content: '[called f({"a":1})]' },
      { role: "user", content: "[tool result from f]\nok" },
    ]);
  });

  it("forks one LLM call with an edited message and links the new run", async () => {
    llm = await mockLlm();
    t = await makeRoots({ llmUrl: llm.url, noEngine: true });
    const x = seed(t);
    const r = await t.roots.replays.replayLlm(x.traceId, x.l2.spanId, { messages: [{ role: "user", content: "Is order 2002 ok?" }] });
    expect(r).toMatchObject({ state: "succeeded", kind: "llm" });
    expect(llm.requests.at(-1).messages).toEqual([{ role: "user", content: "Is order 2002 ok?" }]);
    expect(t.roots.store.getRun(r.new_trace_id!)).toMatchObject({ project: "support-agent", llm_calls: 1 });
    expect(t.roots.replays.originOf(r.new_trace_id!)?.id).toBe(r.id);
    expect(t.roots.replays.forRun(x.traceId)).toHaveLength(1);
    await expect(t.roots.replays.replayLlm(x.traceId, x.t1.spanId)).rejects.toThrow(/only LLM spans/);
  });

  it("re-runs the agent through its registered command and links the run it sends", async () => {
    t = await makeRoots({ noEngine: true, serve: true });
    const x = seed(t);
    t.roots.config.rerun["support-agent"] = {
      // A stand-in agent: reads the replay input from the environment and sends a run.
      command: `node -e "fetch(process.env.NEATLOGS_ENDPOINT + '/v1/trace', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name:'support', project:'support-agent', input: process.env.NEATROOTS_REPLAY_INPUT, output: 'model=' + (process.env.NEATROOTS_REPLAY_MODEL||'')})}).then(r=>r.text()).then(console.log)"`,
    };
    const { replay, done } = t.roots.replays.startRun(x.traceId, { input: "Is order 3003 ok?", model: "small-model" });
    expect(replay.state).toBe("running");
    const r = await done;
    expect(r).toMatchObject({ state: "succeeded", via: "command" });
    const run = t.roots.store.getRun(r.new_trace_id!)!;
    expect(run.input_preview).toContain("3003");
    expect(run.output_preview).toContain("model=small-model");
    expect(() => t!.roots.replays.startRun(hex(16))).toThrow(/run not found/);
  }, 30_000);
});

describe("search and exploring tools", () => {
  it("parses filters and free text", () => {
    expect(parseSearch('project:support status:failed "order 1001" tool:lookup refund')).toEqual({ text: "order 1001 refund", filters: { project: "support", status: "failed", tool: "lookup" } });
  });

  it("status: takes the words people use (failed, succeeded) for what runs store", async () => {
    t = await makeRoots({ noEngine: true, serve: true });
    const ok = seed(t, "conv-ok");
    const bad = hex(16);
    t.roots.ingest([batch([span({ traceId: bad, name: "billing", kind: "workflow", status: 2, message: "gateway timeout" })], "billing-agent")]);
    await until(() => t!.roots.store.getRun(bad)?.status === "error");
    const ids = async (q: string) => ((await (await fetch(`${t!.url}/api/search/runs?q=${encodeURIComponent(q)}`)).json()) as { runs: { trace_id: string }[] }).runs.map((r) => r.trace_id);
    expect(await ids("status:failed")).toEqual([bad]);
    expect(await ids("status:error")).toEqual([bad]);
    expect(await ids("status:succeeded")).toEqual([ok.traceId]);
  });

  it("answers context, in-run search, conversation, compare and read-only SQL", async () => {
    t = await makeRoots({ noEngine: true });
    const a = seed(t, "conv-9");
    const b = seed(t, "conv-9");
    const ctx = (await tool("get_span_context").run(t.roots, { trace_id: a.traceId, span_id: a.t1.spanId.slice(0, 8) })) as { ancestors: unknown[]; position: string; previous_sibling: { kind: string } };
    expect(ctx.ancestors).toHaveLength(1);
    expect(ctx.previous_sibling.kind).toBe("LLM");
    const found = (await tool("search_in_run").run(t.roots, { trace_id: a.traceId, query: "DELIVERED" })) as { matches: number };
    expect(found.matches).toBeGreaterThan(0);
    const conv = (await tool("get_conversation").run(t.roots, { trace_id: b.traceId })) as { turns: unknown[] };
    expect(conv.turns).toHaveLength(2);
    const cmp = (await tool("compare_runs").run(t.roots, { a: a.traceId, b: b.traceId })) as { same_tool_sequence: boolean };
    expect(cmp.same_tool_sequence).toBe(true);
    const sql = (await tool("query_sql").run(t.roots, { sql: "SELECT project, COUNT(*) AS n FROM runs GROUP BY project" })) as { rows: { project: string; n: number }[] };
    expect(sql.rows).toEqual([{ project: "support-agent", n: 2 }]);
    await expect(tool("query_sql").run(t.roots, { sql: "DELETE FROM runs" })).rejects.toThrow(/only a single SELECT/);
    await expect(tool("query_sql").run(t.roots, { sql: "SELECT 1; DELETE FROM runs" })).rejects.toThrow(/only a single SELECT/);
    const nav: string[] = [];
    t.roots.bus.on("navigate", (e) => nav.push(e.path));
    await tool("show_in_ui").run(t.roots, { trace_id: a.traceId, view: "timeline" });
    await until(() => nav.length > 0);
    expect(nav[0]).toBe(`runs/${a.traceId}?view=timeline`);
  });
});
