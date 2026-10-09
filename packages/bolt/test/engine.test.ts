import { afterEach, describe, expect, it } from "vitest";
import { batch, hex, llmSpan, makeBolts, markerSpan, mockLlm, span, toolSpan, until, type TestBolts } from "./helpers.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanup.splice(0)) await c();
});

async function setup(yesWhen: string[] = []) {
  const llm = await mockLlm({ yesWhen });
  const tb = await makeBolts({ llmUrl: llm.url });
  cleanup.push(async () => {
    await tb.close();
    await llm.close();
  });
  return { llm, tb };
}

function startRun(tb: TestBolts) {
  const t = hex(16);
  const root = hex(8);
  tb.bolts.ingest([batch([llmSpan(t, root, { system: "You are a refund agent.", user: "Refund order 4512", toolCalls: [{ name: "lookup_order", args: '{"order_id":"4512"}' }], tools: ["lookup_order"] })])]);
  return { t, root };
}

describe("engine", () => {
  it("raises a rule finding mid-run and queues a template note when steering is on", async () => {
    const { tb } = await setup();
    tb.bolts.steering.setMode("test-agent", "advisory");
    const { t, root } = startRun(tb);
    for (let i = 0; i < 3; i++) tb.bolts.ingest([batch([toolSpan(t, root, "lookup_order", '{"order_id":"4512"}', undefined, "404: not found")])]);
    const f = await until(() => tb.bolts.store.findingsForTrace(t).find((x) => x.check_id === "repeated-tool-call"));
    expect(f.status).toBe("raised");
    const note = await until(() => tb.bolts.store.notesForTrace(t).find((n) => n.kind === "template" && n.finding_id === f.id));
    expect(note.text).toContain("lookup_order 3 times");
    // the hook claims it once; the finding becomes active
    const claimed = tb.bolts.steering.claim(t, null)!;
    expect(claimed.status).toBe("delivered");
    expect(tb.bolts.steering.claim(t, null)?.id ?? null).not.toBe(claimed.id);
    expect(tb.bolts.store.getFinding(f.id)!.status).toBe("active");
  });

  it("does not steer when steering is off, but still records findings", async () => {
    const { tb } = await setup();
    const { t, root } = startRun(tb);
    for (let i = 0; i < 3; i++) tb.bolts.ingest([batch([toolSpan(t, root, "lookup_order", '{"order_id":"4512"}', undefined, "404")])]);
    await until(() => tb.bolts.store.findingsForTrace(t).length > 0);
    await tb.bolts.engine!.waitIdle(t, 5000);
    expect(tb.bolts.store.notesForTrace(t)).toEqual([]);
  });

  it("plans, asks questions, triages and summarizes at run end", async () => {
    const { tb, llm } = await setup(["carry on as if a tool call had succeeded"]);
    const { t, root } = startRun(tb);
    tb.bolts.ingest([batch([toolSpan(t, root, "lookup_order", '{"order_id":"4512"}', undefined, "404")])]);
    tb.bolts.ingest([batch([llmSpan(t, root, { user: "continue", out: "Refunded order 4512." })])]);
    tb.bolts.ingest([batch([span({ traceId: t, spanId: root, name: "refund", kind: "workflow" }), markerSpan(t, root)])]);
    const summary = await until(() => tb.bolts.store.getSummary(t), 15000);
    expect(summary.text.split("\n")).toHaveLength(3);
    const plan = tb.bolts.store.getPlan(tb.bolts.store.getRun(t)!.plan_id!)!;
    expect(plan.created_by).toBe("planner");
    expect(plan.check_ids).toContain("ignored-tool-error");
    const f = tb.bolts.store.findingsForTrace(t).find((x) => x.check_id === "ignored-tool-error");
    expect(f?.probability).toBeGreaterThan(0.9);
    expect(f?.triage_score).not.toBeNull();
    const decisions = tb.bolts.store.decisionsForTrace(t);
    expect(decisions.some((d) => d.check_id === "unfinished-task" && d.probability < 0.5)).toBe(true);
    expect(llm.requests.some((r) => r.response_format?.json_schema?.name === "plan")).toBe(true);
  });

  it("gate mode waits for checks before the hook's claim", async () => {
    const { tb } = await setup();
    tb.bolts.steering.setMode("test-agent", "gate");
    const { t, root } = startRun(tb);
    tb.bolts.ingest([batch([toolSpan(t, root, "lookup_order", '{"order_id":"4512"}', undefined, "404")])]);
    tb.bolts.ingest([batch([toolSpan(t, root, "lookup_order", '{"order_id":"4512"}', undefined, "404")])]);
    tb.bolts.ingest([batch([toolSpan(t, root, "lookup_order", '{"order_id":"4512"}', undefined, "404")])]);
    const note = await tb.bolts.steering.gate(t, 300, null);
    expect(note?.text).toContain("lookup_order");
  });

  it("previews a question over finished runs and explains a run", async () => {
    const { tb } = await setup(["refund without"]);
    const { t, root } = startRun(tb);
    tb.bolts.ingest([batch([span({ traceId: t, spanId: root, name: "refund", kind: "workflow" })])]);
    await until(() => tb.bolts.store.getSummary(t), 15000);
    const preview = await tb.bolts.engine!.previewCheck({ id: "p", kind: "yes_no", scope: "trace", ask: "Did the agent refund without confirming ownership?", flag_at: 0.8 } as never);
    expect(preview.checked).toBe(1);
    expect(preview.hits).toHaveLength(1);
    const exp = await tb.bolts.engine!.explainRun(t, { force: true });
    expect(exp?.cause).toContain("order id");
    expect(exp?.grounding).not.toBeNull();
  });
});

describe("planning", () => {
  it("makes one plan per workflow when runs start together, and always includes baseline questions", async () => {
    const llm = await mockLlm({ delayMs: 150 });
    const tb = await makeBolts({ llmUrl: llm.url });
    cleanup.push(async () => {
      await tb.close();
      await llm.close();
    });
    const runs = [startRun(tb), startRun(tb), startRun(tb)];
    await until(() => runs.every((r) => tb.bolts.store.getRun(r.t)?.plan_id), 15000);
    const plans = tb.bolts.store.listPlans();
    expect(plans.filter((p) => p.workflow === "test-agent")).toHaveLength(1);
    expect(new Set(runs.map((r) => tb.bolts.store.getRun(r.t)!.plan_id)).size).toBe(1);
    const asked = tb.bolts.engine!.questionsFor({ project: "test-agent", workflow: "test-agent", plan: plans[0] }).map((q) => q.check.id);
    expect(asked).toContain("ignored-tool-error");
    expect(asked).toContain("followed-injected-instructions");
  });
});
