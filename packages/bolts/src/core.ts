import path from "node:path";
import { boltsHome, loadConfig, type BoltsConfig } from "./config.js";
import { Bus } from "./bus.js";
import { Store, type TraceUpdate } from "./store/db.js";
import type { ResourceSpansBatch } from "./otlp/types.js";

export interface BoltsOptions {
  home?: string;
  config?: BoltsConfig;
}

/** The running Bolts instance: config, store and the event bus every part shares. */
export class Bolts {
  readonly config: BoltsConfig;
  readonly home: string;
  readonly store: Store;
  readonly bus = new Bus();
  readonly startedMs = Date.now();

  constructor(opts: BoltsOptions = {}) {
    this.home = opts.home ?? boltsHome();
    this.config = opts.config ?? loadConfig();
    this.store = new Store(path.join(this.home, "data"));
  }

  ingest(batches: ResourceSpansBatch[]): TraceUpdate[] {
    const updates = this.store.ingest(batches);
    for (const u of updates) this.bus.emit("trace", u);
    return updates;
  }

  close(): void {
    this.store.close();
  }
}
