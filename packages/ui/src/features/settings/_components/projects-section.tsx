import { Panel } from "../../../components/ui/panel";
import { Select } from "../../../components/ui/field";
import { Switch } from "../../../components/ui/switch";
import { ago } from "../../../lib/format";
import { useProjects, useSaveSettings } from "../_services/settings-queries";

const MODES: { value: string; label: string; help: string }[] = [
  { value: "off", label: "Off", help: "Nothing is sent to the agent." },
  { value: "advisory", label: "Advisory", help: "Notes are added to the agent's next LLM call." },
  { value: "gate", label: "Gate", help: "Each LLM call waits up to 300 ms for pending checks." },
  { value: "self-check", label: "Self-check", help: "The agent gets a check_my_work tool." },
];

export function ProjectsSection({ hooks }: { hooks: number }) {
  const { data } = useProjects();
  const save = useSaveSettings();
  const projects = data?.projects ?? [];
  return (
    <Panel title="Projects" meta="A project is the SDK's service name (workflow_name)">
      {projects.length === 0 ? (
        <p className="px-4 py-4 text-body text-muted-foreground">Projects appear here after their first run reaches Bolts.</p>
      ) : (
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border text-left text-label text-muted-foreground">
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-4 py-2 font-medium">Runs</th>
              <th className="px-4 py-2 font-medium">Steering</th>
              <th className="px-4 py-2 font-medium">Forward to Cloud</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((p) => (
              <tr key={p.project}>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-body-strong">{p.project}</span>
                    <span className="text-caption text-foreground-subtle">last run {ago(p.last_ms)}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 tabular-nums">
                  {p.runs} <span className="text-caption text-foreground-subtle">({p.with_findings} with findings)</span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col gap-1">
                    <Select
                      aria-label={`Steering for ${p.project}`}
                      className="w-36"
                      value={p.settings.steering}
                      onChange={(e) => save.mutate({ body: { project: p.project, steering: e.target.value }, message: `Steering for ${p.project}: ${e.target.value}` })}
                    >
                      {MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                    <span className="text-caption text-foreground-subtle">{MODES.find((m) => m.value === p.settings.steering)?.help}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <label className="flex items-center gap-2 text-caption text-muted-foreground">
                    <Switch
                      label={`Forward ${p.project} runs to Neatlogs Cloud`}
                      checked={p.settings.forward}
                      onChange={(v) => save.mutate({ body: { project: p.project, forward: v }, message: v ? `Finished ${p.project} runs will be sent to Neatlogs Cloud` : `Forwarding for ${p.project} is off` })}
                    />
                    {p.settings.forward ? "Each finished run" : "Off"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="border-t border-border px-4 py-3 text-caption text-muted-foreground">
        Steering needs the hook in your agent: <span className="font-mono">pip install bolts-steer</span> then <span className="font-mono">bolts_steer.wrap(OpenAI())</span>, or{" "}
        <span className="font-mono">@neatlogs/bolts-steer</span> for TypeScript. Hooks connected now: <span className="tabular-nums">{hooks}</span>.
      </p>
    </Panel>
  );
}
