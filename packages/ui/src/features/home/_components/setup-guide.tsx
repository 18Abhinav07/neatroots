import { ArrowDown01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useState, type ReactNode } from "react";
import { CodeLine } from "@/components/code-line";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Panel, PanelContent, PanelHeader } from "@/components/ui/panel";
import type { ProjectRow, Status } from "@/lib/api";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

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
      title: "Send your agent's runs to Neatlogs Bolt",
      done: status.stats.runs > 0,
      state: `${status.stats.runs.toLocaleString()} runs from ${names.length} project${names.length === 1 ? "" : "s"}${names.length ? ` (${names.slice(0, 3).join(", ")})` : ""}`,
      body: (
        <>
          <p>Neatlogs Bolt reads what the Neatlogs SDK already sends. Set two variables where your agent runs; no code change is needed.</p>
          <CodeLine text={`export NEATLOGS_ENDPOINT=http://localhost:${port}\nexport NEATLOGS_API_KEY=neatbolt-local`} />
          <p>Not using the SDK yet? Add it and name your agent; that name becomes the project here.</p>
          <CodeLine text={`neatlogs.init(workflow_name="my-agent", flush_interval=0.5)`} />
        </>
      ),
    },
    {
      id: "llm",
      short: "LLM",
      title: "Give Neatlogs Bolt an LLM to ask questions with",
      done: !!llm?.ok,
      state: llm?.ok ? `${llm.model}${hosted ? ` (hosted: ${llm.where})` : " on this machine"}` : "",
      body: (
        <>
          <p>Rules run without one. An LLM lets it pick the questions that fit your agent, explain problems and summarize runs. Run one locally:</p>
          <CodeLine text="ollama pull qwen3:8b" />
          <p>
            Or use a hosted model (opt-in; run content is sent to it): <span className="font-mono">neatbolt llm use anthropic</span>, or{" "}
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
      title: "Let your coding agent read what Neatlogs Bolt finds",
      optional: true,
      done: !!status.mcp?.last_seen_ms,
      state: status.mcp?.last_seen_ms ? `a coding agent last asked ${ago(status.mcp.last_seen_ms)}` : "",
      body: (
        <>
          <p>Claude Code, Cursor or Codex can read your runs and findings, fix the problem and add a check so it is caught next time.</p>
          <CodeLine text="claude mcp add --scope user neatbolt -- neatbolt mcp" />
          <p>Then ask it: “Fix what Bolt found in my last run.”</p>
        </>
      ),
    },
    {
      id: "steering",
      short: "Steering",
      title: "Let Neatlogs Bolt nudge the agent while it runs",
      optional: true,
      done: steered.length > 0,
      state: steered.length ? `on for ${steered.map((p) => `${p.project} (${p.settings.steering})`).join(", ")}` : "",
      body: (
        <>
          <p>When a check fires mid-run, Neatlogs Bolt can add a short note to the agent's next LLM call. It needs a small hook in your agent.</p>
          <CodeLine text={`pip install ~/.neatbolt/src/python/neatbolt-steer\nneatbolt steering advisory --project ${names[0] ?? "my-agent"}`} />
          <p>
            Then wrap your client: <span className="font-mono">client = neatbolt_steer.wrap(OpenAI())</span>. Turn it on per project in{" "}
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
          <p>Send a run you want to keep or show your team. Neatlogs Bolt removes secrets and personal data first, and sends nothing unless you ask.</p>
          <CodeLine text="neatbolt cloud login" />
        </>
      ),
    },
  ];
}

const DAILY = [
  "Run your agent as usual. Neatlogs Bolt checks every run as it happens.",
  "Start here: see what is failing more or less often, and which tools and checks are behind it.",
  "Open a problem to see the cause, the suggested fix and the span that shows it, or ask your coding agent to fix it.",
  "Dismiss findings that are wrong. Neatlogs Bolt counts them, so noisy checks show up.",
];

/**
 * How to use Neatlogs Bolt, as steps checked against what is actually set up. Expanded while the
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
      <div className="flex h-12 items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle px-4">
        <span className="flex min-w-0 items-center gap-x-4 overflow-hidden text-xs text-muted-foreground">
          {list.map((s) => (
            <span key={s.id} className="inline-flex shrink-0 items-center gap-1.5">
              <Icon icon={CheckmarkCircle02Icon} size="xs" className={s.done ? "text-success-fg" : "text-muted-foreground/40"} />
              {s.short}
            </span>
          ))}
        </span>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setOpen(true)}>
          Show setup steps
        </Button>
      </div>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="How to use Neatlogs Bolt"
        actions={
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {doneCount} of {list.length} set up
            </span>
            {essentialsDone && (
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Hide steps
              </Button>
            )}
          </span>
        }
      />
      <PanelContent className="flex flex-col gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Neatlogs Bolt checks your agent's runs on this machine: rules on every step, questions the LLM picks for your agent, and an explanation when something goes
          wrong. Nothing leaves this machine unless you turn it on.
        </p>
        <ol className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
          {list.map((s, i) => {
            const isOpen = current === s.id;
            return (
              <li key={s.id} className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setActive(isOpen ? "" : s.id)}
                  className="flex h-11 w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none"
                >
                  {s.done ? (
                    <Icon icon={CheckmarkCircle02Icon} size="sm" className="shrink-0 text-success-fg" />
                  ) : (
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong text-3xs text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                  )}
                  <span className={cn("min-w-0 flex-1 truncate text-sm", s.done ? "text-muted-foreground" : "text-foreground")}>
                    {s.title}
                    {s.optional && !s.done && <span className="ml-2 text-xs text-muted-foreground">optional</span>}
                  </span>
                  {s.done && <span className="hidden max-w-[45%] min-w-0 truncate text-xs text-muted-foreground sm:block">{s.state}</span>}
                  <Icon icon={ArrowDown01Icon} size="xs" className={cn("shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && <div className="flex flex-col gap-2 px-4 pb-4 pl-11 text-sm text-muted-foreground">{s.body}</div>}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-1.5">
          <span className="text-eyebrow text-muted-foreground">Day to day</span>
          <ol className="flex flex-col gap-1">
            {DAILY.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="w-4 shrink-0 text-xs tabular-nums">{i + 1}.</span>
                {d}
              </li>
            ))}
          </ol>
        </div>
      </PanelContent>
    </Panel>
  );
}
