import { EventEmitter } from "node:events";
import type { TraceUpdate } from "./store/db.js";
import type { Explanation, Finding, Note } from "./types.js";

export interface BoltsEvents {
  trace: TraceUpdate;
  finding: Finding;
  note: Note;
  explanation: Explanation;
  summary: { trace_id: string; text: string };
  plan: { workflow: string; plan_id: string; trace_id?: string };
  settings: { project?: string };
  activity: { trace_id?: string; kind: string; message: string };
}

export class Bus {
  private ee = new EventEmitter();

  constructor() {
    this.ee.setMaxListeners(200);
  }

  emit<K extends keyof BoltsEvents>(event: K, payload: BoltsEvents[K]): void {
    this.ee.emit(event, payload);
    this.ee.emit("*", { event, payload });
  }

  on<K extends keyof BoltsEvents>(event: K, fn: (payload: BoltsEvents[K]) => void): () => void {
    this.ee.on(event, fn);
    return () => this.ee.off(event, fn);
  }

  onAny(fn: (e: { event: keyof BoltsEvents; payload: unknown }) => void): () => void {
    this.ee.on("*", fn);
    return () => this.ee.off("*", fn);
  }
}
