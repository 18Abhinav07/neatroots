#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Command } from "commander";
import { Bolts } from "./core.js";
import { createApp, startServer } from "./server/app.js";
import { VERSION } from "./version.js";
import { boltsHome, loadConfig, saveConfig, DEFAULT_PORT, type SteeringMode } from "./config.js";
import { runStdioBridge } from "./mcp/stdio.js";
import { parseChecks } from "./checks/registry.js";
import { hardwareTier, LlmClient } from "./models/llm.js";
import { DecisionModel } from "./models/decision.js";
import { setCloudKey, deleteCloudKey, getCloudKey, getSecret, setSecret, deleteSecret } from "./relay/keychain.js";
import { LAYA_DOWNLOAD_MB, LayaManager } from "./models/laya.js";
import { log } from "./util/log.js";

const program = new Command();
program.name("bolts").description("Neatlogs Bolts: local, private checks for AI agents while they run").version(VERSION);

function port(opt?: string): number {
  return opt ? Number(opt) : loadConfig().port || DEFAULT_PORT;
}

async function api<T = unknown>(p: number, route: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`http://localhost:${p}${route}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as T;
}

async function running(p: number): Promise<boolean> {
  try {
    return (await fetch(`http://localhost:${p}/health`, { signal: AbortSignal.timeout(800) })).ok;
  } catch {
    return false;
  }
}

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.includes(question)) write.call(rl, s);
        else write.call(rl, "*".repeat(s.length ? 1 : 0));
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

// ------------------------------------------------------------------- start

program
  .command("start")
  .description("Run Bolts: collector, checks, steering, app and MCP on one local port")
  .option("-p, --port <port>", "port to listen on (default 4100)")
  .option("--no-engine", "collect and show runs without running checks")
  .option("--no-laya", "do not install or start Laya (the local decision model)")
  .action(async (opts) => {
    const bolts = new Bolts({ noEngine: opts.engine === false });
    if (opts.port) bolts.config.port = Number(opts.port);
    if (opts.laya === false) bolts.config.classifier.laya.enabled = false;
    const app = createApp(bolts);
    try {
      await startServer(bolts, app);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        log.error(`port ${bolts.config.port} is in use. Is Bolts already running? Try: bolts status`);
        process.exit(1);
      }
      throw err;
    }
    bolts.startRetention();
    if (bolts.config.classifier.laya.enabled && !bolts.laya.installed() && bolts.config.classifier.laya.autoInstall) {
      log.info(`installing Laya, the local decision model, in the background (about ${(LAYA_DOWNLOAD_MB / 1000).toFixed(1)} GB to ${bolts.laya.dir}). Skip with --no-laya.`);
    }
    bolts.startModels();
    const status = bolts.engine ? await bolts.engine.status() : null;
    const tier = hardwareTier();
    log.info(`app: http://localhost:${bolts.config.port}`);
    log.info(`point your agent at it: NEATLOGS_ENDPOINT=http://localhost:${bolts.config.port} NEATLOGS_API_KEY=bolts-local`);
    log.info(`machine: ${tier.memoryGb} GB (${tier.tier} tier)`);
    if (status) {
      log.info(status.llm.ok ? `local LLM: ${status.llm.model} at ${bolts.config.llm.baseUrl}` : `local LLM: not available (${status.llm.error}). Rules still run; start Ollama or LM Studio for questions and explanations.`);
      log.info(status.decision.backend ? `decision model now: ${status.decision.backend}${status.decision.model ? ` (${status.decision.model})` : ""}; Laya takes over when it is ready` : "decision model: none yet");
    }
    if (bolts.checks.errors.length) log.warn(`${bolts.checks.errors.length} check file problem(s); see the Checks page`);
    const stop = () => {
      log.info("stopping");
      bolts.close();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });

// --------------------------------------------------------------------- mcp

program
  .command("mcp")
  .description("Serve Bolts' MCP tools over stdio for Claude Code, Cursor, Codex or any MCP client (starts Bolts if needed)")
  .option("-p, --port <port>")
  .action(async (opts) => {
    await runStdioBridge(port(opts.port));
  });

// -------------------------------------------------------------------- init

