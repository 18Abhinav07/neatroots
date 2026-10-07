import type { Status } from "../../../lib/api";
import { AgentsSection, StorageSection } from "./agents-section";
import { CloudSection } from "./cloud-section";
import { ModelsSection } from "./models-section";
import { ProjectsSection } from "./projects-section";

export function SettingsPage({ status }: { status?: Status }) {
  if (!status) return <p className="px-8 py-10 text-body text-muted-foreground">Loading settings…</p>;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display">Settings</h1>
        <p className="text-body text-muted-foreground">Everything stays on this machine unless you send it. Steering and cloud forwarding are opt-in per project.</p>
      </header>
      <ProjectsSection hooks={status.steering.hooks_connected} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <ModelsSection status={status} />
        <div className="flex flex-col gap-6">
          <CloudSection status={status} />
          <AgentsSection port={status.port} />
          <StorageSection status={status} />
        </div>
      </div>
    </div>
  );
}
