import { spawn } from "node:child_process";
import { z } from "zod";
import type { Bolts } from "../core.js";
import { runDetail, runSummary, spanDetail, checkFromInput } from "../server/api.js";
import { draftCheckFromConcern, askRuns } from "../engine/assist.js";
import { checkToYaml } from "../checks/registry.js";
import { newId } from "../util/ids.js";
import type { Plain } from "../otlp/types.js";

/**
 * Tools for coding agents. Reads need no model. explain_run and ask use the local LLM and
 * are checked by the decision model; judge uses the decision model alone. The local LLM does
 * the heavy reading so the coding agent spends fewer tokens.
 */

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: S;
  readOnly?: boolean;
  run: (bolts: Bolts, args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

function def<S extends z.ZodRawShape>(d: ToolDef<S>): ToolDef<S> {
  return d;
}

function clip(s: string | null | undefined, n: number): string | null {
  if (s === null || s === undefined) return null;
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function resolveTrace(bolts: Bolts, id: string | undefined): string {
  if (id) {
    const exact = bolts.store.getRun(id);
    if (exact) return exact.trace_id;
    const row = bolts.store.db.prepare("SELECT trace_id FROM runs WHERE trace_id LIKE ? ORDER BY started_ms DESC LIMIT 1").get(`${id.toLowerCase()}%`) as { trace_id: string } | undefined;
    if (row) return row.trace_id;
    throw new Error(`no run with id ${id}`);
  }
  if (bolts.focus) return bolts.focus.trace_id;
  const latest = bolts.store.listRuns({ limit: 1 })[0];
  if (!latest) throw new Error("Bolts has no runs yet. Point NEATLOGS_ENDPOINT at http://localhost:4100 and run your agent.");
  return latest.trace_id;
}

function resolveSpan(bolts: Bolts, traceId: string, spanId: string): string {
  const spans = bolts.store.getSpans(traceId, true);
  const hit = spans.find((s) => s.span_id === spanId) ?? spans.find((s) => s.span_id.startsWith(spanId.toLowerCase()));
  if (!hit) throw new Error(`no span ${spanId} in run ${traceId}`);
  return hit.span_id;
}

/** A small JSONPath subset: $, .key, ['key'], [index], [*]. */
export function jsonPath(value: unknown, path: string): unknown {
  if (!path || path === "$") return value;
  const tokens: (string | number | "*")[] = [];
  const re = /\.([A-Za-z_$][\w$-]*)|\[(\d+)\]|\['([^']*)'\]|\["([^"]*)"\]|\[\*\]|\.\*/g;
  const body = path.startsWith("$") ? path.slice(1) : path.startsWith(".") || path.startsWith("[") ? path : `.${path}`;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(body))) {
    if (m.index !== consumed) throw new Error(`unsupported JSONPath near "${body.slice(consumed)}"`);
    consumed = re.lastIndex;
    if (m[1] !== undefined) tokens.push(m[1]);
    else if (m[2] !== undefined) tokens.push(Number(m[2]));
    else if (m[3] !== undefined) tokens.push(m[3]);
    else if (m[4] !== undefined) tokens.push(m[4]);
    else tokens.push("*");
  }
  if (consumed !== body.length) throw new Error(`unsupported JSONPath near "${body.slice(consumed)}"`);
  let cur: unknown[] = [value];
  for (const t of tokens) {
    const next: unknown[] = [];
    for (const v of cur) {
      if (v === null || typeof v !== "object") continue;
      if (t === "*") next.push(...(Array.isArray(v) ? v : Object.values(v)));
      else if (typeof t === "number" && Array.isArray(v)) next.push(v[t]);
      else if (typeof t === "string" && !Array.isArray(v)) next.push((v as Record<string, unknown>)[t]);
    }
    cur = next.filter((x) => x !== undefined);
  }
  return tokens.includes("*") ? cur : cur[0];
}