program
  .command("init")
  .description("Set up the current project: point the Neatlogs SDK at Bolts, add a checks folder, optionally enable steering and register the MCP server")
  .option("--project <name>", "project name (the SDK's service.name / workflow_name)")
  .option("--write-env", "write NEATLOGS_ENDPOINT and NEATLOGS_API_KEY to .env")
  .option("--steering <mode>", "enable steering for the project: advisory, gate or self-check")
  .option("--mcp <client>", "register the MCP server with a coding agent: claude")
  .action(async (opts) => {
    const cwd = process.cwd();
    const cfg = loadConfig();
    const p = cfg.port;
    const checksDir = path.join(cwd, ".bolts", "checks");
    fs.mkdirSync(checksDir, { recursive: true });
    const readme = path.join(cwd, ".bolts", "README.md");
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(
        readme,
        `# Bolts checks for this project\n\nYAML files in \`checks/\` are loaded by Bolts (https://github.com/neatlogs/bolts) when it runs on this machine.\nA check with the same id as a library check replaces it. See \`bolts checks --help\`.\n`,
      );
    }
    if (!cfg.checkDirs.includes(checksDir)) cfg.checkDirs.push(checksDir);
    console.log(`✓ checks folder: ${path.relative(cwd, checksDir)} (registered with Bolts)`);
    const envLines = [`NEATLOGS_ENDPOINT=http://localhost:${p}`, `NEATLOGS_API_KEY=bolts-local`];
    if (opts.writeEnv) {
      const envPath = path.join(cwd, ".env");
      let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
      const set = (key: string, value: string, onlyIfMissing: boolean) => {
        const re = new RegExp(`^${key}=.*$`, "m");
        if (re.test(text)) {
          if (!onlyIfMissing) text = text.replace(re, `${key}=${value}`);
        } else text += `${text && !text.endsWith("\n") ? "\n" : ""}${key}=${value}\n`;
      };
      set("NEATLOGS_ENDPOINT", `http://localhost:${p}`, false);
      // A real key stays: Bolts accepts any key and never stores it.
      set("NEATLOGS_API_KEY", "bolts-local", true);
      fs.writeFileSync(envPath, text);
      console.log(`✓ .env points the Neatlogs SDK at Bolts`);
    } else {
      console.log(`→ point the Neatlogs SDK at Bolts (or rerun with --write-env):\n    ${envLines.join("\n    ")}`);
    }
    if (opts.steering) {
      if (!opts.project) {
        console.error("--steering needs --project <name> (your SDK workflow_name / service.name)");
        process.exit(1);
      }
      const mode = opts.steering as SteeringMode;
      if (!["advisory", "gate", "self-check", "off"].includes(mode)) {
        console.error("steering mode must be advisory, gate, self-check or off");
        process.exit(1);
      }
      cfg.projects[opts.project] = { ...(cfg.projects[opts.project] ?? {}), steering: mode };
      console.log(`✓ steering for ${opts.project}: ${mode} (add the bolts-steer hook to your agent; see docs/steering.md)`);
    }
    saveConfig(cfg);
    if (await running(p)) {
      await api(p, "/api/checks/reload", { method: "POST" }).catch(() => undefined);
      if (opts.steering && opts.project) await api(p, "/api/settings", { method: "POST", body: JSON.stringify({ project: opts.project, steering: opts.steering }) }).catch(() => undefined);
    }
    const cli = path.resolve(process.argv[1] ?? "bolts");
    if (opts.mcp === "claude") {
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync("claude", ["mcp", "add", "--scope", "user", "bolts", "--", process.execPath, cli, "mcp"], { stdio: "inherit" });
      console.log(r.status === 0 ? "✓ registered the bolts MCP server with Claude Code" : "✗ could not run `claude mcp add`; add it by hand (below)");
    }
    console.log(`\nMCP for coding agents:\n    claude mcp add --scope user bolts -- ${process.execPath} ${cli} mcp\n    (Cursor/others: command "${process.execPath}", args ["${cli}", "mcp"], or the HTTP endpoint http://localhost:${p}/mcp)`);
    console.log(`\nInstrumentation tip: pass flush_interval=0.5 to neatlogs.init() so Bolts sees spans while the run is still going.`);
  });

// ------------------------------------------------------------------ status

