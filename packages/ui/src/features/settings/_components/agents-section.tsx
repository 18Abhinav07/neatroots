import { CodeLine } from "@/components/code-line";
import { PendingButton } from "@/components/pending-button";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Status } from "@/lib/api";
import { bytes } from "@/lib/format";
import { useAgentAction, useAgents } from "../_services/settings-queries";
import { SettingField, SettingsPanel } from "./form";

const HEAD = "h-9 px-3 text-eyebrow font-normal text-muted-foreground";

/** Coding agents on this machine and whether each can read neatroots over MCP; connect is one click. */
export function AgentsSection({ port }: { port: number }) {
  const { data } = useAgents();
  const act = useAgentAction();
  const agents = [...(data?.agents ?? [])].sort((a, b) => Number(b.connected) - Number(a.connected) || Number(b.detected) - Number(a.detected));
  const connected = agents.filter((a) => a.connected).length;
  return (
    <SettingsPanel title="Coding agents (MCP)" meta={data ? `${connected} connected` : undefined}>
      <p className="text-sm text-muted-foreground">
        Connected agents can read your runs and findings, get explanations and add checks. Connecting adds a <span className="font-mono">neatroots</span> entry to that
        agent's own MCP settings and leaves the rest as it is. Claude Code and Codex also get four skills: debug the last run, write a check, instrument an
        agent, push runs to Neatlogs Cloud.
      </p>
      <div className="-mx-6 max-h-[26rem] overflow-auto border-y border-border">
        <Table className="min-w-[36rem] table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-surface-subtle">
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className={`${HEAD} w-40 pl-6`}>Agent</TableHead>
              <TableHead className={`${HEAD} w-40`}>Status</TableHead>
              <TableHead className={HEAD}>Settings file</TableHead>
              <TableHead className={`${HEAD} w-32 pr-6 text-right`} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((a) => {
              const busy = act.isPending && act.variables?.id === a.id;
              return (
                <TableRow key={a.id} className="h-12 hover:bg-transparent">
                  <TableCell className="px-3 pl-6 text-sm text-foreground">{a.label}</TableCell>
                  <TableCell className="px-3">
                    <StatusPill
                      size="sm"
                      tone={a.connected ? "success" : a.detected ? "neutral" : "muted"}
                      dot={a.connected ? "solid" : false}
                      title={a.connected && a.skills ? "MCP server and neatroots's skills" : undefined}
                    >
                      {a.connected ? (a.skills ? "Connected + skills" : "Connected") : a.detected ? "Not connected" : "Not found"}
                    </StatusPill>
                  </TableCell>
                  <TableCell className="truncate px-3 font-mono text-2xs text-muted-foreground" title={a.where}>
                    {a.detected || a.connected ? a.where : ""}
                  </TableCell>
                  <TableCell className="px-3 pr-6 text-right">
                    {a.connected ? (
                      <PendingButton size="sm" variant="ghost" pending={busy} onClick={() => act.mutate({ id: a.id, action: "disconnect" })}>
                        Disconnect
                      </PendingButton>
                    ) : (
                      <PendingButton size="sm" variant="secondary" pending={busy} onClick={() => act.mutate({ id: a.id, action: "connect" })}>
                        Connect
                      </PendingButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <SettingField label="From a terminal" hint="Connects every agent found on this machine; neatroots connect --list shows what it found.">
        <CodeLine text="neatroots connect --detected" />
      </SettingField>
      <SettingField label="Any other MCP client (streamable HTTP)">
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
