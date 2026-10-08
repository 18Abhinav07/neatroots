import { Settings02Icon } from "@hugeicons/core-free-icons";
import { PageHeader } from "../../../components/ui/page-header";
import { SegmentedTabs } from "../../../components/ui/segmented-tabs";
import type { Status } from "../../../lib/api";
import { go } from "../../../lib/router";
import { AgentsSection, StorageSection } from "./agents-section";
import { CloudSection } from "./cloud-section";
import { DecisionSection } from "./decision-section";
import { LlmSection } from "./llm-section";
import { ProjectsSection } from "./projects-section";

const TABS = [
  { value: "projects", label: "Projects" },
  { value: "models", label: "Models" },
  { value: "cloud", label: "Neatlogs Cloud" },
  { value: "agents", label: "Coding agents" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const INTRO: Record<Tab, string> = {
  projects: "Steering and cloud forwarding are off until you turn them on for a project.",
  models: "Everything runs on this machine unless you turn on a hosted model.",
  cloud: "Nothing is sent to Neatlogs Cloud unless you send a run or turn on forwarding for a project.",
  agents: "Coding agents read runs and findings, and add checks, over MCP.",
};

export function SettingsPage({ status, tab: raw }: { status?: Status; tab?: string }) {
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "projects";
  if (!status) return <p className="px-6 py-10 text-body text-muted-foreground">Loading settings…</p>;
  return (
    <div className="flex flex-col pb-12">
      <PageHeader icon={Settings02Icon} title="Settings" />
      <div className="px-6 pb-3">
        <SegmentedTabs label="Settings section" value={tab} onValueChange={(t) => go(`settings/${t}`)} items={[...TABS]} />
      </div>
      <div className="flex max-w-4xl flex-col gap-6 px-6 pt-3">
        <p className="text-body text-muted-foreground">{INTRO[tab]}</p>
        {tab === "projects" && <ProjectsSection hooks={status.steering.hooks_connected} />}
        {tab === "models" && (
          <>
            <LlmSection status={status} />
            <DecisionSection status={status} />
          </>
        )}
        {tab === "cloud" && <CloudSection status={status} />}
        {tab === "agents" && (
          <>
            <AgentsSection port={status.port} />
            <StorageSection status={status} />
          </>
        )}
      </div>
    </div>
  );
}
