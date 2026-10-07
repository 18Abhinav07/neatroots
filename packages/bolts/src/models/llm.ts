import os from "node:os";
import type { BoltsConfig } from "../config.js";
import { log } from "../util/log.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenLogprob {
  token: string;
  logprob: number;
  top_logprobs?: { token: string; logprob: number }[];
}

export interface ChatResult {
  text: string;
  json?: unknown;
  logprobs?: TokenLogprob[];
  model: string;
  latencyMs: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface ChatOptions {
  schema?: { name: string; schema: Record<string, unknown> };
  maxTokens?: number;
  temperature?: number;
  logprobs?: boolean;
  topLogprobs?: number;
  timeoutSec?: number;
  signal?: AbortSignal;
  /** high: decisions and notes for a live run. low: investigations, summaries, planning. */
  priority?: "high" | "low";
}

export class LlmUnavailableError extends Error {}

/** Preferred models per memory tier, best first. Installed models are always preferred over downloads. */
export const TIER_PREFERENCES: Record<string, string[]> = {
  large: ["qwen3:14b", "gemma4", "gemma3:12b", "qwen3:8b", "llama3.1:8b", "mistral-nemo"],
  medium: ["qwen3:8b", "gemma4", "llama3.1:8b", "gemma3:4b", "qwen3:4b", "llama3.2:3b"],
  small: ["qwen3:4b", "llama3.2:3b", "gemma3:4b", "qwen3:1.7b", "gemma3:1b"],
};

export function hardwareTier(totalBytes = os.totalmem()): { tier: "large" | "medium" | "small"; memoryGb: number; description: string } {
  const gb = Math.round(totalBytes / 1024 ** 3);
  if (gb >= 32) return { tier: "large", memoryGb: gb, description: "8–14B instruct model, everything on device" };
  if (gb >= 16) return { tier: "medium", memoryGb: gb, description: "3–8B instruct model; investigations queue while the agent is busy" };
  return { tier: "small", memoryGb: gb, description: "rules and classifier on device; LLM work needs Ollama elsewhere or a cloud key" };
}

/**
 * A client for any OpenAI-compatible chat server: Ollama, LM Studio, llama.cpp
 * server, an MLX server, or an opt-in cloud endpoint. Calls are serialized so a
 * local model is never asked to run several prompts at once next to the user's agent.
 */
export class LlmClient {
  private resolvedModel?: string;
  private lastProbe = 0;
  private available = false;
  private high: (() => Promise<void>)[] = [];
  private low: (() => Promise<void>)[] = [];
  private running = false;
  private pending = 0;

  constructor(private readonly cfg: BoltsConfig["llm"]) {}

  get baseUrl(): string {
    return this.cfg.baseUrl.replace(/\/+$/, "");
  }

  get model(): string | undefined {
    return this.resolvedModel ?? (this.cfg.model !== "auto" ? this.cfg.model : undefined);
  }

  get busy(): number {
    return this.pending;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.cfg.apiKey) h.authorization = `Bearer ${this.cfg.apiKey}`;
    return h;
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/models`, { headers: this.headers(), signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`models list failed: HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { id: string }[] };
    return (body.data ?? []).map((m) => m.id);
  }

  /** Checks the server and resolves "auto" to an installed model. Cached for 30 s. */
  async probe(force = false): Promise<{ ok: boolean; model?: string; models?: string[]; error?: string }> {
    if (!this.cfg.enabled) return { ok: false, error: "LLM disabled in config" };
    if (!force && Date.now() - this.lastProbe < 30_000) {
      return { ok: this.available, model: this.model };
    }
    this.lastProbe = Date.now();
    try {
      const models = (await this.listModels()).filter((m) => !/embed|bge|minilm|nomic/i.test(m));
      if (this.cfg.model !== "auto") {
        this.resolvedModel = this.cfg.model;
      } else {
        const tier = hardwareTier().tier;
        const prefs = TIER_PREFERENCES[tier];
        const pick =
          prefs.map((p) => models.find((m) => m === p || m.startsWith(p + ":") || m.startsWith(p))).find(Boolean) ?? models[0];
        this.resolvedModel = pick;
      }
      this.available = !!this.resolvedModel;
      return { ok: this.available, model: this.resolvedModel, models, error: this.available ? undefined : "no chat model installed" };
    } catch (err) {
      this.available = false;
      return { ok: false, error: (err as Error).message };
    }
  }

  async isAvailable(): Promise<boolean> {
    return (await this.probe()).ok;
  }

  /** Queues a chat call. One call runs at a time; high-priority calls go first. */
  chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    this.pending++;
    return new Promise<ChatResult>((resolve, reject) => {
      const job = async () => {
        try {
          resolve(await this.chatNow(messages, opts));
        } catch (err) {
          reject(err);
        } finally {
          this.pending--;
        }
      };
      (opts.priority === "low" ? this.low : this.high).push(job);
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const job = this.high.shift() ?? this.low.shift();
        if (!job) break;
        await job();
      }
    } finally {
      this.running = false;
    }
  }

  private async chatNow(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
    const probe = await this.probe();
    if (!probe.ok || !this.model) throw new LlmUnavailableError(probe.error ?? "no local LLM available");
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 512,
      stream: false,
    };
    // Thinking models spend their budget reasoning; Bolts wants the answer.
    if (/localhost|127\.0\.0\.1/.test(this.baseUrl)) body.reasoning_effort = "none";
    if (opts.logprobs) {
      body.logprobs = true;
      body.top_logprobs = opts.topLogprobs ?? 10;
    }
    if (opts.schema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema },
      };
    }
    const started = Date.now();
    const timeout = AbortSignal.timeout((opts.timeoutSec ?? this.cfg.timeoutSec) * 1000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, { method: "POST", headers: this.headers(), body: JSON.stringify(body), signal });
    } catch (err) {
      this.lastProbe = 0;
      throw new LlmUnavailableError(`LLM request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Some servers reject reasoning_effort or logprobs; retry once without them.
      if (res.status === 400 && (body.reasoning_effort || body.logprobs)) {
        delete body.reasoning_effort;
        delete body.logprobs;
        delete body.top_logprobs;
        res = await fetch(`${this.baseUrl}/chat/completions`, { method: "POST", headers: this.headers(), body: JSON.stringify(body), signal });
        if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      } else {
        throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; logprobs?: { content?: TokenLogprob[] } }[];
      usage?: ChatResult["usage"];
      model?: string;
    };
    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? "";
    const result: ChatResult = {
      text,
      logprobs: choice?.logprobs?.content ?? undefined,
      model: data.model ?? this.model,
      latencyMs: Date.now() - started,
      usage: data.usage,
    };
    if (opts.schema) result.json = parseJsonLoose(text);
    log.debug(`llm ${result.model} ${result.latencyMs}ms ${text.slice(0, 80).replace(/\n/g, " ")}`);
    return result;
  }
}

/** Parses model JSON, tolerating code fences and leading prose. */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const start = t.search(/[{[]/);
    if (start === -1) return undefined;
    for (let end = t.length; end > start; end--) {
      try {
        return JSON.parse(t.slice(start, end));
      } catch {
        /* keep shrinking */
      }
    }
    return undefined;
  }
}
