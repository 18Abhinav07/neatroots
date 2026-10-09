import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

export type SteeringMode = "off" | "advisory" | "gate" | "self-check";

export interface ProjectSettings {
  /** Steering is opt-in per project. */
  steering: SteeringMode;
  /** Re-export this project's runs to Neatlogs Cloud as they finish. */
  forward: boolean;
}

export interface RootsConfig {
  port: number;
  host: string;
  llm: {
    /** OpenAI-compatible base URL, e.g. http://localhost:11434/v1 (Ollama). */
    baseUrl: string;
    /** Model name; "auto" picks an installed model. */
    model: string;
    apiKey?: string;
    /** Seconds the LLM may take for one call. */
    timeoutSec: number;
    enabled: boolean;
    /**
     * An opt-in hosted LLM (Anthropic, OpenAI, OpenRouter, Gemini, any OpenAI-compatible URL)
     * used instead of the local one. The run content each LLM task needs is sent to it.
     */
    external: {
      enabled: boolean;
      /** A provider id from models/providers.ts. */
      provider: string;
      model: string;
      /** "" uses the provider's default URL. */
      baseUrl: string;
      /** What to strip before sending: secrets (keys, tokens), all (also emails, phones, your cloud patterns), or off. */
      redact: "secrets" | "all" | "off";
      /** Use the local LLM when the provider fails or has no key. */
      fallbackToLocal: boolean;
      timeoutSec: number;
    };
  };
  classifier: {
    /**
     * auto: Laya on this machine, then a custom Jev-compatible server, then Jev cloud (only
     * when enabled), then the local LLM as a stand-in. Or pin one of them.
     */
    backend: "auto" | "laya" | "jev" | "jev-cloud" | "llm";
    /** A custom Jev-compatible typed-decision server (POST /v1/systemone). */
    baseUrl: string;
    model: string;
    apiKey?: string;
    timeoutSec: number;
    /** Laya, installed and run by neatroots on 127.0.0.1. */
    laya: { enabled: boolean; autoInstall: boolean; port: number };
    /** TypeSafe's hosted Jev. Opt-in: span content a question needs is sent to it. */
    jevCloud: { enabled: boolean; baseUrl: string; model: string };
  };
  embeddings: {
    /** Empty disables the vector index; full-text search is always on. */
    model: string;
  };
  budgets: {
    plansPerRun: number;
    investigationsPerRun: number;
    notesPerRun: number;
    summariesPerRun: number;
  };
  retention: {
    days: number;
    maxGb: number;
  };
  steering: {
    /** Global kill switch. When false nothing is ever sent to agents. */
    enabled: boolean;
    maxNotesPerRun: number;
    gateWaitMs: number;
  };
  cloud: {
    endpoint: string;
    /** Where people open runs in Neatlogs Cloud. */
    appUrl: string;
    /** User regexes to redact before forwarding, in addition to the built-ins. */
    redactPatterns: string[];
  };
  /** Commands the user registered to rerun an agent, per project (MCP rerun tool). */
  rerun: Record<string, { command: string; cwd?: string }>;
  /** Extra directories holding checks (YAML), e.g. <repo>/.neatroots/checks. */
  checkDirs: string[];
  projects: Record<string, Partial<ProjectSettings>>;
}

export const DEFAULT_PORT = 4100;

export function defaultConfig(): RootsConfig {
  return {
    port: DEFAULT_PORT,
    host: "127.0.0.1",
    llm: {
      baseUrl: "http://localhost:11434/v1",
      model: "auto",
      timeoutSec: 120,
      enabled: true,
      external: {
        enabled: false,
        provider: "anthropic",
        model: "claude-opus-5-5",
        baseUrl: "",
        redact: "secrets",
        fallbackToLocal: true,
        timeoutSec: 120,
      },
    },
    classifier: {
      backend: "auto",
      baseUrl: "http://localhost:8000",
      model: "typed-decisions",
      timeoutSec: 15,
      laya: { enabled: true, autoInstall: true, port: 4101 },
      jevCloud: { enabled: false, baseUrl: "https://api.typesafe.ai", model: "jev-latest" },
    },
    embeddings: { model: "" },
    budgets: {
      plansPerRun: 1,
      investigationsPerRun: 3,
      notesPerRun: 3,
      summariesPerRun: 1,
    },
    retention: { days: 14, maxGb: 5 },
    steering: { enabled: true, maxNotesPerRun: 3, gateWaitMs: 300 },
    cloud: { endpoint: "https://ingest.neatlogs.com", appUrl: "https://app.neatlogs.com", redactPatterns: [] },
    rerun: {},
    checkDirs: [],
    projects: {},
  };
}

export function rootsHome(): string {
  if (process.env.NEATROOTS_HOME) return process.env.NEATROOTS_HOME;
  const home = path.join(os.homedir(), ".neatroots");
  if (fs.existsSync(home)) return home;
  // Installs from before the rename keep their data (and their Laya environment) where they were.
  const legacy = [".neatbolt", ".bolts"].map((d) => path.join(os.homedir(), d)).find((d) => fs.existsSync(path.join(d, "config.yaml")) || fs.existsSync(path.join(d, "data")));
  return legacy ?? home;
}

export function configPath(): string {
  return path.join(rootsHome(), "config.yaml");
}

function deepMerge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object" || Array.isArray(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const cur = out[k];
    if (cur && typeof cur === "object" && !Array.isArray(cur) && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(cur, v);
    } else if (v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  return out as T;
}

export function loadConfig(): RootsConfig {
  const file = configPath();
  let cfg = defaultConfig();
  if (fs.existsSync(file)) {
    try {
      cfg = deepMerge(cfg, YAML.parse(fs.readFileSync(file, "utf8")));
    } catch (err) {
      console.warn(`[neatroots] could not read ${file}: ${(err as Error).message}`);
    }
  }
  if (process.env.NEATROOTS_PORT) cfg.port = Number(process.env.NEATROOTS_PORT);
  if (process.env.NEATROOTS_LLM_BASE_URL) cfg.llm.baseUrl = process.env.NEATROOTS_LLM_BASE_URL;
  if (process.env.NEATROOTS_LLM_MODEL) cfg.llm.model = process.env.NEATROOTS_LLM_MODEL;
  if (process.env.NEATROOTS_CLASSIFIER_URL) cfg.classifier.baseUrl = process.env.NEATROOTS_CLASSIFIER_URL;
  if (process.env.NEATROOTS_CLASSIFIER_BACKEND) {
    cfg.classifier.backend = process.env.NEATROOTS_CLASSIFIER_BACKEND as RootsConfig["classifier"]["backend"];
  }
  return cfg;
}

export function saveConfig(cfg: RootsConfig): void {
  fs.mkdirSync(rootsHome(), { recursive: true });
  fs.writeFileSync(configPath(), YAML.stringify(cfg), "utf8");
}

export function projectSettings(cfg: RootsConfig, project: string): ProjectSettings {
  const p = cfg.projects[project] ?? {};
  return { steering: p.steering ?? "off", forward: p.forward ?? false };
}
