import { AiBrain01Icon, Message01Icon } from "@hugeicons/core-free-icons";
import { Empty, EmptyHeader, EmptyMedia } from "../../../components/ui/empty";
import { Icon } from "../../../components/ui/icon";
import { Panel } from "../../../components/ui/panel";
import { StatusPill } from "../../../components/ui/status-pill";
import type { Note } from "../../../lib/api";
import { ago, pct } from "../../../lib/format";
import { NOTE_STATE } from "../_libs/labels";

export function NotesPanel({ notes, steering, project }: { notes: Note[]; steering: string; project: string | null }) {
  const delivered = notes.filter((n) => n.status === "delivered").length;
  return (
    <Panel title="Steering notes" meta={notes.length ? `${delivered} delivered` : undefined}>
      {notes.length === 0 ? (
        <Empty className="py-8">
          <EmptyMedia icon={Message01Icon} />
          <EmptyHeader
            title="No notes sent"
            description={
              steering === "off" ? (
                <>
                  Steering is off for <span className="text-foreground">{project}</span>. Turn it on in Settings to add notes to the agent's next LLM call.
                </>
              ) : (
                "Notes appear here when a finding reaches the agent mid-run."
              )
            }
          />
        </Empty>
      ) : (
        <ul className="divide-y divide-border">
          {notes.map((n) => {
            const state = NOTE_STATE[n.status];
            return (
              <li key={n.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <StatusPill tone={state.tone}>{state.label}</StatusPill>
                    {n.kind === "llm" ? (
                      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
                        <Icon icon={AiBrain01Icon} size="xs" className="text-brand-violet" />
                        Written by the local LLM
                      </span>
                    ) : (
                      <span className="text-caption text-muted-foreground">{n.kind === "halt" ? "Stop from your rule" : "Template"}</span>
                    )}
                  </span>
                  <span className="text-caption text-foreground-subtle">{n.delivered_ms ? `reached the agent ${ago(n.delivered_ms)}` : ago(n.created_ms)}</span>
                </div>
                <blockquote className="rounded-md bg-muted px-3 py-2 text-body text-foreground">{n.text}</blockquote>
                {n.checks && (n.checks.unsupported !== undefined || n.checks.copied !== undefined) && (
                  <span className="text-caption text-foreground-subtle tabular-nums">
                    Checked before sending: unsupported by evidence {pct(n.checks.unsupported)} · copied from tool output {pct(n.checks.copied)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
