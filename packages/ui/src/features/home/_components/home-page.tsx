import { Calendar03Icon, Home01Icon } from "@hugeicons/core-free-icons";
import { PageHeader } from "../../../components/ui/page-header";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia } from "../../../components/ui/empty";
import { SegmentedTabs } from "../../../components/ui/segmented-tabs";
import type { InsightWindow, Status } from "../../../lib/api";
import { useProjects } from "../../settings/_services/settings-queries";
import { useInsights } from "../_services/home-queries";
import { DigestCard } from "./digest-card";
import { Health } from "./health";
import { Activity, Kpis, PERIOD } from "./overview";
import { ProjectsTable } from "./projects-table";
import { SetupGuide } from "./setup-guide";

const KEY = "bolts-home-window";

function savedWindow(): InsightWindow {
  try {
    const v = localStorage.getItem(KEY);
    return v === "24h" || v === "7d" || v === "30d" ? v : "7d";
  } catch {
    return "7d";
  }
}

/** Home: how to use Bolts, and how the agents have been doing over a period. */
export function HomePage({ status }: { status?: Status }) {
  const [win, setWin] = useState<InsightWindow>(savedWindow);
  const { data, error } = useInsights(win);
  const { data: projects } = useProjects();
  const choose = (w: InsightWindow) => {
    setWin(w);
    try {
      localStorage.setItem(KEY, w);
    } catch {
      /* the choice just isn't remembered */
    }
  };
  const everReceived = (status?.stats.runs ?? 0) > 0;

  return (
    <div className="flex flex-col pb-12">
      <PageHeader
        icon={Home01Icon}
        title="Home"
        actions={
          everReceived && (
            <SegmentedTabs
              label="Period"
              size="compact"
              value={win}
              onValueChange={choose}
              items={[
                { value: "24h", label: "24 hours" },
                { value: "7d", label: "7 days" },
                { value: "30d", label: "30 days" },
              ]}
            />
          )
        }
      />
      <div className="flex flex-col gap-8 px-6 pt-2">
        {status && <SetupGuide status={status} projects={projects?.projects ?? []} />}

        {error && <p className="text-body text-muted-foreground">Couldn't load insights: {(error as Error).message}</p>}

        {everReceived && data && data.totals.runs === 0 && (
          <Empty className="py-10">
            <EmptyMedia icon={Calendar03Icon} />
            <EmptyHeader title={`No runs in the last ${PERIOD[win]}`} description="Insights cover runs that started in this period. Older runs are still on the Runs page." />
            {win !== "30d" && (
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={() => choose("30d")}>
                  Show the last 30 days
                </Button>
              </EmptyContent>
            )}
          </Empty>
        )}

        {data && data.totals.runs > 0 && (
          <>
            <Kpis data={data} />
            <DigestCard data={data} llmOk={status ? !!status.engine?.llm.ok : undefined} />
            <Health data={data} />
            <Activity data={data} />
            <ProjectsTable data={data} />
          </>
        )}
      </div>
    </div>
  );
}