program
  .command("status")
  .description("Show whether Bolts is running, its models and recent runs")
  .option("-p, --port <port>")
  .action(async (opts) => {
    const p = port(opts.port);
    if (!(await running(p))) {
      console.log(`Bolts is not running on port ${p}. Start it with: bolts start`);
      process.exitCode = 1;
      return;
    }
    const s = await api<any>(p, "/api/status");
    console.log(`Bolts ${s.version} on http://localhost:${s.port} (up ${Math.round(s.uptime_ms / 1000)}s)`);
    console.log(`  runs ${s.stats.runs} · spans ${s.stats.spans} · findings ${s.stats.findings} · ${(s.stats.bytes / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  machine ${s.tier.memoryGb} GB (${s.tier.tier}) · ${s.tier.platform}`);
    if (s.engine) {
      console.log(`  LLM ${s.engine.llm.ok ? s.engine.llm.model : `unavailable (${s.engine.llm.error})`}`);
      console.log(`  decisions ${s.engine.decision.backend ?? "unavailable"}${s.engine.decision.model ? ` (${s.engine.decision.model})` : ""}`);
      console.log(`  live runs ${s.engine.liveRuns} · pending checks ${s.engine.pendingJobs}`);
    }
    console.log(`  steering ${s.steering.enabled ? "on" : "OFF (global switch)"} · hooks connected ${s.steering.hooks_connected}`);
    console.log(`  cloud ${s.cloud.has_key ? "key stored" : "no key"} → ${s.cloud.endpoint}`);
  });

// ------------------------------------------------------------------ doctor

program
  .command("doctor")
  .description("Check that Bolts, its models and the trace path work on this machine")
  .option("-p, --port <port>")
  .action(async (opts) => {
    const p = port(opts.port);
    const cfg = loadConfig();
    let ok = true;
    const line = (pass: boolean | "warn", msg: string) => {
      console.log(`${pass === "warn" ? "!" : pass ? "✓" : "✗"} ${msg}`);
      if (pass === false) ok = false;
    };
    const up = await running(p);
    line(up, up ? `Bolts answers on http://localhost:${p}` : `Bolts is not running on port ${p} (bolts start)`);
    const llm = new LlmClient(cfg.llm);
    const probe = await llm.probe(true);
    line(probe.ok ? true : "warn", probe.ok ? `local LLM ${probe.model} at ${cfg.llm.baseUrl}` : `no local LLM at ${cfg.llm.baseUrl} (${probe.error}); questions, explanations and notes need one`);
    const layaMgr = new LayaManager(boltsHome(), cfg.classifier);
    const dm = new DecisionModel(cfg.classifier, llm, { laya: async () => layaMgr.token, jevCloud: () => getSecret("jev-api-key") });
    const layaUp = await dm.laya.available();
    line(layaUp ? true : "warn", layaUp ? `Laya answers on 127.0.0.1:${cfg.classifier.laya.port}` : layaMgr.installed() ? "Laya is installed but not running (bolts start runs it)" : "Laya is not installed yet (bolts start installs it; or bolts laya install)");
    const st = await dm.status();
    line(st.backend ? true : "warn", st.backend ? `decisions answered by: ${st.backend}${st.model ? ` (${st.model})` : ""}` : "no decision model (no Laya, no Jev cloud, no LLM)");
    const tier = hardwareTier();
    line(true, `${tier.memoryGb} GB memory: ${tier.tier} tier, ${tier.description}`);
    if (up) {
      const traceId = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const spanId = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const now = BigInt(Date.now()) * 1_000_000n;
      const body = {
        resourceSpans: [
          {
            resource: { attributes: [{ key: "service.name", value: { stringValue: "bolts.doctor" } }, { key: "neatlogs.doctor", value: { boolValue: true } }] },
            scopeSpans: [{ scope: { name: "bolts.doctor" }, spans: [{ traceId, spanId, name: "bolts.doctor.root", kind: 1, startTimeUnixNano: String(now), endTimeUnixNano: String(now + 1_000_000n), attributes: [{ key: "neatlogs.span.kind", value: { stringValue: "workflow" } }], status: { code: 1 } }] }],
          },
        ],
      };
      try {
        await api(p, "/v1/traces", { method: "POST", body: JSON.stringify(body) });
        const rb = await api<any>(p, `/api/traces/v3/${traceId}`);
        line(rb._id === traceId && rb.spanCount === 1, "trace round trip through /v1/traces and the doctor read-back");
        await api(p, `/api/runs/${traceId}`, { method: "DELETE" });
      } catch (err) {
        line(false, `trace round trip failed: ${(err as Error).message}`);
      }
      const s = await api<any>(p, "/api/status");
      line(s.check_errors.length === 0 ? true : "warn", s.check_errors.length ? `${s.check_errors.length} check file problem(s)` : "all checks load");
    }
    console.log(`\nTo test the SDK path end to end:  NEATLOGS_API_KEY=bolts-local NEATLOGS_ENDPOINT=http://localhost:${p} python -m neatlogs doctor --probe`);
    process.exitCode = ok ? 0 : 1;
  });

