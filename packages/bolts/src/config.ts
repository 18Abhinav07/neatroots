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

export interface BoltsConfig {
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
  };
  classifier: {
    /** "auto" tries a Jev-compatible server, then falls back to the LLM. */
    backend: "auto" | "jev" | "llm";
    /** Base URL of a Jev-compatible typed-decision server (POST /v1/systemone). */
    baseUrl: string;
    model: string;
    apiKey?: string;
    timeoutSec: number;
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
  /** Extra directories holding checks (YAML), e.g. <repo>/.bolts/checks. */
  checkDirs: string[];
  projects: Record<string, Partial<ProjectSettings>>;
}

export const DEFAULT_PORT = 4100;

export function defaultConfig(): BoltsConfig {
  return {
    port: DEFAULT_PORT,
    host: "127.0.0.1",
    llm: {
      baseUrl: "http://localhost:11434/v1",
      model: "auto",
      timeoutSec: 120,
      enabled: true,
    },
    classifier: {
      backend: "auto",
      baseUrl: "http://localhost:8000",
      model: "laya",
      timeoutSec: 10,
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

export function boltsHome(): string {
  return process.env.BOLTS_HOME || path.join(os.homedir(), ".bolts");
}

export function configPath(): string {
  return path.join(boltsHome(), "config.yaml");
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

export function loadConfig(): BoltsConfig {
  const file = configPath();
  let cfg = defaultConfig();
  if (fs.existsSync(file)) {
    try {
      cfg = deepMerge(cfg, YAML.parse(fs.readFileSync(file, "utf8")));
    } catch (err) {
      console.warn(`[bolts] could not read ${file}: ${(err as Error).message}`);
    }
  }
  if (process.env.BOLTS_PORT) cfg.port = Number(process.env.BOLTS_PORT);
  if (process.env.BOLTS_LLM_BASE_URL) cfg.llm.baseUrl = process.env.BOLTS_LLM_BASE_URL;
  if (process.env.BOLTS_LLM_MODEL) cfg.llm.model = process.env.BOLTS_LLM_MODEL;
  if (process.env.BOLTS_CLASSIFIER_URL) cfg.classifier.baseUrl = process.env.BOLTS_CLASSIFIER_URL;
  if (process.env.BOLTS_CLASSIFIER_BACKEND) {
    cfg.classifier.backend = process.env.BOLTS_CLASSIFIER_BACKEND as BoltsConfig["classifier"]["backend"];
  }
  return cfg;
}

export function saveConfig(cfg: BoltsConfig): void {
  fs.mkdirSync(boltsHome(), { recursive: true });
  fs.writeFileSync(configPath(), YAML.stringify(cfg), "utf8");
}

export function projectSettings(cfg: BoltsConfig, project: string): ProjectSettings {
  const p = cfg.projects[project] ?? {};
  return { steering: p.steering ?? "off", forward: p.forward ?? false };
}
