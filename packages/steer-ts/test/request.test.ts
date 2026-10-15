import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure, wrapOpenAI } from "../src/index.js";

beforeEach(() => configure({ disabled: true }));
afterEach(() => configure({ disabled: false }));

describe("OpenAI request helpers", () => {
  it.each(["chat", "responses"])("forwards helpers on %s requests with the original receiver and options", async (api) => {
    const response = new Response("ok");
    const sdkRequest = Object.assign(Promise.resolve("ok"), {
      asResponse: vi.fn(async function (this: unknown) {
        expect(this).toBe(sdkRequest);
        return response;
      }),
      withResponse: vi.fn(async function (this: unknown) {
        expect(this).toBe(sdkRequest);
        return { data: "ok", response };
      }),
    });
    const create = vi.fn(function (this: unknown, _params: unknown, _options: unknown) {
      expect(this).toBe(owner);
      return sdkRequest;
    });
    const owner = { create };
    wrapOpenAI(api === "chat" ? { chat: { completions: owner } } : { responses: owner });
    const params = { model: "test", messages: [{ role: "user", content: "hi" }], input: "hi" };
    const options = { headers: { "x-test": "local" } };
    const request = owner.create(params, options);
    expect(await request.asResponse()).toBe(response);
    expect(await request.withResponse()).toEqual({ data: "ok", response });
    expect(await request).toBe("ok");
    expect(create).toHaveBeenCalledExactlyOnceWith(params, options);
  });
});
