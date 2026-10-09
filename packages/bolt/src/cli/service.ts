import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { boltHome, loadConfig } from "../config.js";
import { port, running } from "./util.js";

const LABEL = "com.neatlogs.neatbolt";

function cliPath(): string {
  return fs.realpathSync(process.argv[1]);
}

function logFile(): string {
  return path.join(boltHome(), "logs", "neatbolt.log");
}

function plistPath(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function unitPath(): string {
  return path.join(os.homedir(), ".config", "systemd", "user", "neatbolt.service");
}

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The environment the service runs with: this shell's PATH (so Ollama and uv are found) and Bolt' own settings. */
function serviceEnv(): Record<string, string> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin" };
  for (const k of ["NEATBOLT_HOME", "NEATBOLT_PORT", "HF_HOME"]) if (process.env[k]) env[k] = process.env[k]!;
  return env;
}

function installMac(): void {
  const env = Object.entries(serviceEnv())
    .map(([k, v]) => `      <key>${xml(k)}</key><string>${xml(v)}</string>`)
    .join("\n");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${xml(process.execPath)}</string>
      <string>${xml(cliPath())}</string>
      <string>start</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
${env}
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>StandardOutPath</key><string>${xml(logFile())}</string>
    <key>StandardErrorPath</key><string>${xml(logFile())}</string>
  </dict>
</plist>
`;
  fs.mkdirSync(path.dirname(plistPath()), { recursive: true });
  fs.writeFileSync(plistPath(), plist);
  const domain = `gui/${process.getuid?.() ?? 501}`;
  spawnSync("launchctl", ["bootout", `${domain}/${LABEL}`], { stdio: "ignore" });
  execFileSync("launchctl", ["bootstrap", domain, plistPath()]);
}

function installLinux(): void {
  const env = Object.entries(serviceEnv())
    .map(([k, v]) => `Environment="${k}=${v.replace(/"/g, '\\"')}"`)
    .join("\n");
  const unit = `[Unit]
Description=Neatlogs Bolt
After=network.target

[Service]
ExecStart="${process.execPath}" "${cliPath()}" start
${env}
Restart=on-failure
RestartSec=10
StandardOutput=append:${logFile()}
StandardError=append:${logFile()}

[Install]
WantedBy=default.target
`;
  fs.mkdirSync(path.dirname(unitPath()), { recursive: true });
  fs.writeFileSync(unitPath(), unit);
  execFileSync("systemctl", ["--user", "daemon-reload"]);
  execFileSync("systemctl", ["--user", "enable", "--now", "neatbolt.service"]);
}

function installed(): boolean {
  return fs.existsSync(process.platform === "darwin" ? plistPath() : unitPath());
}

function restartService(): void {
  if (!installed()) return;
  if (process.platform === "darwin") spawnSync("launchctl", ["kickstart", "-k", `gui/${process.getuid?.() ?? 501}/${LABEL}`], { stdio: "ignore" });
  else spawnSync("systemctl", ["--user", "restart", "neatbolt.service"], { stdio: "ignore" });
}

/** The source checkout this CLI was built from (installer or git clone), if there is one. */
function sourceDir(): string | undefined {
  const dir = path.resolve(path.dirname(cliPath()), "..", "..", "..");
  return fs.existsSync(path.join(dir, "install.sh")) && fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ? dir : undefined;
}

/** neatbolt service (start at login) and neatbolt update. */
export function registerServiceCommands(program: Command): void {
  const service = program.command("service").description("Run Bolt in the background and start it at login");

  service
    .command("install")
    .description(process.platform === "darwin" ? "Install a launchd agent (~/Library/LaunchAgents)" : "Install a systemd user service")
    .action(async () => {
      if (process.platform !== "darwin" && process.platform !== "linux") throw new Error("background service is supported on macOS and Linux");
      const p = port();
      if ((await running(p)) && !installed()) throw new Error(`Bolt is already running on port ${p}. Stop it first (Ctrl+C in its terminal), then run this again.`);
      fs.mkdirSync(path.dirname(logFile()), { recursive: true });
      if (process.platform === "darwin") installMac();
      else installLinux();
      for (let i = 0; i < 30 && !(await running(p)); i++) await new Promise((r) => setTimeout(r, 500));
      const up = await running(p);
      console.log(up ? `✓ Bolt runs in the background and starts at login: http://localhost:${p}` : `Service installed but Bolt did not answer yet. Logs: ${logFile()}`);
      console.log(`Logs: ${logFile()} · Remove: neatbolt service uninstall`);
      process.exitCode = up ? 0 : 1;
    });

  service
    .command("uninstall")
    .description("Stop the background service and remove it")
    .action(() => {
      if (process.platform === "darwin") {
        spawnSync("launchctl", ["bootout", `gui/${process.getuid?.() ?? 501}/${LABEL}`], { stdio: "ignore" });
        fs.rmSync(plistPath(), { force: true });
      } else if (process.platform === "linux") {
        spawnSync("systemctl", ["--user", "disable", "--now", "neatbolt.service"], { stdio: "ignore" });
        fs.rmSync(unitPath(), { force: true });
        spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
      }
      console.log("✓ background service removed (your runs and settings in ~/.neatbolt are kept)");
    });

  service
    .command("status")
    .action(async () => {
      const p = port();
      console.log(`service: ${installed() ? "installed" : "not installed"} · Bolt ${(await running(p)) ? `answering on http://localhost:${p}` : "not running"}`);
      console.log(`logs: ${logFile()}`);
    });

  service
    .command("restart")
    .action(() => {
      if (!installed()) throw new Error("no background service; neatbolt service install");
      restartService();
      console.log("✓ restarted");
    });

  program
    .command("update")
    .description("Update Bolt to the latest version (installs made with install.sh or a git clone)")
    .option("--ref <ref>", "branch or tag to update to")
    .action((opts) => {
      const dir = sourceDir();
      if (!dir) throw new Error("this copy of Bolt was not installed from source; reinstall with the install script");
      const env = { ...process.env, NEATBOLT_SOURCE_DIR: dir, NEATBOLT_UPDATE: "1", ...(opts.ref ? { NEATBOLT_REF: opts.ref } : {}) };
      const r = spawnSync("sh", [path.join(dir, "install.sh")], { stdio: "inherit", env });
      if (r.status !== 0) {
        process.exitCode = r.status ?? 1;
        return;
      }
      if (installed()) {
        restartService();
        console.log(`✓ restarted the background service on port ${loadConfig().port}`);
      }
    });
}
