import os from "node:os";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Bolt } from "../core.js";
import { kvToPlain } from "../otlp/types.js";
import { buildView } from "../semantics/view.js";
import { hardwareTier } from "../models/llm.js";
import { projectSettings, type SteeringMode } from "../config.js";
import { getCloudKey, setCloudKey, deleteCloudKey, getSecret } from "../relay/keychain.js";
import { mountModelsApi } from "./api-models.js";
import { mountChecksApi } from "./api-checks.js";
import { mountInsightsApi } from "./api-insights.js";
import { err, body } from "./util.js";
import { askRuns } from "../engine/assist.js";
import { loadTrace } from "../engine/trace.js";
import type { RunRow } from "../types.js";
import { VERSION } from "../version.js";

export { checkFromInput } from "./api-checks.js";

const STEERING_MODES: SteeringMode[] = ["off", "advisory", "gate", "self-check"];

export function runSummary(bolts: Bolt, r: RunRow) {
  const summary = bolts.store.getSummary(r.trace_id);
  return {
    ...r,
    duration_ms: r.ended_ms && r.started_ms ? r.ended_ms - r.started_ms : null,
    summary: summary?.text ?? null,
    top_finding: r.open_finding_count > 0 ? bolts.store.topOpenFinding(r.trace_id) : null,
    steering: bolts.steering.mode(r.project),
  };
}

export function runDetail(bolts: Bolt, traceId: string) {
  const run = bolts.store.getRun(traceId);
  if (!run) return undefined;
  const spans = bolts.store.getSpans(traceId, false);
  const decisions = bolts.store.decisionsForTrace(traceId);
  const toolLabels: Record<string, string> = {};
  for (const d of decisions) {
    if (d.check_id === "neatbolt.tool-result" && d.span_id) toolLabels[d.span_id] = String((d.answer as { choice?: string })?.choice ?? "");
  }
  const findings = bolts.store.findingsForTrace(traceId).map((f) => ({
    ...f,
    explanation: f.explanation_id ? bolts.store.getExplanation(f.explanation_id) ?? null : null,
    precision: bolts.checks.precision(f.check_id),
  }));
  const plan = run.plan_id ? bolts.store.getPlan(run.plan_id) ?? null : null;
  return {
    run: runSummary(bolts, run),
    spans: spans.map((s) => ({ ...s, tool_result: toolLabels[s.span_id] ?? null })),
    findings,
    notes: bolts.store.notesForTrace(traceId),
    explanation: bolts.store.explanationFor("run", traceId) ?? null,
    summary: bolts.store.getSummary(traceId) ?? null,
    annotations: bolts.store.annotationsForTrace(traceId),
    plan,
    decisions: decisions.filter((d) => d.check_id !== "neatbolt.tool-result"),
    logs: bolts.store.logsForTrace(traceId),
    forwarded: bolts.store.forwardedTraceIds().has(traceId),
  };
}

export function spanDetail(bolts: Bolt, traceId: string, spanId: string) {
  const full = bolts.store.getOtlpSpan(traceId, spanId);
  if (!full) return undefined;
  const view = buildView(full.span, full.resource.attributes);
  return {
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: full.span.parentSpanId || null,
    name: full.span.name,
    kind: view.kind,
    status: full.span.status,
    start_ns: full.span.startTimeUnixNano,
    end_ns: full.span.endTimeUnixNano,
    view,
    attributes: kvToPlain(full.span.attributes),
    events: full.span.events.map((e) => ({ name: e.name, time_ns: e.timeUnixNano, attributes: kvToPlain(e.attributes) })),
    links: full.span.links,
    resource: kvToPlain(full.resource.attributes),
    scope: { name: full.scope.name, version: full.scope.version ?? null },
  };
}

function projects(bolts: Bolt) {
  const rows = bolts.store.db
    .prepare("SELECT project, COUNT(*) AS runs, MAX(started_ms) AS last_ms, SUM(finding_count > 0) AS with_findings FROM runs WHERE doctor = 0 GROUP BY project ORDER BY last_ms DESC")
    .all() as { project: string; runs: number; last_ms: number; with_findings: number }[];
  const names = new Set(rows.map((r) => r.project));
  for (const p of Object.keys(bolts.config.projects)) names.add(p);
  return [...names].map((name) => {
    const r = rows.find((x) => x.project === name);
    return { project: name, runs: r?.runs ?? 0, last_ms: r?.last_ms ?? null, with_findings: r?.with_findings ?? 0, settings: projectSettings(bolts.config, name) };
  });
}

