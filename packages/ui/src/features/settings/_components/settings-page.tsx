import { Settings02Icon } from "@hugeicons/core-free-icons";
import { ListPageLayout } from "@/components/list-page/list-page-layout";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import type { Status } from "@/lib/api";
import { go } from "@/lib/router";
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
  return (
    <ListPageLayout
      icon={<Icon icon={Settings02Icon} />}
      title="Settings"
      tabs={<SegmentedTabs value={tab} onValueChange={(t) => go(`settings/${t}`)} items={[...TABS]} />}
    >
      <div className="flex w-full max-w-4xl flex-col gap-4 px-6 pt-1 pb-10">
        <p className="text-sm text-muted-foreground">{INTRO[tab]}</p>
        {!status ? (
          <EmptyState variant="bordered" state="loading" title="Loading settings" />
        ) : (
          <>
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
          </>
        )}
      </div>
    </ListPageLayout>
  );
}
