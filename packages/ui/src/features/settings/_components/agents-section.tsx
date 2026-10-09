import { CodeLine } from "@/components/code-line";
import type { Status } from "@/lib/api";
import { bytes } from "@/lib/format";
import { SettingField, SettingsPanel } from "./form";

export function AgentsSection({ port }: { port: number }) {
  return (
    <SettingsPanel title="Coding agents (MCP)">
      <p className="text-sm text-muted-foreground">
        Claude Code, Cursor, Codex and other MCP clients can read runs, get explanations and add checks. The local LLM does the heavy reading.
      </p>
      <SettingField label="Claude Code">
        <CodeLine text="claude mcp add --scope user neatbolt -- neatbolt mcp" />
      </SettingField>
      <SettingField label="Any MCP client (streamable HTTP)">
        <CodeLine text={`http://localhost:${port}/mcp`} />
      </SettingField>
    </SettingsPanel>
  );
}

export function StorageSection({ status }: { status: Status }) {
  return (
    <SettingsPanel title="Storage" meta={bytes(status.stats.bytes)}>
      <p className="text-sm text-foreground tabular-nums">
        {status.stats.runs.toLocaleString()} runs · {status.stats.spans.toLocaleString()} spans · {status.stats.findings.toLocaleString()} findings
      </p>
      <p className="text-xs text-muted-foreground">
        Kept for {status.config.retention.days} days or up to {status.config.retention.maxGb} GB, oldest first. Pinned runs are kept.
      </p>
      <CodeLine text={status.home} />
    </SettingsPanel>
  );
}
