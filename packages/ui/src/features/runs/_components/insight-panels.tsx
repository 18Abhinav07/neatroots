import { AiBrain01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../../../components/ui/icon";
import { Panel } from "../../../components/ui/panel";
import type { Explanation } from "../../../lib/api";
import { pct } from "../../../lib/format";
import { EvidenceChips } from "./evidence-chips";

export function SummaryPanel({ text, model }: { text: string; model: string | null }) {
  return (
    <Panel title="Summary" meta={model ? `by ${model}` : undefined}>
      <ol className="flex flex-col gap-2 px-4 py-3">
        {text.split("\n").map((line, i) => (
          <li key={i} className="flex gap-3 text-body text-foreground">
            <span className="w-4 shrink-0 pt-px font-mono text-3xs text-foreground-subtle tabular-nums">{i + 1}</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function ExplanationBlock({ exp, onPick }: { exp: Explanation; onPick: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-foreground">{exp.cause}</p>
      {exp.fix && (
        <div className="flex flex-col gap-1">
          <span className="text-label text-muted-foreground">Suggested fix</span>
          <p className="text-body text-foreground">{exp.fix}</p>
        </div>
      )}
      <EvidenceChips ids={exp.evidence_span_ids} onPick={onPick} />
    </div>
  );
}

export function LikelyCausePanel({ exp, onPick }: { exp: Explanation; onPick: (id: string) => void }) {
  return (
    <Panel
      title="Likely cause"
      meta={
        <span className="inline-flex items-center gap-1">
          <Icon icon={AiBrain01Icon} size="xs" className="text-brand-violet" />
          {exp.model ?? "local LLM"} · evidence support {pct(exp.grounding)}
        </span>
      }
    >
      <div className="px-4 py-3">
        <ExplanationBlock exp={exp} onPick={onPick} />
      </div>
    </Panel>
  );
}