function outline(bolts: Bolts, traceId: string, maxSpans: number) {
  const d = runDetail(bolts, traceId)!;
  const findingsBySpan = new Map<string, string[]>();
  for (const f of d.findings) {
    if (f.status === "dismissed") continue;
    for (const sid of f.evidence_span_ids) {
      const list = findingsBySpan.get(sid) ?? [];
      list.push(`${f.check_id}${f.probability !== null ? ` p=${f.probability.toFixed(2)}` : ""} [${f.status}]`);
      findingsBySpan.set(sid, list);
    }
  }
  const children = new Map<string | null, typeof d.spans>();
  const ids = new Set(d.spans.map((s) => s.span_id));
  for (const s of d.spans) {
    const parent = s.parent_span_id && ids.has(s.parent_span_id) ? s.parent_span_id : null;
    const list = children.get(parent) ?? [];
    list.push(s);
    children.set(parent, list);
  }
  const lines: string[] = [];
  let count = 0;
  const walk = (parent: string | null, depth: number) => {
    for (const s of children.get(parent) ?? []) {
      if (count++ >= maxSpans) return;
      const bits = [
        `${"  ".repeat(depth)}${s.span_id.slice(0, 8)} ${s.span_kind} ${s.tool_name ?? s.name}`,
        s.status_code === 2 ? `ERROR(${clip(s.error, 80)})` : s.status_code === 1 ? "ok" : "",
        s.tool_result && s.tool_result !== "success" ? `result=${s.tool_result}` : "",
        s.total_tokens ? `${s.total_tokens}tok` : "",
        `${Math.round(s.duration_ms)}ms`,
      ].filter(Boolean);
      lines.push(bits.join(" "));
      if (s.input_preview) lines.push(`${"  ".repeat(depth + 1)}in: ${clip(s.input_preview.replace(/\n/g, " ⏎ "), 160)}`);
      if (s.output_preview) lines.push(`${"  ".repeat(depth + 1)}out: ${clip(s.output_preview.replace(/\n/g, " ⏎ "), 160)}`);
      for (const f of findingsBySpan.get(s.span_id) ?? []) lines.push(`${"  ".repeat(depth + 1)}⚑ ${f}`);
      walk(s.span_id, depth + 1);
    }
  };
  walk(null, 0);
  return {
    run: {
      trace_id: d.run.trace_id,
      workflow: d.run.workflow,
      status: d.run.status,
      session_id: d.run.session_id,
      started: d.run.started_ms ? new Date(d.run.started_ms).toISOString() : null,
      duration_ms: d.run.duration_ms,
      llm_calls: d.run.llm_calls,
      tool_calls: d.run.tool_calls,
      total_tokens: d.run.total_tokens,
      summary: d.summary?.text ?? null,
    },
    outline: lines.join("\n") + (count > maxSpans ? `\n… ${d.spans.length - maxSpans} more spans (raise max_spans)` : ""),
    findings: d.findings
      .filter((f) => f.status !== "dismissed")
      .map((f) => ({ id: f.id, check: f.check_id, title: f.title, status: f.status, probability: f.probability, evidence_span_ids: f.evidence_span_ids.map((x) => x.slice(0, 8)) })),
    notes_sent: d.notes.filter((n) => n.status === "delivered").map((n) => ({ text: n.text, kind: n.kind })),
  };
}