// ---------------------------------------------------------------- steering

program
  .command("steering")
  .description("Show or set steering: bolts steering [off|advisory|gate|self-check] --project <name>, or bolts steering stop to turn it off everywhere")
  .argument("[mode]")
  .option("--project <name>")
  .option("-p, --port <port>")
  .action(async (mode: string | undefined, opts) => {
    const p = port(opts.port);
    const cfg = loadConfig();
    const isUp = await running(p);
    if (!mode) {
      console.log(`steering is ${cfg.steering.enabled ? "on" : "OFF"} globally`);
      for (const [name, s] of Object.entries(cfg.projects)) console.log(`  ${name}: ${s.steering ?? "off"}${s.forward ? " · forwarding to cloud" : ""}`);
      return;
    }
    if (mode === "stop" || mode === "start") {
      if (isUp) await api(p, "/api/settings", { method: "POST", body: JSON.stringify({ steering_enabled: mode === "start" }) });
      else {
        cfg.steering.enabled = mode === "start";
        saveConfig(cfg);
      }
      console.log(mode === "stop" ? "steering is off everywhere; nothing will be sent to agents" : "steering is on for projects that enabled it");
      return;
    }
    if (!opts.project) {
      console.error("give --project <name>");
      process.exit(1);
    }
    if (isUp) await api(p, "/api/settings", { method: "POST", body: JSON.stringify({ project: opts.project, steering: mode }) });
    else {
      cfg.projects[opts.project] = { ...(cfg.projects[opts.project] ?? {}), steering: mode as SteeringMode };
      saveConfig(cfg);
    }
    console.log(`steering for ${opts.project}: ${mode}`);
  });

// ------------------------------------------------------------------- cloud

const cloud = program.command("cloud").description("Neatlogs Cloud: store your API key and forward runs");

cloud
  .command("login")
  .description("Store your Neatlogs Cloud API key (macOS Keychain)")
  .action(async () => {
    const key = process.stdin.isTTY ? await ask("Paste your API key from app.neatlogs.com: ", true) : fs.readFileSync(0, "utf8").trim();
    if (!key) {
      console.error("no key given");
      process.exit(1);
    }
    const where = await setCloudKey(key);
    console.log(`✓ stored in the ${where === "keychain" ? "macOS Keychain" : "file ~/.bolts/cloud-api-key"}`);
  });

cloud
  .command("logout")
  .description("Remove the stored API key")
  .action(async () => {
    await deleteCloudKey();
    console.log("✓ removed");
  });

cloud
  .command("status")
  .action(async () => {
    const cfg = loadConfig();
    console.log(`endpoint ${cfg.cloud.endpoint} · key ${(await getCloudKey()) ? "stored" : "not stored"}`);
  });

cloud
  .command("forward")
  .description("Send runs to Neatlogs Cloud (after a redaction preview)")
  .argument("<traceIds...>")
  .option("-y, --yes", "skip the confirmation")
  .option("-p, --port <port>")
  .action(async (traceIds: string[], opts) => {
    const p = port(opts.port);
    const preview = await api<any>(p, "/api/cloud/preview", { method: "POST", body: JSON.stringify({ trace_ids: traceIds }) });
    console.log(`${preview.span_count} spans from ${traceIds.length} run(s) → ${preview.endpoint}`);
    for (const r of preview.redactions) console.log(`  redacting ${r.count} × ${r.kind} (e.g. ${r.samples[0]?.sample} in ${r.samples[0]?.where})`);
    if (!preview.has_key) {
      console.error("no API key stored: run bolts cloud login");
      process.exit(1);
    }
    if (!opts.yes && (await ask("Send? [y/N] ")).toLowerCase() !== "y") return;
    const r = await api<any>(p, "/api/cloud/forward", { method: "POST", body: JSON.stringify({ trace_ids: traceIds }) }).catch((e) => ({ status: "error", error: e.message }));
    console.log(r.status === "ok" ? `✓ sent ${r.span_count} spans (${r.bytes} bytes)` : `✗ ${r.error}`);
  });

