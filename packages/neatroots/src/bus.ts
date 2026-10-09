import { EventEmitter } from "node:events";
import type { TraceUpdate } from "./store/db.js";
import type { Explanation, Finding, Note } from "./types.js";

export interface RootsEvents {
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

  emit<K extends keyof RootsEvents>(event: K, payload: RootsEvents[K]): void {
    this.ee.emit(event, payload);
    this.ee.emit("*", { event, payload });
  }

  on<K extends keyof RootsEvents>(event: K, fn: (payload: RootsEvents[K]) => void): () => void {
    this.ee.on(event, fn);
    return () => this.ee.off(event, fn);
  }

  onAny(fn: (e: { event: keyof RootsEvents; payload: unknown }) => void): () => void {
    this.ee.on("*", fn);
    return () => this.ee.off("*", fn);
  }
}