export const TOOLS = [
  def({
    name: "get_current_run",
    title: "Current run",
    description: "The run in focus in the Bolts app (or the latest run), with its outline, findings and the selected span.",
    input: { max_spans: z.number().int().min(1).max(500).optional().describe("Most spans to include in the outline (default 80)") },
    readOnly: true,
    run: async (bolts, a) => {
      const traceId = resolveTrace(bolts, undefined);
      const o = outline(bolts, traceId, a.max_spans ?? 80);
      const span = bolts.focus?.trace_id === traceId && bolts.focus.span_id ? spanDetail(bolts, traceId, bolts.focus.span_id) : null;
      return { ...o, selected_span: span ? { span_id: span.span_id, name: span.name, kind: span.kind, input: span.view.input, output: span.view.output, error: span.view.error ?? null } : null };
    },
  }),
  def({
    name: "search_runs",
    title: "Search runs",
    description: "Find local agent runs by workflow, status, findings, time or text in span inputs and outputs.",
    input: {
      workflow: z.string().optional(),
      project: z.string().optional(),
      status: z.enum(["running", "ok", "error", "interrupted"]).optional(),
      has_finding: z.boolean().optional(),
      text: z.string().optional().describe("Full-text search over span names, tool names, inputs and outputs"),
      since_minutes: z.number().optional().describe("Only runs that started in the last N minutes"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    readOnly: true,
    run: async (bolts, a) => {
      const runs = bolts.store.listRuns({
        workflow: a.workflow,
        project: a.project,
        status: a.status,
        hasFinding: a.has_finding,
        text: a.text,
        sinceMs: a.since_minutes ? Date.now() - a.since_minutes * 60_000 : undefined,
        limit: a.limit ?? 20,
      });
      return {
        runs: runs.map((r) => {
          const s = runSummary(bolts, r);
          return {
            trace_id: r.trace_id,
            workflow: r.workflow,
            status: r.status,
            started: r.started_ms ? new Date(r.started_ms).toISOString() : null,
            duration_ms: s.duration_ms,
            spans: r.span_count,
            findings: r.finding_count,
            open_findings: r.open_finding_count,
            input: clip(r.input_preview, 160),
            summary: s.summary,
          };
        }),
      };
    },
  }),
  def({
    name: "get_run_outline",
    title: "Run outline",
    description: "Span tree for one run: kind, status, tokens, duration and input/output previews, with findings inline. Span ids are shortened to 8 characters; any unique prefix works in other tools.",
    input: {
      trace_id: z.string().optional().describe("Run (trace) id or prefix; defaults to the run in focus or the latest run"),
      max_spans: z.number().int().min(1).max(1000).optional(),
    },
    readOnly: true,
    run: async (bolts, a) => outline(bolts, resolveTrace(bolts, a.trace_id), a.max_spans ?? 150),
  }),
  def({
    name: "get_span",
    title: "Span detail",
    description: "One span's input, output, error and attributes. Use path (JSONPath subset like $.input[0].content) to select part of it, and offset/limit to page long values.",
    input: {
      trace_id: z.string().optional(),
      span_id: z.string().describe("Span id or unique prefix"),
      path: z.string().optional().describe("JSONPath into {input, output, error, attributes, events, resource}"),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(100).max(50000).optional().describe("Characters to return (default 6000)"),
    },
    readOnly: true,
    run: async (bolts, a) => {
      const traceId = resolveTrace(bolts, a.trace_id);
      const spanId = resolveSpan(bolts, traceId, a.span_id);
      const d = spanDetail(bolts, traceId, spanId)!;
      const doc = { name: d.name, kind: d.kind, status: d.status, input: d.view.input ?? null, output: d.view.output ?? null, error: d.view.error ?? null, attributes: d.attributes, events: d.events, resource: d.resource };
      const selected = a.path ? jsonPath(doc, a.path) : doc;
      const text = typeof selected === "string" ? selected : JSON.stringify(selected, null, 1);
      const offset = a.offset ?? 0;
      const limit = a.limit ?? 6000;
      return { trace_id: traceId, span_id: spanId, path: a.path ?? "$", total_chars: text.length, offset, value: text.slice(offset, offset + limit), more: offset + limit < text.length };
    },
  }),
  def({
    name: "list_findings",
    title: "List findings",
    description: "Problems Bolts found, with probabilities, evidence span ids and explanations when the local LLM investigated.",
    input: {
      trace_id: z.string().optional().describe("One run; omit for recent findings across runs"),
      status: z.enum(["raised", "active", "resolved", "dismissed", "failed"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    readOnly: true,
    run: async (bolts, a) => {
      const traceId = a.trace_id ? resolveTrace(bolts, a.trace_id) : undefined;
      const findings = bolts.store.listFindings({ traceId, status: a.status, limit: a.limit ?? 50 });
      return {
        findings: findings.map((f) => {
          const exp = f.explanation_id ? bolts.store.getExplanation(f.explanation_id) : undefined;
          return {
            id: f.id,
            trace_id: f.trace_id,
            check: f.check_id,
            title: f.title,
            status: f.status,
            probability: f.probability,
            triage_score: f.triage_score,
            evidence_span_ids: f.evidence_span_ids,
            explanation: exp ? { cause: exp.cause, fix: exp.fix, grounding: exp.grounding } : null,
            details: f.detail,
          };
        }),
      };
    },
  }),
  def({
    name: "explain_run",
    title: "Explain run",
    description: "The local LLM reads a run and returns the likely cause of a problem, the spans that show it and a suggested fix. The decision model scores how well the evidence supports it (grounding 0–1).",
    input: { trace_id: z.string().optional(), refresh: z.boolean().optional().describe("Ignore a cached explanation") },
    run: async (bolts, a) => {
      if (!bolts.engine) throw new Error("engine not running");
      const traceId = resolveTrace(bolts, a.trace_id);
      const exp = await bolts.engine.explainRun(traceId, { force: a.refresh });
      if (!exp) return { trace_id: traceId, explanation: null, reason: "The local LLM could not explain this run." };
      return { trace_id: traceId, cause: exp.cause, fix: exp.fix, evidence_span_ids: exp.evidence_span_ids, grounding: exp.grounding, model: exp.model };
    },
  }),
  def({
    name: "ask",
    title: "Ask about runs",
    description: "Ask a plain-language question over local runs (or one run). The local LLM answers from retrieved spans and cites span ids.",
    input: { question: z.string().min(3), trace_id: z.string().optional() },
    run: async (bolts, a) => askRuns(bolts, a.question, { traceId: a.trace_id ? resolveTrace(bolts, a.trace_id) : undefined }),
  }),
  def({
    name: "judge",
    title: "Judge a question",
    description: "Probability that the answer to a yes/no question is yes, judged by the decision model over chosen spans of a run (or its recent spans).",
    input: {
      question: z.string().min(5),
      trace_id: z.string().optional(),
      span_ids: z.array(z.string()).optional().describe("Spans to judge (ids or prefixes); default is the run's recent spans"),
    },
    run: async (bolts, a) => {
      if (!bolts.engine) throw new Error("engine not running");
      const traceId = resolveTrace(bolts, a.trace_id);
      const r = await bolts.engine.judge(traceId, a.question, { spanIds: a.span_ids });
      return { trace_id: traceId, question: a.question, probability_yes: r.probability, evidence_span_ids: r.evidence_span_ids, backend: r.backend, model: r.model };
    },
  }),
  def({
    name: "create_check",
    title: "Create check",
    description:
      "Add a check. Give either `concern` (plain language; the local LLM writes the question) or `check` (YAML or JSON in Bolts check format). Set save=false to only draft it. Saved checks go to ~/.bolts/checks or a registered project directory.",
    input: {
      concern: z.string().optional(),
      check: z.string().optional().describe("YAML or JSON check definition"),
      workflow: z.string().optional(),
      save: z.boolean().optional(),
      dir: z.string().optional().describe("A registered project checks directory"),
    },
    run: async (bolts, a) => {
      let check;
      if (a.check) {
        const text = a.check.trim();
        const parsed = checkFromInput(text.startsWith("{") ? JSON.parse(text) : text);
        if (!parsed.check) throw new Error(parsed.error ?? "invalid check");
        check = parsed.check;
      } else if (a.concern) {
        check = await draftCheckFromConcern(bolts, a.concern, { workflow: a.workflow });
      } else throw new Error("give concern or check");
      if (a.save === false) return { saved: false, id: check.id, yaml: checkToYaml(check) };
      if (a.dir && !bolts.config.checkDirs.includes(a.dir)) throw new Error("dir must be a registered project checks directory (bolts init registers one)");
      const saved = bolts.checks.save(check, a.dir ? { dir: a.dir } : "user", "mcp");
      return { saved: true, id: saved.check.id, path: saved.path, yaml: checkToYaml(saved.check) };
    },
  }),
  def({
    name: "preview_check",
    title: "Preview check",
    description: "Run a check (by id, YAML or JSON) over recent finished runs without raising findings, and report how often it fires.",
    input: {
      id: z.string().optional(),
      check: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional().describe("Runs to check (default 50)"),
      workflow: z.string().optional(),
    },
    run: async (bolts, a) => {
      if (!bolts.engine) throw new Error("engine not running");
      let check;
      if (a.id) check = bolts.checks.get(a.id)?.check;
      else if (a.check) {
        const text = a.check.trim();
        check = checkFromInput(text.startsWith("{") ? JSON.parse(text) : text).check;
      }
      if (!check) throw new Error("check not found or invalid");
      const r = await bolts.engine.previewCheck(check, { limit: a.limit ?? 50, workflow: a.workflow });
      return { id: check.id, checked: r.checked, total: r.total, hits: r.hits.length, hit_rate: r.checked ? r.hits.length / r.checked : null, truncated: r.truncated, examples: r.hits.slice(0, 10) };
    },
  }),
  def({
    name: "annotate",
    title: "Annotate",
    description: "Mark a run or span as an issue, good, or add a note.",
    input: {
      trace_id: z.string().optional(),
      span_id: z.string().optional(),
      label: z.enum(["issue", "good", "note"]),
      text: z.string().optional(),
    },
    run: async (bolts, a) => {
      const traceId = resolveTrace(bolts, a.trace_id);
      const spanId = a.span_id ? resolveSpan(bolts, traceId, a.span_id) : null;
      const ann = bolts.store.insertAnnotation({ trace_id: traceId, span_id: spanId, label: a.label, text: a.text ?? null, author: "coding-agent" });
      bolts.bus.emit("activity", { trace_id: traceId, kind: "annotation", message: a.label });
      return ann;
    },
  }),
  def({
    name: "rerun",
    title: "Rerun agent",
    description: "Rerun the agent through the command the user registered for its project (bolts rerun add). Returns the exit code, the output tail and the runs it produced.",
    input: { project: z.string().optional().describe("Project (service.name); defaults to the latest run's project"), timeout_sec: z.number().int().min(5).max(900).optional() },
    run: async (bolts, a) => {
      const project = a.project ?? bolts.store.listRuns({ limit: 1 })[0]?.project ?? undefined;
      const reg = project ? bolts.config.rerun[project] : undefined;
      if (!project || !reg) {
        return { ran: false, reason: `No rerun command is registered${project ? ` for ${project}` : ""}. The user can add one with: bolts rerun add <project> "<command>"`, registered: Object.keys(bolts.config.rerun) };
      }
      const started = Date.now();
      const result = await new Promise<{ code: number | null; out: string }>((resolve) => {
        const child = spawn(reg.command, { shell: true, cwd: reg.cwd, env: { ...process.env, NEATLOGS_ENDPOINT: `http://localhost:${bolts.config.port}`, NEATLOGS_API_KEY: process.env.NEATLOGS_API_KEY ?? "bolts-local" } });
        let out = "";
        const keep = (b: Buffer) => {
          out = (out + b.toString()).slice(-8000);
        };
        child.stdout.on("data", keep);
        child.stderr.on("data", keep);
        const t = setTimeout(() => child.kill("SIGTERM"), (a.timeout_sec ?? 300) * 1000);
        child.on("close", (code) => {
          clearTimeout(t);
          resolve({ code, out });
        });
      });
      await new Promise((r) => setTimeout(r, 1500));
      const runs = bolts.store.listRuns({ project, sinceMs: started - 1000, limit: 20 });
      return { ran: true, project, command: reg.command, exit_code: result.code, output_tail: result.out.slice(-3000), runs: runs.map((r) => ({ trace_id: r.trace_id, status: r.status, findings: r.finding_count })) };
    },
  }),
  def({
    name: "push_to_cloud",
    title: "Push to Neatlogs Cloud",
    description: "Ask to send runs to Neatlogs Cloud. Nothing is sent until the user confirms in the Bolts app; call again with push_id to check the result.",
    input: { trace_ids: z.array(z.string()).optional(), push_id: z.string().optional() },
    run: async (bolts, a) => {
      if (a.push_id) {
        const p = bolts.pushes.get(a.push_id);
        if (!p) throw new Error("unknown push_id");
        return { ...p, app_url: bolts.config.cloud.appUrl };
      }
      const ids = (a.trace_ids?.length ? a.trace_ids : [resolveTrace(bolts, undefined)]).map((t) => resolveTrace(bolts, t));
      const id = newId("push");
      bolts.pushes.set(id, { id, trace_ids: ids, requested_by: "coding-agent", created_ms: Date.now(), status: "pending" });
      bolts.bus.emit("activity", { kind: "push-request", message: id });
      return { push_id: id, status: "awaiting_confirmation", confirm_in_app: `http://localhost:${bolts.config.port}/#/push/${id}`, trace_ids: ids };
    },
  }),
] as ToolDef[];

export function toolResultText(value: unknown): string {
  return JSON.stringify(value as Plain, null, 1);
}
