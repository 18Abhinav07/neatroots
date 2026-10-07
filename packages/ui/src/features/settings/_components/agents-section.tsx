import { CodeLine } from "../../../components/ui/copy-button";
import { Panel } from "../../../components/ui/panel";
import type { Status } from "../../../lib/api";
import { bytes } from "../../../lib/format";

export function AgentsSection({ port }: { port: number }) {
  return (
    <Panel title="Coding agents (MCP)">
      <div className="flex flex-col gap-3 px-4 py-4">
        <p className="text-body text-muted-foreground">Claude Code, Cursor, Codex and other MCP clients can read runs, get explanations and add checks. The local LLM does the heavy reading.</p>
        <span className="text-label text-muted-foreground">Claude Code</span>
        <CodeLine text="claude mcp add --scope user bolts -- npx -y @neatlogs/bolts mcp" />
        <span className="text-label text-muted-foreground">Any MCP client (streamable HTTP)</span>
        <CodeLine text={`http://localhost:${port}/mcp`} />
      </div>
    </Panel>
  );
}

export function StorageSection({ status }: { status: Status }) {
  return (
    <Panel title="Storage">
      <div className="flex flex-col gap-2 px-4 py-4">
        <p className="text-body text-foreground tabular-nums">
          {status.stats.runs.toLocaleString()} runs · {status.stats.spans.toLocaleString()} spans · {status.stats.findings.toLocaleString()} findings · {bytes(status.stats.bytes)}
        </p>
        <p className="text-caption text-muted-foreground">
          Kept for {status.config.retention.days} days or up to {status.config.retention.maxGb} GB, oldest first. Pinned runs are kept.
        </p>
        <p className="font-mono text-3xs text-foreground-subtle">{status.home}</p>
      </div>
    </Panel>
  );
}
