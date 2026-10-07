import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { distributionFromLogprobs, JevBackend, parseJevAnswer } from "../src/models/decision.js";
import { defaultConfig } from "../src/config.js";
import { parseJsonLoose } from "../src/models/llm.js";

describe("decision model", () => {
  it("turns answer-token logprobs into a distribution", () => {
    const tokens = [
      { token: '{"', logprob: -0.1 },
      { token: "answer", logprob: -0.1 },
      { token: ' "', logprob: -0.1 },
      { token: "yes", logprob: -0.47, top_logprobs: [{ token: "yes", logprob: -0.47 }, { token: "Yes", logprob: -1.01 }, { token: "true", logprob: -5.38 }, { token: "No", logprob: -6.85 }] },
    ];
    const d = distributionFromLogprobs(["yes", "no"], tokens, "yes")!;
    const p = d.yes / (d.yes + d.no);
    expect(p).toBeGreaterThan(0.99);
    expect(distributionFromLogprobs(["success", "empty", "error"], [{ token: "error", logprob: -0.1, top_logprobs: [{ token: "error", logprob: -0.1 }, { token: "empty", logprob: -2.5 }] }], "error")!.error).toBeGreaterThan(0.8);
  });

  it("parses Jev-style answers for every question type", () => {
    expect(parseJevAnswer({ name: "q", type: "yes_no", ask: "?" }, { type: "noul", noul: 0.97 }).probability).toBeCloseTo(0.97);
    const c = parseJevAnswer({ name: "c", type: "choice", ask: "?", options: { a: "", b: "" } }, { choice: "b", confidence: 0.8 });
    expect(c.choice).toBe("b");
    expect(c.distribution.b).toBeCloseTo(0.8);
    const sc = parseJevAnswer({ name: "s", type: "score", ask: "?", levels: ["0", "1", "2"] }, { score: 1.5 });
    expect(sc.score).toBeCloseTo(1.5);
  });

  it("talks to a Jev-compatible server over POST /v1/systemone", async () => {
    let seen: any;
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
        const answers: Record<string, unknown> = {};
        for (const [name, q] of Object.entries<any>(seen.body.questions)) answers[name] = q.type === "noul" ? { type: "noul", noul: 0.9 } : q.type === "choice" ? { type: "choice", choice: Object.keys(q.criteria)[0], confidence: 0.7 } : { type: "score", score: 2 };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ model: "laya-test", answers }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const cfg = defaultConfig().classifier;
    cfg.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cfg.apiKey = "k";
    const jev = new JevBackend(cfg);
    expect(await jev.available()).toBe(true);
    const r = await jev.decide("state text", [
      { name: "yn", type: "yes_no", ask: "Bad?" },
      { name: "ch", type: "choice", ask: "Which?", options: { x: "x desc", y: "y desc" } },
      { name: "sc", type: "score", ask: "How bad?", levels: ["none", "low", "high"] },
    ]);
    expect(seen.url).toBe("/v1/systemone");
    expect(seen.auth).toBe("Bearer k");
    expect(seen.body.questions.yn).toEqual({ type: "noul", instructions: "Bad?" });
    expect(seen.body.questions.sc.criteria).toEqual(["none", "low", "high"]);
    expect(r.model).toBe("laya-test");
    expect(r.answers.yn.probability).toBeCloseTo(0.9);
    expect(r.answers.ch.choice).toBe("x");
    expect(r.answers.sc.score).toBe(2);
    server.close();
  });

  it("parses model JSON loosely", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! {"a": [1,2]} trailing')).toEqual({ a: [1, 2] });
    expect(parseJsonLoose("nope")).toBeUndefined();
  });
});
