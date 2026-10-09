import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ago } from "@/lib/format";
import { useProjects, useSaveSettings } from "../_services/settings-queries";
import { OptionSelect, SettingsPanel } from "./form";

const MODES: { value: string; label: string; help: string }[] = [
  { value: "off", label: "Off", help: "Nothing is sent to the agent." },
  { value: "advisory", label: "Advisory", help: "Notes go into the agent's next LLM call." },
  { value: "gate", label: "Gate", help: "LLM calls wait up to 300 ms for checks." },
  { value: "self-check", label: "Self-check", help: "The agent gets a check_my_work tool." },
];

const HEAD = "h-9 px-3 text-eyebrow font-normal text-muted-foreground";

export function ProjectsSection({ hooks, steerPython, steerTs }: { hooks: number; steerPython?: string | null; steerTs?: string | null }) {
  const { data } = useProjects();
  const save = useSaveSettings();
  const projects = data?.projects ?? [];
  return (
    <SettingsPanel title="Projects" meta="a project is the SDK's workflow_name">
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Projects appear here after their first run reaches neatroots.</p>
      ) : (
        <div className="-mx-6 max-h-[28rem] overflow-auto border-y border-border">
          <Table className="min-w-[44rem] table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-surface-subtle">
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className={`${HEAD} pl-6`}>Project</TableHead>
                <TableHead className={`${HEAD} w-28 text-right`}>Runs</TableHead>
                <TableHead className={`${HEAD} w-64`}>Steering</TableHead>
                <TableHead className={`${HEAD} w-44 pr-6 whitespace-nowrap`}>Forward to Cloud</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.project} className="h-16 hover:bg-transparent">
                  <TableCell className="px-3 pl-6">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-foreground">{p.project}</span>
                      <span className="text-xs text-muted-foreground">last run {ago(p.last_ms)}</span>
                    </span>
                  </TableCell>
                  <TableCell className="px-3 text-right text-sm tabular-nums">
                    <span className="flex flex-col">
                      {p.runs}
                      <span className="text-xs text-muted-foreground">{p.with_findings} with findings</span>
                    </span>
                  </TableCell>
                  <TableCell className="px-3">
                    <span className="flex flex-col gap-1">
                      <OptionSelect
                        label={`Steering for ${p.project}`}
                        className="h-8 w-36"
                        value={p.settings.steering}
                        onValueChange={(v) => save.mutate({ body: { project: p.project, steering: v }, message: `Steering for ${p.project}: ${v}` })}
                        options={MODES}
                      />
                      <span className="truncate text-xs text-muted-foreground">{MODES.find((m) => m.value === p.settings.steering)?.help}</span>
                    </span>
                  </TableCell>
                  <TableCell className="px-3 pr-6">
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        aria-label={`Forward ${p.project} runs to Neatlogs Cloud`}
                        checked={p.settings.forward}
                        onCheckedChange={(v) =>
                          save.mutate({
                            body: { project: p.project, forward: v },
                            message: v ? `Finished ${p.project} runs will be sent to Neatlogs Cloud` : `Forwarding for ${p.project} is off`,
                          })
                        }
                      />
                      {p.settings.forward ? "Each finished run" : "Off"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Steering needs the hook in your agent: <span className="font-mono">pip install {steerPython ?? "~/.neatroots/app/steer/python/neatroots-steer"}</span> then{" "}
        <span className="font-mono">neatroots_steer.wrap(OpenAI())</span>, or <span className="font-mono">npm install {steerTs ?? "~/.neatroots/app/steer/ts"}</span> for TypeScript.
        Hooks connected now: <span className="tabular-nums">{hooks}</span>.
      </p>
    </SettingsPanel>
  );
}
