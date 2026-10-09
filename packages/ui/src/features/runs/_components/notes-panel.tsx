import { AiBrain01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../../../components/ui/icon";
import { StatusPill } from "../../../components/ui/status-pill";
import type { Note } from "../../../lib/api";
import { ago, pct } from "../../../lib/format";
import { NOTE_STATE } from "../_libs/labels";

/** Notes Bolt sent (or tried to send) to the running agent. Rendered only when there are some. */
export function SteeringNotes({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  const delivered = notes.filter((n) => n.status === "delivered").length;
  return (
    <section aria-labelledby="notes" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="notes" className="text-eyebrow text-muted-foreground">
          Notes to the agent
        </h2>
        <span className="text-caption text-foreground-subtle">
          {delivered} of {notes.length} delivered
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {notes.map((n) => {
          const state = NOTE_STATE[n.status];
          return (
            <li key={n.id} className="flex flex-col gap-1.5">
              <blockquote className="rounded-md bg-muted px-3 py-2 text-body text-foreground">{n.text}</blockquote>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-foreground-subtle">
                <StatusPill tone={state.tone}>{state.label}</StatusPill>
                {n.kind === "llm" ? (
                  <span className="inline-flex items-center gap-1">
                    <Icon icon={AiBrain01Icon} size="xs" className="text-brand-violet" />
                    written by the LLM
                  </span>
                ) : (
                  <span>{n.kind === "halt" ? "stop from your rule" : "from the check's template"}</span>
                )}
                <span>{n.delivered_ms ? `reached the agent ${ago(n.delivered_ms)}` : ago(n.created_ms)}</span>
                {n.checks?.unsupported !== undefined && (
                  <span className="tabular-nums" title="Checked before sending">
                    unsupported {pct(n.checks.unsupported)} · copied from tool output {pct(n.checks.copied)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
