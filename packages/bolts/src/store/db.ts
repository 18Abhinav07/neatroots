import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { BlobStore } from "./blobs.js";
import { sha256, newId } from "../util/ids.js";
import { buildView, preview, type SpanView } from "../semantics/view.js";
import { kvToPlain, type KeyValue, type OtlpResource, type OtlpScope, type OtlpSpan, type Plain, type ResourceSpansBatch } from "../otlp/types.js";
import type {
  Annotation,
  DecisionRow,
  Explanation,
  Finding,
  FindingStatus,
  ForwardRow,
  Note,
  NoteStatus,
  PlanRow,
  RunRow,
  SpanRow,
} from "../types.js";
import type { OtlpLogRecord } from "../otlp/codec.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scopes (id TEXT PRIMARY KEY, json TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project TEXT,
  workflow TEXT,
  first_seen_ms INTEGER,
  last_seen_ms INTEGER,
  run_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS runs (
  trace_id TEXT PRIMARY KEY,
  session_id TEXT,
  project TEXT,
  workflow TEXT,
  root_span_id TEXT,
  root_name TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  complete INTEGER NOT NULL DEFAULT 0,
  root_ended INTEGER NOT NULL DEFAULT 0,
  started_ms INTEGER,
  ended_ms INTEGER,
  last_span_ms INTEGER,
  span_count INTEGER NOT NULL DEFAULT 0,
  llm_calls INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  input_preview TEXT,
  output_preview TEXT,
  interrupted INTEGER NOT NULL DEFAULT 0,
  termination_reason TEXT,
  finding_count INTEGER NOT NULL DEFAULT 0,
  open_finding_count INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  doctor INTEGER NOT NULL DEFAULT 0,
  plan_id TEXT,
  received_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_started ON runs (started_ms DESC);
CREATE INDEX IF NOT EXISTS runs_session ON runs (session_id);
CREATE INDEX IF NOT EXISTS runs_workflow ON runs (workflow);
CREATE INDEX IF NOT EXISTS runs_project ON runs (project);

CREATE TABLE IF NOT EXISTS spans (
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  name TEXT NOT NULL,
  span_kind TEXT NOT NULL,
  otel_kind INTEGER NOT NULL DEFAULT 0,
  start_ns TEXT NOT NULL,
  end_ns TEXT NOT NULL,
  start_ms REAL NOT NULL,
  end_ms REAL NOT NULL,
  duration_ms REAL NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 0,
  status_message TEXT,
  model TEXT,
  provider TEXT,
  tool_name TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  input_preview TEXT,
  output_preview TEXT,
  error TEXT,
  attributes TEXT NOT NULL,
  events TEXT NOT NULL,
  links TEXT NOT NULL,
  extra TEXT,
  blobs TEXT,
  is_marker INTEGER NOT NULL DEFAULT 0,
  resource_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  received_ms INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (trace_id, span_id)
);
CREATE INDEX IF NOT EXISTS spans_trace_start ON spans (trace_id, start_ms);
CREATE INDEX IF NOT EXISTS spans_seq ON spans (seq);

CREATE VIRTUAL TABLE IF NOT EXISTS span_fts USING fts5 (
  trace_id UNINDEXED, span_id UNINDEXED, name, tool_name, body, tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT,
  span_id TEXT,
  time_ns TEXT,
  severity TEXT,
  body TEXT,
  attributes TEXT,
  resource_id TEXT,
  received_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_trace ON logs (trace_id);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  model TEXT,
  rationale TEXT,
  check_ids TEXT NOT NULL,
  body TEXT
);
CREATE INDEX IF NOT EXISTS plans_workflow ON plans (workflow, created_ms DESC);

CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  path TEXT,
  body TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  hits INTEGER NOT NULL DEFAULT 0,
  confirmed INTEGER NOT NULL DEFAULT 0,
  dismissed INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  span_id TEXT,
  probability REAL NOT NULL,
  answer TEXT,
  backend TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS decisions_trace ON decisions (trace_id, check_id);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  check_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  probability REAL,
  status TEXT NOT NULL,
  evidence_span_ids TEXT NOT NULL,
  detail TEXT NOT NULL,
  model TEXT,
  triage_score INTEGER,
  explanation_id TEXT,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS findings_trace ON findings (trace_id);
CREATE INDEX IF NOT EXISTS findings_check ON findings (check_id);

CREATE TABLE IF NOT EXISTS explanations (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  cause TEXT NOT NULL,
  fix TEXT,
  evidence_span_ids TEXT NOT NULL,
  grounding REAL,
  model TEXT,
  created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS explanations_target ON explanations (target_type, target_id);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  finding_id TEXT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  delivered_ms INTEGER,
  delivered_span_id TEXT,
  replaced_by TEXT,
  checks TEXT
);
CREATE INDEX IF NOT EXISTS notes_trace ON notes (trace_id, status);

CREATE TABLE IF NOT EXISTS summaries (
  trace_id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  model TEXT,
  created_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  span_id TEXT,
  label TEXT NOT NULL,
  text TEXT,
  author TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS annotations_trace ON annotations (trace_id);

CREATE TABLE IF NOT EXISTS forwards (
  id TEXT PRIMARY KEY,
  trace_ids TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  span_count INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  redactions INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  initiated_by TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  sha256 TEXT,
  mime_type TEXT,
  byte_length INTEGER,
  purpose TEXT,
  state TEXT NOT NULL,
  blob_sha TEXT,
  created_ms INTEGER NOT NULL
);
`;

export interface IngestedSpan {
  row: SpanRow;
  view: SpanView;
  isNew: boolean;
}

export interface TraceUpdate {
  traceId: string;
  spans: IngestedSpan[];
  runCreated: boolean;
  rootEnded: boolean;
  completed: boolean;
}

export interface RunFilter {
  project?: string;
  workflow?: string;
  status?: string;
  sessionId?: string;
  hasFinding?: boolean;
  text?: string;
  sinceMs?: number;
  untilMs?: number;
  limit?: number;
  offset?: number;
  includeDoctor?: boolean;
}

function nsToMs(ns: string): number {
  if (!ns || ns === "0") return 0;
  // Keep sub-millisecond precision without losing the int64.
  const big = BigInt(ns);
  return Number(big / 1000n) / 1000;
}

function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export class Store {
  readonly db: Database.Database;
  readonly blobs: BlobStore;
  private seq = 0;
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, "bolts.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(SCHEMA);
    this.migrate();
    this.blobs = new BlobStore(path.join(dir, "blobs"));
    const row = this.db.prepare("SELECT MAX(seq) AS s FROM spans").get() as { s: number | null };
    this.seq = row.s ?? 0;
  }

  close(): void {
    this.db.close();
  }

  /** Adds columns introduced after a database was first created. */
  private migrate(): void {
    const ensure = (table: string, column: string, type: string) => {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    };
    ensure("plans", "body", "TEXT");
    this.db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')").run();
  }

  // ------------------------------------------------------------------ ingest

  private upsertResource(r: OtlpResource): string {
    const body = JSON.stringify(r);
    const id = sha256(body).slice(0, 24);
    this.db.prepare("INSERT OR IGNORE INTO resources (id, json) VALUES (?, ?)").run(id, body);
    return id;
  }

  private upsertScope(s: OtlpScope): string {
    const body = JSON.stringify(s);
    const id = sha256(body).slice(0, 24);
    this.db.prepare("INSERT OR IGNORE INTO scopes (id, json) VALUES (?, ?)").run(id, body);
    return id;
  }

  getResource(id: string): OtlpResource {
    const r = this.db.prepare("SELECT json FROM resources WHERE id = ?").get(id) as { json: string } | undefined;
    return json<OtlpResource>(r?.json, { attributes: [] });
  }

  getScope(id: string): OtlpScope {
    const r = this.db.prepare("SELECT json FROM scopes WHERE id = ?").get(id) as { json: string } | undefined;
    return json<OtlpScope>(r?.json, { name: "" });
  }

  /** Stores spans losslessly and updates run, session and search rows. */
  ingest(batches: ResourceSpansBatch[]): TraceUpdate[] {
    const updates = new Map<string, TraceUpdate>();
    const now = Date.now();
    const tx = this.db.transaction(() => {
      for (const b of batches) {
        const resourceId = this.upsertResource(b.resource);
        const scopeId = this.upsertScope(b.scope);
        const resAttrs = kvToPlain(b.resource.attributes);
        for (const span of b.spans) {
          const view = buildView(span, b.resource.attributes);
          const exists = this.db
            .prepare("SELECT 1 FROM spans WHERE trace_id = ? AND span_id = ?")
            .get(span.traceId, span.spanId);
          let u = updates.get(span.traceId);
          if (!u) {
            u = { traceId: span.traceId, spans: [], runCreated: false, rootEnded: false, completed: false };
            updates.set(span.traceId, u);
          }
          const row = this.writeSpan(span, view, resourceId, scopeId, now);
          u.spans.push({ row, view, isNew: !exists });
          const runFlags = this.updateRun(span, view, row, resAttrs, now, !exists);
          if (runFlags.created) u.runCreated = true;
          if (runFlags.rootEnded) u.rootEnded = true;
          if (runFlags.completed) u.completed = true;
        }
      }
    });
    tx();
    return [...updates.values()];
  }

  private writeSpan(span: OtlpSpan, view: SpanView, resourceId: string, scopeId: string, now: number): SpanRow {
    const used = new Set<string>();
    const attributes = this.blobs.offload(span.attributes, used);
    const events = span.events.map((e) => ({ ...e, attributes: this.blobs.offload(e.attributes, used) }));
    const startMs = nsToMs(span.startTimeUnixNano);
    const endMs = nsToMs(span.endTimeUnixNano) || startMs;
    const extra = {
      traceState: span.traceState,
      flags: span.flags,
      droppedAttributesCount: span.droppedAttributesCount,
      droppedEventsCount: span.droppedEventsCount,
      droppedLinksCount: span.droppedLinksCount,
    };
    const row: SpanRow = {
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId || null,
      name: span.name,
      span_kind: view.kind,
      otel_kind: span.kind,
      start_ns: span.startTimeUnixNano,
      end_ns: span.endTimeUnixNano,
      start_ms: startMs,
      end_ms: endMs,
      duration_ms: Math.max(0, endMs - startMs),
      status_code: span.status.code,
      status_message: span.status.message ?? null,
      model: view.model ?? null,
      provider: view.provider ?? null,
      tool_name: view.toolName ?? null,
      prompt_tokens: view.promptTokens ?? null,
      completion_tokens: view.completionTokens ?? null,
      total_tokens: view.totalTokens ?? null,
      input_preview: view.input !== undefined ? preview(view.input, 600) : null,
      output_preview: view.output !== undefined ? preview(view.output, 600) : null,
      error: view.error ?? null,
      is_marker: view.isMarker ? 1 : 0,
      resource_id: resourceId,
      scope_id: scopeId,
      received_ms: now,
      seq: ++this.seq,
    };
    this.db
      .prepare(
        `INSERT OR REPLACE INTO spans (trace_id, span_id, parent_span_id, name, span_kind, otel_kind, start_ns, end_ns,
          start_ms, end_ms, duration_ms, status_code, status_message, model, provider, tool_name, prompt_tokens,
          completion_tokens, total_tokens, input_preview, output_preview, error, attributes, events, links, extra, blobs,
          is_marker, resource_id, scope_id, received_ms, seq)
         VALUES (@trace_id, @span_id, @parent_span_id, @name, @span_kind, @otel_kind, @start_ns, @end_ns, @start_ms,
          @end_ms, @duration_ms, @status_code, @status_message, @model, @provider, @tool_name, @prompt_tokens,
          @completion_tokens, @total_tokens, @input_preview, @output_preview, @error, @attributes, @events, @links,
          @extra, @blobs, @is_marker, @resource_id, @scope_id, @received_ms, @seq)`,
      )
      .run({
        ...row,
        attributes: JSON.stringify(attributes),
        events: JSON.stringify(events),
        links: JSON.stringify(span.links),
        extra: JSON.stringify(extra),
        blobs: used.size ? JSON.stringify([...used]) : null,
      });
    if (!view.isMarker) {
      this.db.prepare("DELETE FROM span_fts WHERE trace_id = ? AND span_id = ?").run(span.traceId, span.spanId);
      const body = [
        view.input !== undefined ? preview(view.input, 4000) : "",
        view.output !== undefined ? preview(view.output, 4000) : "",
        view.error ?? "",
      ].join("\n");
      this.db
        .prepare("INSERT INTO span_fts (trace_id, span_id, name, tool_name, body) VALUES (?, ?, ?, ?, ?)")
        .run(span.traceId, span.spanId, span.name, view.toolName ?? "", body);
    }
    return row;
  }

  private updateRun(
    span: OtlpSpan,
    view: SpanView,
    row: SpanRow,
    resAttrs: Record<string, Plain>,
    now: number,
    isNew: boolean,
  ): { created: boolean; rootEnded: boolean; completed: boolean } {
    const flags = { created: false, rootEnded: false, completed: false };
    let run = this.getRun(span.traceId);
    if (!run) {
      const project = String(resAttrs["service.name"] ?? view.workflow ?? "unknown");
      this.db
        .prepare(
          `INSERT INTO runs (trace_id, project, workflow, status, started_ms, last_span_ms, received_ms, updated_ms, doctor)
           VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?)`,
        )
        .run(
          span.traceId,
          project,
          view.workflow ?? project,
          row.start_ms,
          row.end_ms,
          now,
          now,
          resAttrs["neatlogs.doctor"] === true ? 1 : 0,
        );
      flags.created = true;
      run = this.getRun(span.traceId)!;
    }
    const sets: string[] = ["updated_ms = @now", "last_span_ms = MAX(COALESCE(last_span_ms, 0), @end)"];
    const p: Record<string, unknown> = { now, end: row.end_ms, trace: span.traceId };
    if (!run.started_ms || row.start_ms < run.started_ms) {
      sets.push("started_ms = @start");
      p.start = row.start_ms;
    }
    if (view.isMarker) {
      if (!run.complete) {
        sets.push("complete = 1");
        flags.completed = true;
        if (!run.root_ended && run.status === "running") {
          sets.push("ended_ms = COALESCE(ended_ms, @end)");
        }
      }
    } else if (isNew) {
      sets.push("span_count = span_count + 1");
      if (view.kind === "LLM") {
        sets.push("llm_calls = llm_calls + 1");
        sets.push("prompt_tokens = prompt_tokens + @pt", "completion_tokens = completion_tokens + @ct", "total_tokens = total_tokens + @tt");
        p.pt = view.promptTokens ?? 0;
        p.ct = view.completionTokens ?? 0;
        p.tt = view.totalTokens ?? 0;
      }
      if (view.kind === "TOOL" || view.kind === "MCP_TOOL") sets.push("tool_calls = tool_calls + 1");
      if (span.status.code === 2) sets.push("error_count = error_count + 1");
    }
    if (view.interrupted) {
      sets.push("interrupted = 1", "status = 'interrupted'");
      if (view.terminationReason) {
        sets.push("termination_reason = @reason");
        p.reason = view.terminationReason;
      }
    }
    if (!span.parentSpanId && !view.isMarker) {
      sets.push(
        "root_span_id = @root",
        "root_name = @rootName",
        "root_ended = 1",
        "ended_ms = @end",
        "input_preview = @inp",
        "output_preview = @out",
      );
      p.root = span.spanId;
      p.rootName = span.name;
      p.inp = view.input !== undefined ? preview(view.input, 300) : null;
      p.out = view.output !== undefined ? preview(view.output, 300) : null;
      if (!view.interrupted && run.status !== "interrupted") {
        sets.push("status = @status");
        p.status = span.status.code === 2 ? "error" : "ok";
      }
      if (view.workflow) {
        sets.push("workflow = @wf");
        p.wf = view.workflow;
      }
      if (!run.root_ended) flags.rootEnded = true;
    }
    if (view.sessionId && (!run.session_id || !span.parentSpanId)) {
      sets.push("session_id = @session");
      p.session = view.sessionId;
    }
    this.db.prepare(`UPDATE runs SET ${sets.join(", ")} WHERE trace_id = @trace`).run(p);
    const after = this.getRun(span.traceId)!;
    const sessionId = after.session_id ?? after.trace_id;
    if (flags.created || p.session) this.touchSession(sessionId, after, now, flags.created || !!p.session);
    return flags;
  }

  private touchSession(id: string, run: RunRow, now: number, countRun: boolean): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, project, workflow, first_seen_ms, last_seen_ms, run_count) VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET last_seen_ms = excluded.last_seen_ms${countRun ? ", run_count = run_count + 1" : ""}`,
      )
      .run(id, run.project, run.workflow, now, now);
  }

  ingestLogs(records: OtlpLogRecord[]): number {
    const now = Date.now();
    const tx = this.db.transaction(() => {
      for (const r of records) {
        const resourceId = this.upsertResource(r.resource);
        const body = kvToPlain([{ key: "b", value: r.body }]).b;
        this.db
          .prepare(
            "INSERT INTO logs (trace_id, span_id, time_ns, severity, body, attributes, resource_id, received_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            r.traceId || null,
            r.spanId || null,
            r.timeUnixNano,
            r.severityText ?? (r.severityNumber !== undefined ? String(r.severityNumber) : null),
            typeof body === "string" ? body : JSON.stringify(body),
            JSON.stringify(r.attributes),
            resourceId,
            now,
          );
      }
    });
    tx();
    return records.length;
  }

  // ------------------------------------------------------------------- reads

  getRun(traceId: string): RunRow | undefined {
    return this.db.prepare("SELECT * FROM runs WHERE trace_id = ?").get(traceId) as RunRow | undefined;
  }

  listRuns(f: RunFilter = {}): RunRow[] {
    const where: string[] = [];
    const p: Record<string, unknown> = {};
    if (!f.includeDoctor) where.push("doctor = 0");
    if (f.project) {
      where.push("project = @project");
      p.project = f.project;
    }
    if (f.workflow) {
      where.push("workflow = @workflow");
      p.workflow = f.workflow;
    }
    if (f.status) {
      where.push("status = @status");
      p.status = f.status;
    }
    if (f.sessionId) {
      where.push("session_id = @session");
      p.session = f.sessionId;
    }
    if (f.hasFinding) where.push("finding_count > 0");
    if (f.sinceMs) {
      where.push("started_ms >= @since");
      p.since = f.sinceMs;
    }
    if (f.untilMs) {
      where.push("started_ms <= @until");
      p.until = f.untilMs;
    }
    if (f.text) {
      const ids = this.searchSpans(f.text, 500).map((h) => h.trace_id);
      const like = `%${f.text}%`;
      where.push(`(trace_id IN (SELECT value FROM json_each(@ids)) OR root_name LIKE @like OR workflow LIKE @like OR input_preview LIKE @like OR output_preview LIKE @like)`);
      p.ids = JSON.stringify([...new Set(ids)]);
      p.like = like;
    }
    const sql = `SELECT * FROM runs ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY COALESCE(started_ms, received_ms) DESC LIMIT @limit OFFSET @offset`;
    p.limit = Math.min(f.limit ?? 50, 500);
    p.offset = f.offset ?? 0;
    return this.db.prepare(sql).all(p) as RunRow[];
  }

  countRuns(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM runs WHERE doctor = 0").get() as { n: number }).n;
  }

  getSpans(traceId: string, includeMarker = false): SpanRow[] {
    return this.db
      .prepare(
        `SELECT trace_id, span_id, parent_span_id, name, span_kind, otel_kind, start_ns, end_ns, start_ms, end_ms,
          duration_ms, status_code, status_message, model, provider, tool_name, prompt_tokens, completion_tokens,
          total_tokens, input_preview, output_preview, error, is_marker, resource_id, scope_id, received_ms, seq
         FROM spans WHERE trace_id = ? ${includeMarker ? "" : "AND is_marker = 0"} ORDER BY start_ms, seq`,
      )
      .all(traceId) as SpanRow[];
  }

  getSpanRow(traceId: string, spanId: string): SpanRow | undefined {
    return this.getSpans(traceId, true).find((s) => s.span_id === spanId);
  }

  /** Reassembles a stored span as OTLP, restoring blob payloads. */
  getOtlpSpan(traceId: string, spanId: string): { span: OtlpSpan; resource: OtlpResource; scope: OtlpScope } | undefined {
    const r = this.db.prepare("SELECT * FROM spans WHERE trace_id = ? AND span_id = ?").get(traceId, spanId) as
      | (SpanRow & { attributes: string; events: string; links: string; extra: string | null })
      | undefined;
    if (!r) return undefined;
    return { span: this.rowToOtlp(r), resource: this.getResource(r.resource_id), scope: this.getScope(r.scope_id) };
  }

  private rowToOtlp(r: SpanRow & { attributes: string; events: string; links: string; extra: string | null }): OtlpSpan {
    const extra = json<Record<string, unknown>>(r.extra, {});
    const events = json<OtlpSpan["events"]>(r.events, []).map((e) => ({ ...e, attributes: this.blobs.rehydrate(e.attributes) }));
    return {
      traceId: r.trace_id,
      spanId: r.span_id,
      parentSpanId: r.parent_span_id ?? "",
      traceState: extra.traceState as string | undefined,
      flags: extra.flags as number | undefined,
      name: r.name,
      kind: r.otel_kind,
      startTimeUnixNano: r.start_ns,
      endTimeUnixNano: r.end_ns,
      attributes: this.blobs.rehydrate(json<KeyValue[]>(r.attributes, [])),
      droppedAttributesCount: extra.droppedAttributesCount as number | undefined,
      events,
      droppedEventsCount: extra.droppedEventsCount as number | undefined,
      links: json(r.links, []),
      droppedLinksCount: extra.droppedLinksCount as number | undefined,
      status: { code: r.status_code, message: r.status_message ?? undefined },
    };
  }

  /** All stored spans of the given traces, grouped by resource and scope, ready for OTLP export. */
  batchesForTraces(traceIds: string[]): ResourceSpansBatch[] {
    const groups = new Map<string, ResourceSpansBatch>();
    for (const traceId of traceIds) {
      const rows = this.db.prepare("SELECT * FROM spans WHERE trace_id = ? ORDER BY seq").all(traceId) as (SpanRow & {
        attributes: string;
        events: string;
        links: string;
        extra: string | null;
      })[];
      for (const r of rows) {
        const key = `${r.resource_id}:${r.scope_id}`;
        let g = groups.get(key);
        if (!g) {
          g = { resource: this.getResource(r.resource_id), scope: this.getScope(r.scope_id), spans: [] };
          groups.set(key, g);
        }
        g.spans.push(this.rowToOtlp(r));
      }
    }
    return [...groups.values()];
  }

  searchSpans(text: string, limit = 50): { trace_id: string; span_id: string; name: string; snippet: string }[] {
    const q = text
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t.replace(/"/g, '""')}"`)
      .join(" ");
    if (!q) return [];
    try {
      return this.db
        .prepare(
          `SELECT trace_id, span_id, name, snippet(span_fts, 4, '[', ']', '…', 12) AS snippet
           FROM span_fts WHERE span_fts MATCH ? ORDER BY rank LIMIT ?`,
        )
        .all(q, limit) as { trace_id: string; span_id: string; name: string; snippet: string }[];
    } catch {
      return [];
    }
  }

  logsForTrace(traceId: string): { span_id: string | null; time_ns: string; severity: string | null; body: string }[] {
    return this.db
      .prepare("SELECT span_id, time_ns, severity, body FROM logs WHERE trace_id = ? ORDER BY id")
      .all(traceId) as { span_id: string | null; time_ns: string; severity: string | null; body: string }[];
  }

  setPinned(traceId: string, pinned: boolean): void {
    this.db.prepare("UPDATE runs SET pinned = ? WHERE trace_id = ?").run(pinned ? 1 : 0, traceId);
  }

  setRunPlan(traceId: string, planId: string): void {
    this.db.prepare("UPDATE runs SET plan_id = ? WHERE trace_id = ?").run(planId, traceId);
  }

  // ----------------------------------------------------------------- findings

  private findingFromRow(r: Record<string, unknown>): Finding {
    return {
      ...(r as unknown as Finding),
      evidence_span_ids: json<string[]>(r.evidence_span_ids as string, []),
      detail: json<Record<string, Plain>>(r.detail as string, {}),
    };
  }

  insertFinding(f: Omit<Finding, "id" | "created_ms" | "updated_ms"> & { id?: string }): Finding {
    const now = Date.now();
    const finding: Finding = { ...f, id: f.id ?? newId("fnd"), created_ms: now, updated_ms: now };
    this.db
      .prepare(
        `INSERT INTO findings (id, trace_id, check_id, check_kind, title, probability, status, evidence_span_ids, detail,
          model, triage_score, explanation_id, created_ms, updated_ms)
         VALUES (@id, @trace_id, @check_id, @check_kind, @title, @probability, @status, @evidence_span_ids, @detail,
          @model, @triage_score, @explanation_id, @created_ms, @updated_ms)`,
      )
      .run({ ...finding, evidence_span_ids: JSON.stringify(finding.evidence_span_ids), detail: JSON.stringify(finding.detail) });
    this.db.prepare("UPDATE checks SET hits = hits + 1 WHERE id = ?").run(finding.check_id);
    this.refreshFindingCounts(finding.trace_id);
    return finding;
  }

  updateFinding(id: string, patch: Partial<Pick<Finding, "status" | "probability" | "triage_score" | "explanation_id" | "evidence_span_ids" | "detail" | "title">>): Finding | undefined {
    const cur = this.getFinding(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, updated_ms: Date.now() };
    this.db
      .prepare(
        `UPDATE findings SET status = @status, probability = @probability, triage_score = @triage_score,
          explanation_id = @explanation_id, evidence_span_ids = @evidence_span_ids, detail = @detail, title = @title,
          updated_ms = @updated_ms WHERE id = @id`,
      )
      .run({ ...next, evidence_span_ids: JSON.stringify(next.evidence_span_ids), detail: JSON.stringify(next.detail) });
    if (patch.status && patch.status !== cur.status) {
      if (patch.status === "dismissed") this.db.prepare("UPDATE checks SET dismissed = dismissed + 1 WHERE id = ?").run(cur.check_id);
      if (cur.status === "dismissed") this.db.prepare("UPDATE checks SET dismissed = MAX(0, dismissed - 1) WHERE id = ?").run(cur.check_id);
    }
    this.refreshFindingCounts(cur.trace_id);
    return next;
  }

  getFinding(id: string): Finding | undefined {
    const r = this.db.prepare("SELECT * FROM findings WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.findingFromRow(r) : undefined;
  }

  findingsForTrace(traceId: string): Finding[] {
    return (this.db.prepare("SELECT * FROM findings WHERE trace_id = ? ORDER BY created_ms").all(traceId) as Record<string, unknown>[]).map((r) =>
      this.findingFromRow(r),
    );
  }

  listFindings(f: { traceId?: string; status?: string; checkId?: string; limit?: number } = {}): Finding[] {
    const where: string[] = [];
    const p: Record<string, unknown> = { limit: f.limit ?? 100 };
    if (f.traceId) {
      where.push("trace_id = @trace");
      p.trace = f.traceId;
    }
    if (f.status) {
      where.push("status = @status");
      p.status = f.status;
    }
    if (f.checkId) {
      where.push("check_id = @check");
      p.check = f.checkId;
    }
    return (
      this.db
        .prepare(`SELECT * FROM findings ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_ms DESC LIMIT @limit`)
        .all(p) as Record<string, unknown>[]
    ).map((r) => this.findingFromRow(r));
  }

  openFindingFor(traceId: string, checkId: string): Finding | undefined {
    const r = this.db
      .prepare("SELECT * FROM findings WHERE trace_id = ? AND check_id = ? AND status IN ('raised', 'active') ORDER BY created_ms DESC LIMIT 1")
      .get(traceId, checkId) as Record<string, unknown> | undefined;
    return r ? this.findingFromRow(r) : undefined;
  }

  latestFindingFor(traceId: string, checkId: string): Finding | undefined {
    const r = this.db
      .prepare("SELECT * FROM findings WHERE trace_id = ? AND check_id = ? ORDER BY created_ms DESC LIMIT 1")
      .get(traceId, checkId) as Record<string, unknown> | undefined;
    return r ? this.findingFromRow(r) : undefined;
  }

  private refreshFindingCounts(traceId: string): void {
    this.db
      .prepare(
        `UPDATE runs SET
          finding_count = (SELECT COUNT(*) FROM findings WHERE trace_id = @t AND status NOT IN ('failed', 'dismissed')),
          open_finding_count = (SELECT COUNT(*) FROM findings WHERE trace_id = @t AND status IN ('raised', 'active'))
         WHERE trace_id = @t`,
      )
      .run({ t: traceId });
  }

  setFindingStatus(id: string, status: FindingStatus): Finding | undefined {
    return this.updateFinding(id, { status });
  }

  // -------------------------------------------------------------- decisions

  insertDecision(d: Omit<DecisionRow, "id" | "created_ms">): DecisionRow {
    const row: DecisionRow = { ...d, id: newId("dec"), created_ms: Date.now() };
    this.db
      .prepare(
        "INSERT INTO decisions (id, trace_id, check_id, span_id, probability, answer, backend, latency_ms, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(row.id, row.trace_id, row.check_id, row.span_id, row.probability, JSON.stringify(row.answer), row.backend, row.latency_ms, row.created_ms);
    return row;
  }

  decisionsForTrace(traceId: string): DecisionRow[] {
    return (this.db.prepare("SELECT * FROM decisions WHERE trace_id = ? ORDER BY created_ms").all(traceId) as Record<string, unknown>[]).map(
      (r) => ({ ...(r as unknown as DecisionRow), answer: json(r.answer as string, null) }),
    );
  }

  // ------------------------------------------------------------ explanations

  insertExplanation(e: Omit<Explanation, "id" | "created_ms">): Explanation {
    const row: Explanation = { ...e, id: newId("exp"), created_ms: Date.now() };
    this.db
      .prepare(
        `INSERT INTO explanations (id, target_type, target_id, trace_id, cause, fix, evidence_span_ids, grounding, model, created_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.target_type, row.target_id, row.trace_id, row.cause, row.fix, JSON.stringify(row.evidence_span_ids), row.grounding, row.model, row.created_ms);
    return row;
  }

  getExplanation(id: string): Explanation | undefined {
    const r = this.db.prepare("SELECT * FROM explanations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? { ...(r as unknown as Explanation), evidence_span_ids: json(r.evidence_span_ids as string, []) } : undefined;
  }

  explanationFor(targetType: "finding" | "run", targetId: string): Explanation | undefined {
    const r = this.db
      .prepare("SELECT * FROM explanations WHERE target_type = ? AND target_id = ? ORDER BY created_ms DESC LIMIT 1")
      .get(targetType, targetId) as Record<string, unknown> | undefined;
    return r ? { ...(r as unknown as Explanation), evidence_span_ids: json(r.evidence_span_ids as string, []) } : undefined;
  }

  // ------------------------------------------------------------------- notes

  insertNote(n: Omit<Note, "id" | "created_ms" | "delivered_ms" | "delivered_span_id" | "replaced_by"> & { id?: string }): Note {
    const note: Note = {
      ...n,
      id: n.id ?? newId("note"),
      created_ms: Date.now(),
      delivered_ms: null,
      delivered_span_id: null,
      replaced_by: null,
    };
    this.db
      .prepare(
        `INSERT INTO notes (id, trace_id, finding_id, kind, text, status, created_ms, delivered_ms, delivered_span_id, replaced_by, checks)
         VALUES (@id, @trace_id, @finding_id, @kind, @text, @status, @created_ms, @delivered_ms, @delivered_span_id, @replaced_by, @checks)`,
      )
      .run({ ...note, checks: note.checks ? JSON.stringify(note.checks) : null });
    return note;
  }

  private noteFromRow(r: Record<string, unknown>): Note {
    return { ...(r as unknown as Note), checks: json(r.checks as string, null) };
  }

  getNote(id: string): Note | undefined {
    const r = this.db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.noteFromRow(r) : undefined;
  }

  notesForTrace(traceId: string, status?: NoteStatus): Note[] {
    const rows = status
      ? this.db.prepare("SELECT * FROM notes WHERE trace_id = ? AND status = ? ORDER BY created_ms").all(traceId, status)
      : this.db.prepare("SELECT * FROM notes WHERE trace_id = ? ORDER BY created_ms").all(traceId);
    return (rows as Record<string, unknown>[]).map((r) => this.noteFromRow(r));
  }

  updateNote(id: string, patch: Partial<Pick<Note, "status" | "delivered_ms" | "delivered_span_id" | "replaced_by" | "checks" | "text">>): void {
    const cur = this.getNote(id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    this.db
      .prepare(
        "UPDATE notes SET status = @status, delivered_ms = @delivered_ms, delivered_span_id = @delivered_span_id, replaced_by = @replaced_by, checks = @checks, text = @text WHERE id = @id",
      )
      .run({ ...next, checks: next.checks ? JSON.stringify(next.checks) : null });
  }

  // --------------------------------------------------------------- summaries

  setSummary(traceId: string, text: string, model: string | null): void {
    this.db
      .prepare("INSERT OR REPLACE INTO summaries (trace_id, text, model, created_ms) VALUES (?, ?, ?, ?)")
      .run(traceId, text, model, Date.now());
  }

  getSummary(traceId: string): { text: string; model: string | null; created_ms: number } | undefined {
    return this.db.prepare("SELECT text, model, created_ms FROM summaries WHERE trace_id = ?").get(traceId) as
      | { text: string; model: string | null; created_ms: number }
      | undefined;
  }

  // ------------------------------------------------------------------- plans

  insertPlan(p: Omit<PlanRow, "id" | "created_ms">): PlanRow {
    const row: PlanRow = { ...p, id: newId("plan"), created_ms: Date.now() };
    this.db
      .prepare("INSERT INTO plans (id, workflow, created_ms, created_by, model, rationale, check_ids, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, row.workflow, row.created_ms, row.created_by, row.model, row.rationale, JSON.stringify(row.check_ids), JSON.stringify({ params: row.params, tools: row.tools }));
    return row;
  }

  private planFromRow(r: Record<string, unknown>): PlanRow {
    const body = json<{ params?: PlanRow["params"]; tools?: string[] }>(r.body as string, {});
    return {
      ...(r as unknown as PlanRow),
      check_ids: json(r.check_ids as string, []),
      params: body.params ?? {},
      tools: body.tools ?? [],
    };
  }

  latestPlan(workflow: string): PlanRow | undefined {
    const r = this.db.prepare("SELECT * FROM plans WHERE workflow = ? ORDER BY created_ms DESC LIMIT 1").get(workflow) as
      | Record<string, unknown>
      | undefined;
    return r ? this.planFromRow(r) : undefined;
  }

  getPlan(id: string): PlanRow | undefined {
    const r = this.db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.planFromRow(r) : undefined;
  }

  listPlans(limit = 50): PlanRow[] {
    return (this.db.prepare("SELECT * FROM plans ORDER BY created_ms DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map((r) => this.planFromRow(r));
  }

  // ------------------------------------------------------------------ checks

  upsertCheckRow(c: { id: string; kind: string; source: string; path: string | null; body: string; enabled?: boolean }): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO checks (id, kind, source, path, body, enabled, created_ms, updated_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, source = excluded.source, path = excluded.path, body = excluded.body, updated_ms = excluded.updated_ms`,
      )
      .run(c.id, c.kind, c.source, c.path, c.body, c.enabled === false ? 0 : 1, now, now);
  }

  checkStats(): Record<string, { hits: number; dismissed: number; confirmed: number; enabled: number }> {
    const rows = this.db.prepare("SELECT id, hits, dismissed, confirmed, enabled FROM checks").all() as {
      id: string;
      hits: number;
      dismissed: number;
      confirmed: number;
      enabled: number;
    }[];
    return Object.fromEntries(rows.map((r) => [r.id, r]));
  }

  setCheckEnabled(id: string, enabled: boolean): void {
    this.db.prepare("UPDATE checks SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  }

  bumpConfirmed(checkId: string): void {
    this.db.prepare("UPDATE checks SET confirmed = confirmed + 1 WHERE id = ?").run(checkId);
  }

  // ------------------------------------------------------------- annotations

  insertAnnotation(a: Omit<Annotation, "id" | "created_ms">): Annotation {
    const row: Annotation = { ...a, id: newId("ann"), created_ms: Date.now() };
    this.db
      .prepare("INSERT INTO annotations (id, trace_id, span_id, label, text, author, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, row.trace_id, row.span_id, row.label, row.text, row.author, row.created_ms);
    return row;
  }

  annotationsForTrace(traceId: string): Annotation[] {
    return this.db.prepare("SELECT * FROM annotations WHERE trace_id = ? ORDER BY created_ms").all(traceId) as Annotation[];
  }

  // ---------------------------------------------------------------- forwards

  insertForward(f: Omit<ForwardRow, "id" | "created_ms">): ForwardRow {
    const row: ForwardRow = { ...f, id: newId("fwd"), created_ms: Date.now() };
    this.db
      .prepare(
        `INSERT INTO forwards (id, trace_ids, endpoint, status, http_status, span_count, bytes, redactions, error, initiated_by, created_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, JSON.stringify(row.trace_ids), row.endpoint, row.status, row.http_status, row.span_count, row.bytes, row.redactions, row.error, row.initiated_by, row.created_ms);
    return row;
  }

  listForwards(limit = 50): ForwardRow[] {
    return (this.db.prepare("SELECT * FROM forwards ORDER BY created_ms DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map((r) => ({
      ...(r as unknown as ForwardRow),
      trace_ids: json(r.trace_ids as string, []),
    }));
  }

  forwardedTraceIds(): Set<string> {
    const rows = this.db.prepare("SELECT trace_ids FROM forwards WHERE status = 'ok'").all() as { trace_ids: string }[];
    const out = new Set<string>();
    for (const r of rows) for (const t of json<string[]>(r.trace_ids, [])) out.add(t);
    return out;
  }

  // ----------------------------------------------------------------- uploads

  insertUpload(u: { id: string; sha256: string | null; mime_type: string | null; byte_length: number | null; purpose: string | null; state: string }): void {
    this.db
      .prepare("INSERT OR REPLACE INTO uploads (id, sha256, mime_type, byte_length, purpose, state, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(u.id, u.sha256, u.mime_type, u.byte_length, u.purpose, u.state, Date.now());
  }

  getUpload(id: string): { id: string; sha256: string | null; mime_type: string | null; byte_length: number | null; purpose: string | null; state: string; blob_sha: string | null } | undefined {
    return this.db.prepare("SELECT * FROM uploads WHERE id = ?").get(id) as never;
  }

  setUploadState(id: string, state: string, blobSha?: string): void {
    this.db.prepare("UPDATE uploads SET state = ?, blob_sha = COALESCE(?, blob_sha) WHERE id = ?").run(state, blobSha ?? null, id);
  }

  // --------------------------------------------------------------- retention

  /** Deletes the oldest unpinned runs past the age or size limit. Returns how many runs were removed. */
  sweep(maxAgeDays: number, maxBytes: number): number {
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    let removed = 0;
    const old = this.db
      .prepare("SELECT trace_id FROM runs WHERE pinned = 0 AND COALESCE(ended_ms, received_ms) < ?")
      .all(cutoff) as { trace_id: string }[];
    for (const r of old) {
      this.deleteRun(r.trace_id);
      removed++;
    }
    let size = this.diskBytes();
    while (size > maxBytes) {
      const oldest = this.db
        .prepare("SELECT trace_id FROM runs WHERE pinned = 0 ORDER BY COALESCE(ended_ms, received_ms) ASC LIMIT 20")
        .all() as { trace_id: string }[];
      if (!oldest.length) break;
      for (const r of oldest) {
        this.deleteRun(r.trace_id);
        removed++;
      }
      size = this.diskBytes();
    }
    if (removed) this.db.pragma("wal_checkpoint(TRUNCATE)");
    return removed;
  }

  diskBytes(): number {
    let total = 0;
    for (const f of ["bolts.db", "bolts.db-wal"]) {
      try {
        total += fs.statSync(path.join(this.dir, f)).size;
      } catch {
        /* missing */
      }
    }
    return total + this.blobs.size();
  }

  deleteRun(traceId: string): void {
    const blobRows = this.db.prepare("SELECT blobs FROM spans WHERE trace_id = ? AND blobs IS NOT NULL").all(traceId) as { blobs: string }[];
    const tx = this.db.transaction(() => {
      for (const t of ["spans", "span_fts", "logs", "findings", "decisions", "explanations", "notes", "summaries", "annotations"]) {
        this.db.prepare(`DELETE FROM ${t} WHERE trace_id = ?`).run(traceId);
      }
      this.db.prepare("DELETE FROM runs WHERE trace_id = ?").run(traceId);
    });
    tx();
    for (const r of blobRows) {
      for (const sha of json<string[]>(r.blobs, [])) {
        const still = this.db.prepare("SELECT 1 FROM spans WHERE blobs LIKE ? LIMIT 1").get(`%${sha}%`);
        if (!still) this.blobs.delete(sha);
      }
    }
  }

  stats(): { runs: number; spans: number; findings: number; bytes: number } {
    const n = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      runs: n("SELECT COUNT(*) AS n FROM runs WHERE doctor = 0"),
      spans: n("SELECT COUNT(*) AS n FROM spans"),
      findings: n("SELECT COUNT(*) AS n FROM findings WHERE status NOT IN ('failed', 'dismissed')"),
      bytes: this.diskBytes(),
    };
  }

  getMeta(key: string): string | undefined {
    return (this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
  }
}
