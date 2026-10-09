import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientStatus, connectClient, disconnectClient, findClient } from "../src/mcp/clients.js";

const cmd = { command: "/opt/neatbolt/bin/neatbolt", args: ["mcp"] };
let home: string;
const saved = { HOME: process.env.HOME, PATH: process.env.PATH };

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "neatbolt-clients-"));
  process.env.HOME = home;
  process.env.PATH = "";
});

afterEach(() => {
  process.env.HOME = saved.HOME;
  process.env.PATH = saved.PATH;
  fs.rmSync(home, { recursive: true, force: true });
});

const read = (p: string) => JSON.parse(fs.readFileSync(path.join(home, p), "utf8"));

describe("coding-agent MCP setup", () => {
  it("adds to Cursor's mcp.json and keeps the servers already there", () => {
    fs.mkdirSync(path.join(home, ".cursor"));
    fs.writeFileSync(path.join(home, ".cursor/mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } }, theme: "dark" }));
    const cursor = findClient("cursor")!;
    expect(clientStatus(cursor)).toMatchObject({ detected: true, connected: false });
    expect(connectClient(cursor, cmd).ok).toBe(true);
    expect(read(".cursor/mcp.json")).toEqual({ mcpServers: { other: { command: "x" }, neatbolt: cmd }, theme: "dark" });
    expect(fs.existsSync(path.join(home, ".cursor/mcp.json.neatbolt-backup"))).toBe(true);
    expect(clientStatus(cursor).connected).toBe(true);
    expect(disconnectClient(cursor).ok).toBe(true);
    expect(read(".cursor/mcp.json").mcpServers).toEqual({ other: { command: "x" } });
  });

  it("writes each agent's own shape", () => {
    connectClient(findClient("opencode")!, cmd);
    expect(read(".config/opencode/opencode.json").mcp.neatbolt).toEqual({ type: "local", command: ["/opt/neatbolt/bin/neatbolt", "mcp"], enabled: true });
    connectClient(findClient("amp")!, cmd);
    expect(read(".config/amp/settings.json")["amp.mcpServers"].neatbolt).toEqual(cmd);
    connectClient(findClient("gemini")!, cmd);
    expect(read(".gemini/settings.json").mcpServers.neatbolt).toEqual(cmd);
    connectClient(findClient("windsurf")!, cmd);
    expect(read(".codeium/windsurf/mcp_config.json").mcpServers.neatbolt).toEqual(cmd);
  });

  it("leaves a file with comments alone and says what to add", () => {
    fs.mkdirSync(path.join(home, ".gemini"));
    const text = '{\n  // my settings\n  "theme": "dark"\n}\n';
    fs.writeFileSync(path.join(home, ".gemini/settings.json"), text);
    const r = connectClient(findClient("gemini")!, cmd);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('"neatbolt"');
    expect(fs.readFileSync(path.join(home, ".gemini/settings.json"), "utf8")).toBe(text);
  });

  it("adds and removes a Codex table without touching the rest of config.toml", () => {
    fs.mkdirSync(path.join(home, ".codex"));
    const before = 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "x"\n';
    fs.writeFileSync(path.join(home, ".codex/config.toml"), before);
    const codex = findClient("codex")!;
    connectClient(codex, cmd);
    connectClient(codex, cmd); // twice: still one table
    const text = fs.readFileSync(path.join(home, ".codex/config.toml"), "utf8");
    expect(text.match(/\[mcp_servers\.neatbolt\]/g)).toHaveLength(1);
    expect(text).toContain('command = "/opt/neatbolt/bin/neatbolt"\nargs = ["mcp"]');
    expect(text).toContain("[mcp_servers.other]");
    expect(clientStatus(codex).connected).toBe(true);
    disconnectClient(codex);
    expect(fs.readFileSync(path.join(home, ".codex/config.toml"), "utf8")).toBe(before);
  });

  it("installs Bolt's skills where Codex reads them, and removes them on disconnect", () => {
    const codex = findClient("codex")!;
    expect(connectClient(codex, cmd).message).toContain("4 skills");
    const skill = path.join(home, ".agents/skills/neatbolt-debug-last-run/SKILL.md");
    expect(fs.readFileSync(skill, "utf8")).toContain("name: neatbolt-debug-last-run");
    expect(clientStatus(codex).skills).toBe(true);
    fs.mkdirSync(path.join(home, ".agents/skills/someone-else"));
    disconnectClient(codex);
    expect(fs.existsSync(skill)).toBe(false);
    expect(fs.existsSync(path.join(home, ".agents/skills/someone-else"))).toBe(true);
  });

  it("knows Claude Code from ~/.claude.json and needs its CLI to change it", () => {
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { neatbolt: cmd } }));
    const claude = findClient("claude")!;
    expect(clientStatus(claude).connected).toBe(true);
    const r = connectClient(claude, cmd);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("claude mcp add --scope user neatbolt -- /opt/neatbolt/bin/neatbolt mcp");
  });
});
