import fs from "node:fs";
import path from "node:path";
import { Store } from "../src/store/db.js";
import { loadTrace } from "../src/engine/trace.js";
import { batch, hex, tmpHome, toolSpan } from "./helpers.js";
import { describe, expect, it } from "vitest";
import { AnyCheck, type RuleCheck } from "../src/checks/types.js";
import { evaluateRule } from "../src/checks/rules.js";
import type { SpanInfo, TraceSnapshot } from "../src/engine/trace.js";

const check = (equals: string | number | boolean | null = false, path: (string | number)[] = ["allowed"]): RuleCheck => AnyCheck.parse({
  id: "result-contract", kind: "rule", rule: { type: "result_action", result: { tool: "permission" }, path, equals, forbids: { tool: "write" }, within_ms: 5000, scope: "same_parent", clock: "same" },
}) as RuleCheck;
const span = (id: string, tool: string, startMs: number, endMs: number, output?: unknown, parentId: string | null = "root"): SpanInfo => ({
  id, ref: id, parentId, name: tool, toolName: tool, kind: "TOOL", status: "ok", startMs, endMs, durationMs: endMs - startMs, seq: 1, output: output as SpanInfo["output"],
});
const trace = (...spans: SpanInfo[]): TraceSnapshot => ({ traceId: "trace", run: undefined, spans });

describe("explicit result-to-action contract", () => {
  it("returns both observed spans as proof without copying their payloads", () => {
    const result = span("result", "permission", 1, 2, { allowed: false, private: "not copied" });
    const action = span("action", "write", 3, 4);
    const hit = evaluateRule(check(), trace(action, result), true)!;
    expect(hit.evidenceSpanIds).toEqual(["result", "action"]);
    expect(hit.params).toMatchObject({ result_tool: "permission", action_tool: "write", path: '["allowed"]', value: "false", count: "1", evaluated: "1" });
    expect(JSON.stringify(hit)).not.toContain("not copied");
  });
  it.each([null, false, 0, ""])("compares scalar %j without truthiness", (value) => {
    expect(evaluateRule(check(value), trace(span("r", "permission", 1, 2, { allowed: value }), span("a", "write", 3, 4)), true)?.firing).toBe(true);
  });
  it.each([
    ["parallel", span("r", "permission", 1, 5, { allowed: false }), span("a", "write", 3, 4)],
    ["other parent", span("r", "permission", 1, 2, { allowed: false }, "other"), span("a", "write", 3, 4)],
    ["missing parent", span("r", "permission", 1, 2, { allowed: false }, null), span("a", "write", 3, 4, undefined, null)],
    ["missing path", span("r", "permission", 1, 2, {}), span("a", "write", 3, 4)],
    ["json string", span("r", "permission", 1, 2, '{"allowed":false}'), span("a", "write", 3, 4)],
    ["later result", span("r", "permission", 5, 6, { allowed: false }), span("a", "write", 3, 4)],
  ])("does not infer a violation from %s", (_label, result, action) => {
    expect(evaluateRule(check(), trace(result as SpanInfo, action as SpanInfo), true)).toMatchObject({ firing: false });
  });
  it("uses a newer allowed result instead of an older blocked one", () => {
    expect(evaluateRule(check(), trace(span("r1", "permission", 1, 2, { allowed: false }), span("r2", "permission", 3, 4, { allowed: true }), span("a", "write", 5, 6)), true)).toMatchObject({ firing: false });
  });
  it("skips tied latest results and in-flight refreshes", () => {
    const blocked = span("r1", "permission", 1, 2, { allowed: false });
    for (const refresh of [span("r2", "permission", 1, 2, { allowed: true }), span("r2", "permission", 3, 7, { allowed: true })]) {
      expect(evaluateRule(check(), trace(blocked, refresh, span("a", "write", 5, 6)), true)).toMatchObject({ firing: false });
    }
  });
  it("rejects unsafe paths and implicit selectors", () => {
    for (const path of [["__proto__"], ["constructor"], ["prototype"]]) expect(() => check(false, path)).toThrow();
    const parsed = check();
    expect(AnyCheck.safeParse({ ...parsed, rule: { ...parsed.rule, result: {} } }).success).toBe(false);
  });
});

describe("labeled temporal contract corpus", () => {
  const values = [false, null, 0, "", "blocked", "denied", 42, -1, true, "no", 0.25, "needs_review"];
  const cases = values.flatMap((value, i) => {
    const t = i * 100 + 1;
    const blocked = span("r", "permission", t, t + 1, { allowed: value });
    const action = span("a", "write", t + 3, t + 4);
    const positives = Array.from({ length: 5 }, (_, j) => ({
      label: `fire-${i}-${j}`, expected: true, check: check(value),
      spans: j % 2 ? [action, { ...blocked, endMs: t + 1 + j / 10 }] : [blocked, { ...action, startMs: t + 2 + j / 10 }],
    }));
    const controls = [
      { label: `clean-other-parent-${i}`, spans: [{ ...blocked, parentId: "other" }, action] },
      { label: `clean-overlap-${i}`, spans: [{ ...blocked, endMs: t + 5 }, action] },
      { label: `clean-missing-${i}`, spans: [{ ...blocked, output: {} }, action] },
      { label: `clean-allowed-refresh-${i}`, spans: [blocked, span("new", "permission", t + 1.5, t + 2, { allowed: "different" }), action] },
      { label: `clean-action-first-${i}`, spans: [{ ...blocked, startMs: t + 5, endMs: t + 6 }, action] },
    ].map((c) => ({ ...c, expected: false, check: check(value) }));
    return [...positives, ...controls];
  });
  it("has 60 firing and 60 clean labels", () => {
    expect(cases.filter((c) => c.expected)).toHaveLength(60);
    expect(cases.filter((c) => !c.expected)).toHaveLength(60);
  });
  it.each(cases)("$label", (c) => {
    expect(evaluateRule(c.check, trace(...c.spans), true)?.firing ?? false).toBe(c.expected);
  });
});