cloud
  .command("auto")
  .description("Forward a project's runs automatically as they finish (on|off)")
  .argument("<project>")
  .argument("<state>")
  .option("-p, --port <port>")
  .action(async (project: string, state: string, opts) => {
    const p = port(opts.port);
    const on = state === "on";
    if (await running(p)) await api(p, "/api/settings", { method: "POST", body: JSON.stringify({ project, forward: on }) });
    else {
      const cfg = loadConfig();
      cfg.projects[project] = { ...(cfg.projects[project] ?? {}), forward: on };
      saveConfig(cfg);
    }
    console.log(`forwarding for ${project}: ${on ? "on" : "off"}`);
  });

// ------------------------------------------------------------------- rerun

const rerun = program.command("rerun").description("Commands coding agents may use to rerun your agent (MCP rerun tool)");

rerun
  .command("add")
  .argument("<project>")
  .argument("<command>")
  .option("--cwd <dir>", "working directory (default: current)")
  .action((project: string, command: string, opts) => {
    const cfg = loadConfig();
    cfg.rerun[project] = { command, cwd: path.resolve(opts.cwd ?? process.cwd()) };
    saveConfig(cfg);
    console.log(`✓ ${project}: ${command} (in ${cfg.rerun[project].cwd}). Restart Bolts to pick it up.`);
  });

rerun.command("list").action(() => {
  const cfg = loadConfig();
  for (const [k, v] of Object.entries(cfg.rerun)) console.log(`${k}: ${v.command}  (cwd ${v.cwd ?? "."})`);
});

rerun
  .command("remove")
  .argument("<project>")
  .action((project: string) => {
    const cfg = loadConfig();
    delete cfg.rerun[project];
    saveConfig(cfg);
    console.log(`✓ removed ${project}`);
  });

// ------------------------------------------------------------------ checks

const checks = program.command("checks").description("List and validate checks");

checks
  .command("list")
  .option("-p, --port <port>")
  .action(async (opts) => {
    const p = port(opts.port);
    const r = await api<any>(p, "/api/checks");
    for (const c of r.checks) {
      const prec = c.precision.precision === null ? "" : ` · precision ${(c.precision.precision * 100).toFixed(0)}% of ${c.precision.hits}`;
      console.log(`${c.enabled ? "●" : "○"} ${c.id.padEnd(32)} ${c.kind.padEnd(7)} ${c.source.padEnd(8)}${prec}`);
    }
    for (const e of r.errors) console.log(`✗ ${e.path}: ${e.message}`);
  });

checks
  .command("validate")
  .argument("<files...>")
  .action((files: string[]) => {
    let bad = 0;
    for (const f of files) {
      const { checks: cs, errors } = parseChecks(fs.readFileSync(f, "utf8"));
      for (const c of cs) console.log(`✓ ${f}: ${c.id} (${c.kind})`);
      for (const e of errors) {
        bad++;
        console.log(`✗ ${f}${e.id ? ` ${e.id}` : ""}: ${e.message}`);
      }
    }
    process.exitCode = bad ? 1 : 0;
  });

// ------------------------------------------------------------------ models

program
  .command("models")
  .description("Show the hardware tier and which local models Bolts will use")
  .action(async () => {
    const cfg = loadConfig();
    const tier = hardwareTier();
    console.log(`${tier.memoryGb} GB memory → ${tier.tier} tier: ${tier.description}`);
    const llm = new LlmClient(cfg.llm);
    const probe = await llm.probe(true);
    console.log(probe.ok ? `LLM: ${probe.model} (installed: ${probe.models?.join(", ")})` : `LLM: none at ${cfg.llm.baseUrl} (${probe.error})`);
    const laya = new LayaManager(boltsHome(), cfg.classifier);
    const dm = new DecisionModel(cfg.classifier, llm, { laya: async () => laya.token, jevCloud: () => getSecret("jev-api-key") });
    console.log(`Laya: ${(await dm.laya.available()) ? `running on 127.0.0.1:${cfg.classifier.laya.port}` : laya.installed() ? "installed, not running (bolts start runs it)" : `not installed (bolts laya install, about ${(LAYA_DOWNLOAD_MB / 1000).toFixed(1)} GB)`}`);
    console.log(`Jev cloud: ${cfg.classifier.jevCloud.enabled ? "on" : "off"}${(await getSecret("jev-api-key")) ? ", key stored" : ", no key"}`);
    const st = await dm.status();
    console.log(`decisions now: ${st.backend ?? "none"}${st.model ? ` (${st.model})` : ""}`);
  });