/** Cloud endpoints Bolt will forward to. Anything else must be set in config.yaml by hand. */
function allowedEndpoint(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol === "https:" && (url.hostname === "neatlogs.com" || url.hostname.endsWith(".neatlogs.com"))) return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function mountApi(app: Hono, bolts: Bolt): void {
  const engine = bolts.engine;
  mountModelsApi(app, bolts);
  mountChecksApi(app, bolts);
  mountInsightsApi(app, bolts);

  app.get("/api/status", async (c) => {
    const status = engine ? await engine.status() : null;
    const tier = hardwareTier();
    return c.json({
      name: "neatbolt",
      version: VERSION,
      uptime_ms: Date.now() - bolts.startedMs,
      port: bolts.config.port,
      home: bolts.home,
      stats: bolts.store.stats(),
      engine: status,
      tier: { ...tier, platform: `${os.platform()} ${os.arch()}` },
      steering: { enabled: bolts.config.steering.enabled, hooks_connected: bolts.steering.listeners },
      mcp: { last_seen_ms: bolts.mcpSeenMs },
      cloud: { endpoint: bolts.relay.endpoint(), has_key: !!(await getCloudKey()) },
      classifier: {
        laya: bolts.laya.state,
        trust: Object.entries(bolts.decisions.trust.all())
          .map(([question, t]) => ({ question, n: t.n, agreement: t.n ? t.agree / t.n : null, trusted: bolts.decisions.trusted([{ name: question, type: "yes_no", ask: "" }]) }))
          .sort((a, b) => b.n - a.n),
        jev_cloud: { enabled: bolts.config.classifier.jevCloud.enabled, has_key: !!(await getSecret("jev-api-key")) },
      },
      check_errors: bolts.checks.errors,
      config: {
        llm: { baseUrl: bolts.config.llm.baseUrl, model: bolts.config.llm.model, enabled: bolts.config.llm.enabled, external: bolts.config.llm.external },
        classifier: { backend: bolts.config.classifier.backend, baseUrl: bolts.config.classifier.baseUrl, model: bolts.config.classifier.model },
        budgets: bolts.config.budgets,
        retention: bolts.config.retention,
      },
    });
  });

  // ------------------------------------------------------------------ runs

  app.get("/api/runs", (c) => {
    const q = c.req.query();
    const runs = bolts.store.listRuns({
      project: q.project || undefined,
      workflow: q.workflow || undefined,
      status: q.status || undefined,
      sessionId: q.session || undefined,
      hasFinding: q.has_finding === "1" || q.has_finding === "true",
      checkId: q.check || undefined,
      text: q.q || undefined,
      sinceMs: q.since ? Number(q.since) : undefined,
      limit: q.limit ? Number(q.limit) : 100,
      offset: q.offset ? Number(q.offset) : 0,
    });
    return c.json({ runs: runs.map((r) => runSummary(bolts, r)), total: bolts.store.countRuns() });
  });

  app.get("/api/runs/:traceId", (c) => {
    const d = runDetail(bolts, c.req.param("traceId"));
    return d ? c.json(d) : err(c, 404, "run not found");
  });

  app.get("/api/runs/:traceId/spans/:spanId", (c) => {
    const d = spanDetail(bolts, c.req.param("traceId"), c.req.param("spanId"));
    return d ? c.json(d) : err(c, 404, "span not found");
  });

  app.post("/api/runs/:traceId/pin", async (c) => {
    const b = await body<{ pinned?: boolean }>(c);
    bolts.store.setPinned(c.req.param("traceId"), b.pinned !== false);
    return c.json({ ok: true });
  });

  app.delete("/api/runs/:traceId", (c) => {
    bolts.store.deleteRun(c.req.param("traceId"));
    return c.json({ ok: true });
  });

  app.post("/api/runs/:traceId/explain", async (c) => {
    if (!engine) return err(c, 503, "engine not running");
    try {
      const exp = await engine.explainRun(c.req.param("traceId"), { force: true });
      return exp ? c.json(exp) : err(c, 422, "could not explain this run");
    } catch (e) {
      return err(c, 503, (e as Error).message);
    }
  });

  app.post("/api/runs/:traceId/recheck", async (c) => {
    if (!engine) return err(c, 503, "engine not running");
    void engine.recheck(c.req.param("traceId"));
    return c.json({ ok: true });
  });

  // -------------------------------------------------------------- findings

  app.get("/api/findings", (c) => {
    const q = c.req.query();
    return c.json({ findings: bolts.store.listFindings({ traceId: q.trace_id, status: q.status, checkId: q.check_id, limit: q.limit ? Number(q.limit) : 100 }) });
  });

  app.post("/api/findings/:id", async (c) => {
    const b = await body<{ status?: string }>(c);
    if (!b.status || !["dismissed", "active", "resolved", "raised"].includes(b.status)) return err(c, 400, "status must be dismissed, active, resolved or raised");
    const f = bolts.store.updateFinding(c.req.param("id"), { status: b.status as "dismissed" });
    if (!f) return err(c, 404, "finding not found");
    if (b.status === "dismissed" || b.status === "resolved") bolts.steering.withdraw(f.id);
    bolts.bus.emit("finding", f);
    return c.json(f);
  });

  app.post("/api/findings/:id/investigate", async (c) => {
    if (!engine) return err(c, 503, "engine not running");
    const f = bolts.store.getFinding(c.req.param("id"));
    if (!f) return err(c, 404, "finding not found");
    try {
      const exp = await engine.investigate(f.trace_id, f.id);
      return exp ? c.json(exp) : err(c, 422, "could not investigate this finding");
    } catch (e) {
      return err(c, 503, (e as Error).message);
    }
  });

  app.post("/api/annotations", async (c) => {
    const b = await body<{ trace_id?: string; span_id?: string; label?: string; text?: string; author?: string }>(c);
    if (!b.trace_id || !b.label || !["issue", "good", "note"].includes(b.label)) return err(c, 400, "trace_id and label (issue, good or note) are required");
    const a = bolts.store.insertAnnotation({ trace_id: b.trace_id, span_id: b.span_id ?? null, label: b.label as "issue", text: b.text ?? null, author: b.author ?? "user" });
    bolts.bus.emit("activity", { trace_id: b.trace_id, kind: "annotation", message: a.label });
    return c.json(a);
  });

  // ------------------------------------------------------------ settings

  app.get("/api/projects", (c) => c.json({ projects: projects(bolts) }));

  app.post("/api/settings", async (c) => {
    const b = await body<{
      project?: string;
      steering?: SteeringMode;
      forward?: boolean;
      steering_enabled?: boolean;
      llm_model?: string;
      llm_base_url?: string;
      classifier_backend?: "auto" | "laya" | "jev" | "jev-cloud" | "llm";
      jev_cloud_enabled?: boolean;
      laya_enabled?: boolean;
      classifier_url?: string;
      cloud_endpoint?: string;
      redact_patterns?: string[];
      check_dir?: string;
    }>(c);
    if (b.project) {
      const cur = bolts.config.projects[b.project] ?? {};
      if (b.steering !== undefined) {
        if (!STEERING_MODES.includes(b.steering)) return err(c, 400, `steering must be one of ${STEERING_MODES.join(", ")}`);
        bolts.steering.setMode(b.project, b.steering);
      }
      if (b.forward !== undefined) bolts.config.projects[b.project] = { ...cur, ...bolts.config.projects[b.project], forward: !!b.forward };
    }
    if (b.steering_enabled !== undefined) bolts.config.steering.enabled = !!b.steering_enabled;
    if (b.llm_model) bolts.config.llm.model = b.llm_model;
    if (b.llm_base_url) bolts.config.llm.baseUrl = b.llm_base_url;
    if (b.classifier_backend) {
      if (!["auto", "laya", "jev", "jev-cloud", "llm"].includes(b.classifier_backend)) return err(c, 400, "classifier_backend must be auto, laya, jev, jev-cloud or llm");
      bolts.config.classifier.backend = b.classifier_backend;
    }
    if (b.classifier_url) bolts.config.classifier.baseUrl = b.classifier_url;
    if (b.jev_cloud_enabled !== undefined) bolts.config.classifier.jevCloud.enabled = !!b.jev_cloud_enabled;
    if (b.laya_enabled !== undefined) {
      bolts.config.classifier.laya.enabled = !!b.laya_enabled;
      if (b.laya_enabled) bolts.startModels();
      else bolts.laya.stop();
    }
    bolts.decisions.reset();
    if (b.cloud_endpoint) {
      if (!allowedEndpoint(b.cloud_endpoint)) return err(c, 400, "cloud endpoint must be an https://*.neatlogs.com URL (or localhost for testing)");
      bolts.config.cloud.endpoint = b.cloud_endpoint;
    }
    if (b.redact_patterns) {
      for (const p of b.redact_patterns) {
        try {
          new RegExp(p);
        } catch {
          return err(c, 400, `invalid pattern: ${p}`);
        }
      }
      bolts.config.cloud.redactPatterns = b.redact_patterns;
    }
    if (b.check_dir && !bolts.config.checkDirs.includes(b.check_dir)) {
      bolts.config.checkDirs.push(b.check_dir);
      bolts.checks.reload();
    }
    bolts.saveConfig();
    if (b.llm_model || b.llm_base_url) await bolts.llm.probe(true);
    bolts.bus.emit("settings", { project: b.project });
    return c.json({ ok: true, projects: projects(bolts) });
  });

  // --------------------------------------------------------------- cloud

  app.post("/api/cloud/key", async (c) => {
    const b = await body<{ key?: string }>(c);
    if (!b.key || b.key.length < 8) return err(c, 400, "paste the API key from app.neatlogs.com");
    const where = await setCloudKey(b.key.trim());
    return c.json({ ok: true, stored_in: where });
  });

  app.delete("/api/cloud/key", async (c) => {
    await deleteCloudKey();
    return c.json({ ok: true });
  });

  app.post("/api/cloud/preview", async (c) => {
    const b = await body<{ trace_ids?: string[] }>(c);
    if (!b.trace_ids?.length) return err(c, 400, "trace_ids required");
    return c.json(await bolts.relay.preview(b.trace_ids));
  });

  app.post("/api/cloud/forward", async (c) => {
    const b = await body<{ trace_ids?: string[] }>(c);
    if (!b.trace_ids?.length) return err(c, 400, "trace_ids required");
    const row = await bolts.relay.forward(b.trace_ids, "user");
    bolts.bus.emit("activity", { kind: "forward", message: row.status });
    return c.json(row, row.status === "ok" ? 200 : 502);
  });

  app.get("/api/forwards", (c) => c.json({ forwards: bolts.store.listForwards(100) }));

  // ------------------------------------------------------------- ask/search

  app.get("/api/search", (c) => c.json({ hits: bolts.store.searchSpans(c.req.query("q") ?? "", 50) }));

  app.post("/api/ask", async (c) => {
    const b = await body<{ question?: string; trace_id?: string }>(c);
    if (!b.question) return err(c, 400, "question required");
    try {
      return c.json(await askRuns(bolts, b.question, { traceId: b.trace_id }));
    } catch (e) {
      return err(c, 503, (e as Error).message);
    }
  });

  // ------------------------------------------------------- live app events

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const queue: { event: string; data: string }[] = [];
      let wake: (() => void) | undefined;
      const off = bolts.bus.onAny(({ event, payload }) => {
        const p = payload as Record<string, unknown>;
        const data: Record<string, unknown> = { trace_id: p.trace_id ?? p.traceId ?? null };
        if (event === "trace") {
          const u = payload as { traceId: string; runCreated: boolean; rootEnded: boolean };
          data.created = u.runCreated;
          data.ended = u.rootEnded;
        }
        if (event === "finding" || event === "note") data.id = p.id;
        if (event === "settings") data.project = p.project ?? null;
        queue.push({ event, data: JSON.stringify(data) });
        wake?.();
      });
      stream.onAbort(() => off());
      await stream.writeSSE({ event: "hello", data: JSON.stringify({ version: VERSION }) });
      while (!stream.aborted) {
        if (!queue.length) {
          await Promise.race([new Promise<void>((r) => (wake = r)), stream.sleep(15000)]);
          wake = undefined;
        }
        if (!queue.length) {
          await stream.writeSSE({ event: "ping", data: "{}" });
          continue;
        }
        for (const m of queue.splice(0, 200)) await stream.writeSSE(m);
      }
      off();
    }),
  );

  // -------------------------------------------------------------- steering

  app.get("/api/steer/stream", (c) =>
    streamSSE(c, async (stream) => {
      const queue: { event: string; data: string }[] = [];
      let wake: (() => void) | undefined;
      const off = bolts.steering.subscribe((e) => {
        queue.push({ event: e.event, data: JSON.stringify(e.data) });
        wake?.();
      });
      stream.onAbort(() => off());
      await stream.writeSSE({ event: "hello", data: JSON.stringify({ version: VERSION, enabled: bolts.config.steering.enabled }) });
      while (!stream.aborted) {
        if (!queue.length) {
          await Promise.race([new Promise<void>((r) => (wake = r)), stream.sleep(15000)]);
          wake = undefined;
        }
        if (!queue.length) {
          await stream.writeSSE({ event: "ping", data: "{}" });
          continue;
        }
        for (const m of queue.splice(0, 200)) await stream.writeSSE(m);
      }
      off();
    }),
  );

  app.get("/api/steer/mode", (c) => {
    const project = c.req.query("project");
    return c.json({ mode: bolts.steering.mode(project), enabled: bolts.config.steering.enabled });
  });

  app.post("/api/steer/claim", async (c) => {
    const b = await body<{ trace_id?: string; span_id?: string; gate_ms?: number; project?: string }>(c);
    if (!b.trace_id) return err(c, 400, "trace_id required");
    const run = bolts.store.getRun(b.trace_id);
    // Before any span of this run has arrived Bolt cannot know its project; say so, so the
    // hook flushes the SDK and asks again instead of caching "off".
    if (!run && !b.project) return c.json({ mode: "unknown", known: false, note: null });
    const mode = bolts.steering.mode(run?.project ?? b.project);
    const wait = mode === "gate" ? (b.gate_ms ?? bolts.config.steering.gateWaitMs) : 0;
    const note = wait > 0 ? await bolts.steering.gate(b.trace_id, wait, b.span_id) : bolts.steering.claim(b.trace_id, b.span_id);
    return c.json({ mode, note: note ? { id: note.id, kind: note.kind, text: note.text, finding_id: note.finding_id } : null });
  });

  app.post("/api/steer/check", async (c) => {
    if (!engine) return err(c, 503, "engine not running");
    const b = await body<{ trace_id?: string; question?: string; span_ids?: string[] }>(c);
    if (!b.trace_id || !b.question) return err(c, 400, "trace_id and question required");
    if (!bolts.store.getRun(b.trace_id)) return c.json({ probability: null, answer: "unknown", reason: "Bolt has not received spans for this run yet", evidence_span_ids: [] });
    try {
      const r = await engine.judge(b.trace_id, b.question, { spanIds: b.span_ids });
      bolts.bus.emit("activity", { trace_id: b.trace_id, kind: "self-check", message: b.question });
      return c.json({ ...r, answer: r.probability >= 0.5 ? "yes" : "no" });
    } catch (e) {
      return err(c, 503, (e as Error).message);
    }
  });

  // ------------------------------------------------- focus and cloud pushes

  app.post("/api/focus", async (c) => {
    const b = await body<{ trace_id?: string; span_id?: string | null }>(c);
    bolts.focus = b.trace_id ? { trace_id: b.trace_id, span_id: b.span_id ?? null, at: Date.now() } : null;
    return c.json({ ok: true });
  });

  app.get("/api/pushes", (c) => c.json({ pushes: [...bolts.pushes.values()].sort((a, b) => b.created_ms - a.created_ms) }));

  app.post("/api/pushes/:id/:action", async (c) => {
    const p = bolts.pushes.get(c.req.param("id"));
    if (!p) return err(c, 404, "push not found");
    if (p.status !== "pending") return c.json(p);
    if (c.req.param("action") === "decline") {
      p.status = "declined";
    } else if (c.req.param("action") === "confirm") {
      const row = await bolts.relay.forward(p.trace_ids, "coding-agent (confirmed)");
      p.status = row.status === "ok" ? "sent" : "failed";
      p.forward_id = row.id;
      p.error = row.error ?? undefined;
    } else return err(c, 400, "action must be confirm or decline");
    bolts.bus.emit("activity", { kind: "push", message: p.status });
    return c.json(p);
  });

  // Small helper for the UI: which spans changed since a sequence number.
  app.get("/api/runs/:traceId/snapshot", (c) => {
    const snap = loadTrace(bolts.store, c.req.param("traceId"));
    return c.json({ spans: snap.spans.map((s) => ({ id: s.id, kind: s.kind, name: s.name, status: s.status })) });
  });
}
