import { ArrowDown01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useState, type ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import { CodeLine } from "../../../components/ui/copy-button";
import { Icon } from "../../../components/ui/icon";
import type { ProjectRow, Status } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { ago } from "../../../lib/format";

interface Step {
  id: string;
  title: string;
  /** The label in the one-line summary. */
  short: string;
  done: boolean;
  optional?: boolean;
  /** What is true now, shown when the step is done. */
  state: string;
  body: ReactNode;
}

function steps(status: Status, projects: ProjectRow[]): Step[] {
  const port = status.port;
  const llm = status.engine?.llm;
  const hosted = llm?.where && llm.where !== "local";
  const steered = projects.filter((p) => p.settings.steering !== "off");
  const names = projects.map((p) => p.project);
  return [
    {
      id: "runs",
      short: "Runs arriving",
      title: "Send your agent's runs to Bolts",
      done: status.stats.runs > 0,
      state: `${status.stats.runs.toLocaleString()} runs from ${names.length} project${names.length === 1 ? "" : "s"}${names.length ? ` (${names.slice(0, 3).join(", ")})` : ""}`,
      body: (
        <>
          <p>Bolts reads what the Neatlogs SDK already sends. Set two variables where your agent runs; no code change is needed.</p>
          <CodeLine text={`export NEATLOGS_ENDPOINT=http://localhost:${port}\nexport NEATLOGS_API_KEY=bolts-local`} />
          <p>Not using the SDK yet? Add it and name your agent; that name becomes the project here.</p>
          <CodeLine text={`neatlogs.init(workflow_name="my-agent", flush_interval=0.5)`} />
        </>
      ),
    },
    {
      id: "llm",
      short: "LLM",
      title: "Give Bolts an LLM to ask questions with",
      done: !!llm?.ok,
      state: llm?.ok ? `${llm.model}${hosted ? ` (hosted: ${llm.where})` : " on this machine"}` : "",
      body: (
        <>
          <p>Rules run without one. An LLM lets Bolts pick the questions that fit your agent, explain problems and summarize runs. Run one locally:</p>
          <CodeLine text="ollama pull qwen3:8b" />
          <p>
            Or use a hosted model (opt-in; run content is sent to it): <span className="font-mono">bolts llm use anthropic</span>, or{" "}
            <a className="text-foreground underline-offset-4 hover:underline" href="#/settings/models">
              Settings → Models
            </a>
            .
          </p>
        </>
      ),
    },
    {
      id: "mcp",
      short: "Coding agent",
      title: "Let your coding agent read what Bolts finds",
      optional: true,
      done: !!status.mcp?.last_seen_ms,
      state: status.mcp?.last_seen_ms ? `a coding agent last asked ${ago(status.mcp.last_seen_ms)}` : "",
      body: (
        <>
          <p>Claude Code, Cursor or Codex can read your runs and findings, fix the problem and add a check so it is caught next time.</p>
          <CodeLine text="claude mcp add --scope user bolts -- bolts mcp" />
          <p>Then ask it: “Fix what Bolts found in my last run.”</p>
        </>
      ),
    },
    {
      id: "steering",
      short: "Steering",
      title: "Let Bolts nudge the agent while it runs",
      optional: true,
      done: steered.length > 0,
      state: steered.length ? `on for ${steered.map((p) => `${p.project} (${p.settings.steering})`).join(", ")}` : "",
      body: (
        <>
          <p>When a check fires mid-run, Bolts can add a short note to the agent's next LLM call. It needs a small hook in your agent.</p>
          <CodeLine text={`pip install ~/.bolts/src/python/bolts-steer\nbolts steering advisory --project ${names[0] ?? "my-agent"}`} />
          <p>
            Then wrap your client: <span className="font-mono">client = bolts_steer.wrap(OpenAI())</span>. Turn it on per project in{" "}
            <a className="text-foreground underline-offset-4 hover:underline" href="#/settings/projects">
              Settings → Projects
            </a>
            .
          </p>
        </>
      ),
    },
    {
      id: "cloud",
      short: "Neatlogs Cloud",
      title: "Keep or share runs in Neatlogs Cloud",
      optional: true,
      done: status.cloud.has_key,
      state: status.cloud.has_key ? "API key stored" : "",
      body: (
        <>
          <p>Send a run you want to keep or show your team. Bolts removes secrets and personal data first, and sends nothing unless you ask.</p>
          <CodeLine text="bolts cloud login" />
        </>
      ),
    },
  ];
}

const DAILY = [
  "Run your agent as usual. Bolts checks every run as it happens.",
  "Start here: see what is failing more or less often, and which tools and checks are behind it.",
  "Open a problem to see the cause, the suggested fix and the span that shows it, or ask your coding agent to fix it.",
  "Dismiss findings that are wrong. Bolts counts them, so noisy checks show up.",
];

/**
 * How to use Bolts, as steps checked against what is actually set up. Expanded while the
 * essentials are missing; one line once they are done.
 */
export function SetupGuide({ status, projects }: { status: Status; projects: ProjectRow[] }) {
  const list = steps(status, projects);
  const essentialsDone = list.filter((s) => !s.optional).every((s) => s.done);
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const expanded = open ?? !essentialsDone;
  const next = list.find((s) => !s.done && !s.optional) ?? list.find((s) => !s.done);
  const [active, setActive] = useState<string | undefined>(undefined);
  const current = active ?? next?.id;
  const doneCount = list.filter((s) => s.done).length;

  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-subtle px-4 py-2.5">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          {list.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <Icon icon={CheckmarkCircle02Icon} size="xs" className={s.done ? "text-success-fg" : "text-foreground-faint"} />
              {s.short}
            </span>
          ))}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Show how to use Bolts
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby="setup" className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-4 elevation-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="setup" className="text-title text-foreground">
            How to use Bolts
          </h2>
          <p className="max-w-2xl text-body text-muted-foreground">
            Bolts checks your agent's runs on this machine: rules on every step, questions the LLM picks for your agent, and an explanation when something goes wrong. Nothing
            leaves this machine unless you turn it on.
          </p>
        </div>
        <span className="flex items-center gap-2">
          <span className="text-caption text-foreground-subtle tabular-nums">
            {doneCount} of {list.length} set up
          </span>
          {essentialsDone && (
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Hide
            </Button>
          )}
        </span>
      </div>
      <ol className="flex flex-col divide-y divide-border">
        {list.map((s, i) => {
          const isOpen = current === s.id;
          return (
            <li key={s.id} className="flex flex-col">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setActive(isOpen ? "" : s.id)}
                className="focus-ring flex w-full cursor-pointer items-center gap-3 py-2.5 text-left"
              >
                {s.done ? (
                  <Icon icon={CheckmarkCircle02Icon} size="sm" className="shrink-0 text-success-fg" />
                ) : (
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong text-micro text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                )}
                <span className={cn("min-w-0 flex-1", s.done ? "text-body text-muted-foreground" : "text-body-medium text-foreground")}>
                  {s.title}
                  {s.optional && !s.done && <span className="ml-2 text-caption text-foreground-subtle">optional</span>}
                </span>
                {s.done && <span className="hidden min-w-0 truncate text-caption text-foreground-subtle sm:block">{s.state}</span>}
                <Icon icon={ArrowDown01Icon} size="xs" className={cn("shrink-0 text-foreground-subtle transition-transform motion-fast", isOpen && "rotate-180")} />
              </button>
              {isOpen && <div className="flex flex-col gap-2 pb-4 pl-7 text-body text-muted-foreground">{s.body}</div>}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <span className="text-label text-muted-foreground">Day to day</span>
        <ol className="flex flex-col gap-1">
          {DAILY.map((d, i) => (
            <li key={i} className="flex gap-2 text-body text-muted-foreground">
              <span className="w-4 shrink-0 text-caption text-foreground-subtle tabular-nums">{i + 1}.</span>
              {d}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