const laya = program.command("laya").description("Laya, the local decision model Bolts runs");

laya
  .command("install")
  .description("Install Laya into ~/.bolts/laya and check that it starts")
  .action(async () => {
    const cfg = loadConfig();
    cfg.classifier.laya.enabled = true;
    saveConfig(cfg);
    const m = new LayaManager(boltsHome(), cfg.classifier);
    console.log(`Installing Laya ${"(about " + (LAYA_DOWNLOAD_MB / 1000).toFixed(1) + " GB)"} into ${m.dir}…`);
    const t = setInterval(() => {
      const s = m.state;
      if (s.message) process.stdout.write(`\r  ${s.message}${s.progress !== null ? ` (${Math.round(s.progress * 100)}%)` : ""}`.padEnd(90));
    }, 1000);
    await m.ensure({ install: true });
    clearInterval(t);
    const s = m.state;
    console.log(`\n${s.state === "running" ? "✓" : "✗"} Laya ${s.state}${s.message ? `: ${s.message}` : ""}`);
    m.stop();
    process.exitCode = s.state === "running" ? 0 : 1;
  });

laya
  .command("status")
  .action(async () => {
    const cfg = loadConfig();
    const m = new LayaManager(boltsHome(), cfg.classifier);
    const dm = new DecisionModel(cfg.classifier, new LlmClient(cfg.llm), { laya: async () => m.token, jevCloud: async () => undefined });
    console.log(`installed: ${m.installed() ? "yes" : "no"} · enabled: ${cfg.classifier.laya.enabled} · running: ${(await dm.laya.available()) ? `yes on 127.0.0.1:${cfg.classifier.laya.port}` : "no"}`);
  });

laya
  .command("off")
  .description("Stop using Laya (Bolts falls back to Jev cloud if on, else the local LLM)")
  .action(() => {
    const cfg = loadConfig();
    cfg.classifier.laya.enabled = false;
    saveConfig(cfg);
    console.log("Laya is off. Restart Bolts to stop a running Laya.");
  });

const jev = program.command("jev").description("Jev cloud (TypeSafe), an opt-in hosted decision model");

jev
  .command("login")
  .description("Store your TypeSafe API key (macOS Keychain)")
  .action(async () => {
    const key = process.stdin.isTTY ? await ask("Paste your TypeSafe API key: ", true) : fs.readFileSync(0, "utf8").trim();
    if (!key) {
      console.error("no key given");
      process.exit(1);
    }
    const where = await setSecret("jev-api-key", key);
    console.log(`✓ stored in the ${where === "keychain" ? "macOS Keychain" : "file ~/.bolts/jev-api-key"}. Turn it on with: bolts jev on`);
  });

jev.command("logout").action(async () => {
  await deleteSecret("jev-api-key");
  console.log("✓ removed");
});

for (const state of ["on", "off"] as const) {
  jev
    .command(state)
    .description(state === "on" ? "Use Jev cloud for decisions (span content a question needs is sent to api.typesafe.ai)" : "Stop using Jev cloud")
    .option("-p, --port <port>")
    .action(async (opts) => {
      const p = port(opts.port);
      if (await running(p)) await api(p, "/api/settings", { method: "POST", body: JSON.stringify({ jev_cloud_enabled: state === "on" }) });
      else {
        const cfg = loadConfig();
        cfg.classifier.jevCloud.enabled = state === "on";
        saveConfig(cfg);
      }
      console.log(state === "on" ? "Jev cloud is on. Span content a question needs is sent to api.typesafe.ai; everything else stays local." : "Jev cloud is off.");
    });
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
