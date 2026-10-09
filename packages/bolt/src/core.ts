import path from "node:path";
import { boltHome, loadConfig, saveConfig, type BoltConfig } from "./config.js";
import { Bus } from "./bus.js";
import { Store, type TraceUpdate } from "./store/db.js";
import type { ResourceSpansBatch } from "./otlp/types.js";
import { LlmClient } from "./models/llm.js";
import { DecisionModel } from "./models/decision.js";
import { CheckRegistry } from "./checks/registry.js";
import { SteeringHub } from "./steering/hub.js";
import { Engine } from "./engine/engine.js";
import { Relay } from "./relay/relay.js";
import { LayaManager } from "./models/laya.js";
import { getSecret } from "./relay/keychain.js";
import { log } from "./util/log.js";

export interface BoltOptions {
  home?: string;
  config?: BoltConfig;
  /** Skip the check engine (used by tests and read-only tools). */
  noEngine?: boolean;
}

/** The running Bolt instance: config, store, models, checks, steering and the event bus every part shares. */
export class Bolt {
  readonly config: BoltConfig;
  readonly home: string;
  readonly store: Store;
  readonly bus = new Bus();
  readonly startedMs = Date.now();
  readonly llm: LlmClient;
  readonly decisions: DecisionModel;
  readonly checks: CheckRegistry;
  readonly steering: SteeringHub;
  readonly engine?: Engine;
  readonly relay: Relay;
  readonly laya: LayaManager;
  private sweeper?: NodeJS.Timeout;
  /** When a coding agent last called Bolt over MCP. */
  mcpSeenMs: number | null = null;
  /** The run and span the app has in focus, for the MCP get_current_run tool. */
  focus: { trace_id: string; span_id: string | null; at: number } | null = null;
  /** Cloud pushes a coding agent asked for, waiting for the user to confirm in the app. */
  readonly pushes = new Map<string, { id: string; trace_ids: string[]; requested_by: string; created_ms: number; status: "pending" | "sent" | "failed" | "declined"; forward_id?: string; error?: string }>();

  constructor(opts: BoltOptions = {}) {
    this.home = opts.home ?? boltHome();
    this.config = opts.config ?? loadConfig();
    this.store = new Store(path.join(this.home, "data"));
    this.llm = new LlmClient(this.config.llm, { secret: (n) => getSecret(n), redactPatterns: () => this.config.cloud.redactPatterns });
    this.laya = new LayaManager(this.home, this.config.classifier);
    this.decisions = new DecisionModel(
      this.config.classifier,
      this.llm,
      { laya: async () => this.laya.token, jevCloud: () => getSecret("jev-api-key") },
      this.store.trustStore(),
    );
    this.checks = new CheckRegistry(this.store, path.join(this.home, "checks"), () => this.config.checkDirs);
    this.steering = new SteeringHub(this);
    this.relay = new Relay(this);
    if (!opts.noEngine) this.engine = new Engine(this, this.llm, this.decisions, this.checks, this.steering);
  }

  ingest(batches: ResourceSpansBatch[]): TraceUpdate[] {
    const updates = this.store.ingest(batches);
    for (const u of updates) this.bus.emit("trace", u);
    return updates;
  }

  saveConfig(): void {
    saveConfig(this.config);
  }

  /** Applies retention now and every hour. */
  startRetention(): void {
    const run = () => {
      try {
        const removed = this.store.sweep(this.config.retention.days, this.config.retention.maxGb * 1024 ** 3);
        if (removed) log.info(`retention removed ${removed} old runs`);
      } catch (err) {
        log.warn(`retention failed: ${(err as Error).message}`);
      }
    };
    run();
    this.sweeper = setInterval(run, 3_600_000);
    this.sweeper.unref();
  }

  /** Installs (first run) and starts Laya in the background; checks use the LLM until it is ready. */
  startModels(): void {
    if (!this.config.classifier.laya.enabled) return;
    if (this.config.classifier.backend !== "auto" && this.config.classifier.backend !== "laya") return;
    void this.laya.ensure().then(() => this.decisions.reset());
  }

  close(): void {
    clearInterval(this.sweeper);
    this.laya.stop();
    this.store.close();
  }
}
