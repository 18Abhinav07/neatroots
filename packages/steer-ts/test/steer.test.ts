import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateText, wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { applyAnthropic, applyMessages, NeatrootsHalt, rootsMiddleware, checkMyWork, configure, handleToolCall, wrapOpenAI, type Note } from "../src/index.js";

const notes: (Note | null)[] = [];
const claims: any[] = [];
let server: http.Server;
let url = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const b = JSON.parse(body || "{}");
      let out: unknown = {};
      if (req.url === "/api/steer/claim") {
        claims.push(b);
        out = { mode: "advisory", note: notes.shift() ?? null };
      } else if (req.url === "/api/steer/check") out = { probability: 0.2, answer: "no", evidence_span_ids: ["s1"] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  configure({ url, traceId: () => "a".repeat(32) });
  notes.length = 0;
  claims.length = 0;
});

const note = (text = "Stop retrying.", kind: Note["kind"] = "template"): Note => ({ id: "n1", kind, text, finding_id: "f1" });

describe("neatroots-steer (ts)", () => {
  it("adds the note to OpenAI-style messages", async () => {
    notes.push(note());
    const out = await applyMessages([{ role: "user", content: "hi" }]);
    expect(out[0].content).toContain("<neatroots-guidance>");
    expect(claims[0].trace_id).toBe("a".repeat(32));
    const after = await applyMessages([{ role: "tool", content: "{}" }], note());
    expect(after).toHaveLength(2);
    expect(after[1].role).toBe("user");
  });

  it("joins the Anthropic tool_result turn", async () => {
    const out = await applyAnthropic([{ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "x" }] }], note());
    expect((out[0].content as any[]).at(-1).text).toContain("Stop retrying.");
  });

  it("wraps an OpenAI client", async () => {
    notes.push(note());
    let seen: any;
    const client = wrapOpenAI({ chat: { completions: { create: async (p: any) => ((seen = p), "ok") } } });
    expect(await client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "q" }] })).toBe("ok");
    expect(seen.messages[0].content).toContain("<neatroots-guidance>");
  });

  it("raises NeatrootsHalt for halt notes", async () => {
    notes.push(note("Your rule says stop.", "halt"));
    const client = wrapOpenAI({ chat: { completions: { create: async (_p: unknown) => "should not run" } } });
    await expect(client.chat.completions.create({ messages: [{ role: "user", content: "q" }] })).rejects.toBeInstanceOf(NeatrootsHalt);
  });

  it("works as AI SDK 7 middleware", async () => {
    notes.push(note("Check the order id first."));
    let prompt: any;
    const model = wrapLanguageModel({
      model: new MockLanguageModelV4({
        doGenerate: async (opts: any) => {
          prompt = opts.prompt;
          return { content: [{ type: "text", text: "done" }], finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] } as any;
        },
      }),
      middleware: rootsMiddleware(),
    });
    const r = await generateText({ model, prompt: "refund 4512" });
    expect(r.text).toBe("done");
    expect(JSON.stringify(prompt)).toContain("Check the order id first.");
  });

  it("asks neatroots about the run and answers tool calls", async () => {
    expect((await checkMyWork("Did I verify?")).probability_yes).toBe(0.2);
    expect(JSON.parse((await handleToolCall("check_my_work", '{"question":"Q?"}'))!).answer).toBe("no");
    expect(await handleToolCall("other", "{}")).toBeUndefined();
  });

  it("is silent when neatroots is unreachable", async () => {
    configure({ url: "http://127.0.0.1:9", traceId: () => "b".repeat(32) });
    const msgs = [{ role: "user", content: "q" }];
    expect(await applyMessages(msgs)).toBe(msgs);
    expect((await checkMyWork("q")).answer).toBe("unknown");
  });
});
