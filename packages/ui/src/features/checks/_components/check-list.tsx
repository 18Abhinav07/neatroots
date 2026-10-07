import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { NeatBadge } from "../../../components/ui/neat-badge";
import { Panel, SectionLabel } from "../../../components/ui/panel";
import { StatusPill } from "../../../components/ui/status-pill";
import { Switch } from "../../../components/ui/switch";
import type { CheckRow } from "../../../lib/api";
import { pct } from "../../../lib/format";
import { CHECK_SOURCE } from "../../runs/_libs/labels";

const GROUPS: { label: string; match: (c: CheckRow) => boolean }[] = [
  { label: "Rules · code, every span, no model", match: (c) => c.kind === "rule" },
  { label: "Your questions", match: (c) => c.kind !== "rule" && (c.source === "user" || c.source === "project" || c.source === "mcp") },
  { label: "Written by the planner", match: (c) => c.kind !== "rule" && c.source === "planner" },
  { label: "Question library", match: (c) => c.kind !== "rule" && c.source === "library" },
];

export function CheckList({ checks, onToggle, onEdit, onDelete }: { checks: CheckRow[]; onToggle: (id: string, enabled: boolean) => void; onEdit: (yaml: string) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState<string>();
  const [confirm, setConfirm] = useState<string>();
  return (
    <Panel title="All checks" meta={`${checks.length}`}>
      {GROUPS.map((g) => {
        const list = checks.filter(g.match);
        if (!list.length) return null;
        return (
          <div key={g.label}>
            <SectionLabel className="border-b border-border bg-surface-subtle px-4 py-2">{g.label}</SectionLabel>
            <ul className="divide-y divide-border">
              {list.map((c) => {
                const src = CHECK_SOURCE[c.source] ?? CHECK_SOURCE.library;
                return (
                  <li key={c.id}>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <Switch label={`${c.enabled ? "Disable" : "Enable"} ${c.id}`} checked={c.enabled} onChange={(v) => onToggle(c.id, v)} />
                      <button type="button" onClick={() => setOpen(open === c.id ? undefined : c.id)} aria-expanded={open === c.id} className="focus-ring flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left">
                        <span className={c.enabled ? "text-body-medium text-foreground" : "text-body text-muted-foreground"}>{c.title}</span>
                        <span className="truncate font-mono text-3xs text-foreground-subtle">
                          {c.id}
                          {typeof c.check.scope === "string" ? ` · ${c.check.scope}` : ""}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.precision.hits > 0 && (
                          <span className="text-caption text-foreground-subtle tabular-nums" title={`${c.precision.hits} findings, ${c.precision.dismissed} dismissed`}>
                            {c.precision.hits} hits{c.precision.precision !== null ? ` · ${pct(c.precision.precision)} kept` : ""}
                          </span>
                        )}
                        {c.precision.noisy && <StatusPill tone="warning">Noisy: consider retiring</StatusPill>}
                        <NeatBadge variant={src.variant}>{src.label}</NeatBadge>
                      </div>
                    </div>
                    {open === c.id && (
                      <div className="flex flex-col gap-2 px-4 pb-3">
                        <pre className="overflow-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">{c.yaml}</pre>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => onEdit(c.yaml)}>
                            Edit a copy
                          </Button>
                          {c.source !== "library" && (
                            <Button size="sm" variant="ghost" className="text-danger-fg" onClick={() => setConfirm(c.id)}>
                              Delete check
                            </Button>
                          )}
                          {c.path && <span className="font-mono text-3xs text-foreground-subtle">{c.path}</span>}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <ConfirmDialog
        open={!!confirm}
        title={`Delete ${confirm}?`}
        description="The check is removed from its file and stops running on new runs. Findings it already raised stay. You can't undo this."
        confirmLabel="Delete check"
        destructive
        onClose={() => setConfirm(undefined)}
        onConfirm={() => {
          if (confirm) onDelete(confirm);
          setConfirm(undefined);
        }}
      />
    </Panel>
  );
}