it("checks structured results after real OTLP ingest and SQLite reload", () => {
  const home = tmpHome();
  const store = new Store(path.join(home, "data"));
  try {
    const traceId = hex(16);
    const parent = hex(8);
    const result = toolSpan(traceId, parent, "permission", "{}", '{"allowed":false}');
    const action = toolSpan(traceId, parent, "write", "{}", '{"ok":true}');
    store.ingest([batch([result, action])]);
    const loaded = loadTrace(store, traceId);
    expect(loaded.spans.find((s) => s.id === result.spanId)?.output).toEqual({ allowed: false });
    expect(evaluateRule(check(), loaded, true)?.evidenceSpanIds).toEqual([result.spanId, action.spanId]);
  } finally {
    store.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

it("reads own nested and indexed values, not inherited members or array metadata", () => {
  const action = span("a", "write", 4, 5);
  for (const [output, selected, expected] of [
    [{ rows: [{ allowed: false }] }, ["rows", 0, "allowed"], true],
    [{ rows: [{ allowed: false }] }, ["rows", "00", "allowed"], false],
    [{ rows: [] }, ["rows", "length"], false],
    [Object.create({ allowed: false }), ["allowed"], false],
    [{ allowed: undefined }, ["allowed"], false],
    [{ allowed: "false" }, ["allowed"], false],
  ] as [unknown, (string | number)[], boolean][]) {
    expect(evaluateRule(check(false, selected), trace(span("r", "permission", 1, 2, output), action), true)?.firing ?? false).toBe(expected);
  }
});

it("rejects empty selector arrays and blank selector names", () => {
  for (const selector of [{ tool: [] }, { name: " " }, { type: [""] }, { tool: ["", "permission"] }]) {
    const parsed = check();
    expect(AnyCheck.safeParse({ ...parsed, rule: { ...parsed.rule, result: selector } }).success).toBe(false);
  }
});

it("skips malformed timestamps, ties and an unfinished refresh", () => {
  const action = span("a", "write", 5, 6);
  const blocked = span("r", "permission", 1, 2, { allowed: false });
  for (const update of [
    { ...blocked, id: "r2", startMs: 3, endMs: 0 },
    { ...blocked, id: "r2", startMs: 3, endMs: Number.NaN },
    { ...blocked, id: "r2", startMs: 1, endMs: 2 },
  ]) expect(evaluateRule(check(), trace(blocked, update, action), true)).toMatchObject({ firing: false });
  for (const bad of [{ ...action, startMs: Number.NaN }, { ...action, endMs: 0 }, { ...action, startMs: 8 }]) {
    expect(evaluateRule(check(), trace(blocked, bad), true)).toMatchObject({ firing: false });
  }
});

it("is end-only and requires bounded, explicit clock/scope configuration", () => {
  expect(evaluateRule(check(), trace(span("r", "permission", 1, 2, { allowed: false }), span("a", "write", 3, 4)), false)).toBeNull();
  for (const change of [{ within_ms: 0 }, { within_ms: -1 }, { within_ms: Infinity }, { within_ms: 3_600_001 }, { scope: undefined }, { clock: undefined }, { surprise: true }]) {
    const parsed = check();
    expect(AnyCheck.safeParse({ ...parsed, rule: { ...parsed.rule, ...change } }).success).toBe(false);
  }
  expect(AnyCheck.safeParse({ ...check(), action: "halt" }).success).toBe(false);
});

it("uses a strict lower and inclusive upper time boundary", () => {
  const result = span("r", "permission", 1, 2, { allowed: false });
  for (const [start, fires, reason] of [[2, false, "overlap_or_equal_boundary"], [2.001, true, ""], [5002, true, ""], [5002.001, false, "outside_window"]] as const) {
    const hit = evaluateRule(check(), trace(result, span("a", "write", start, start + 1)), true)!;
    expect(hit.firing).toBe(fires);
    if (reason) expect(JSON.parse(hit.params.skipped)[reason]).toBe(1);
  }
});

it("correlates only exact scalar entity keys, without falling back to a stale result", () => {
  const c = check();
  c.rule = { ...c.rule, correlate: { result: { field: "input", path: ["id"] }, action: { field: "input", path: ["id"] } } } as RuleCheck["rule"];
  const r1 = { ...span("r1", "permission", 1, 2, { allowed: false }), input: { id: 42 } };
  const r2 = { ...span("r2", "permission", 3, 4, { allowed: true }), input: { id: "42" } };
  const a = { ...span("a", "write", 5, 6), input: { id: 42 } };
  expect(evaluateRule(c, trace(r1, r2, a), true)?.firing).toBe(true);
  expect(evaluateRule(c, trace(r1, { ...r2, input: { id: 42 } }, a), true)?.firing).toBe(false);
  expect(evaluateRule(c, trace(r1, { ...r2, input: {} }, a), true)?.params.skipped).toContain("result_correlation_missing");
});

it("bounds large fan-out before scanning pairs and reports incomplete coverage", () => {
  const results = Array.from({ length: 400 }, (_, i) => span(`r${i}`, "permission", i + 1, i + 1.5, { allowed: false }));
  const actions = Array.from({ length: 400 }, (_, i) => span(`a${i}`, "write", 1000 + i, 1000.5 + i));
  const hit = evaluateRule(check(), trace(...results, ...actions), true)!;
  expect(hit.firing).toBe(false);
  expect(hit.params.evaluated).toBe("0");
  expect(JSON.parse(hit.params.skipped)).toEqual({ comparison_budget: 400 });
});
