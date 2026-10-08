import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ChecksPage } from "../features/checks/_components/checks-page";
import { HomePage } from "../features/home/_components/home-page";
import { appKeys } from "../features/runs/_services/run-keys";
import { RunsPage } from "../features/runs/_components/runs-page";
import { SettingsPage } from "../features/settings/_components/settings-page";
import { api, type Status } from "../lib/api";
import { useLiveEvents } from "../lib/live-events";
import { useLocation } from "../lib/router";
import { useTheme } from "../lib/theme";
import { PushBanner } from "./push-banner";
import { TopBar } from "./top-bar";

export function App() {
  const { parts: route, query } = useLocation();
  const page = route[0] ?? "home";
  const qc = useQueryClient();
  const [theme, setTheme] = useTheme();
  const { connected } = useLiveEvents();
  const { data: status } = useQuery({ queryKey: appKeys.status, queryFn: () => api<Status>("/api/status"), refetchInterval: 10_000 });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar
        page={page}
        status={status}
        connected={connected}
        theme={theme}
        setTheme={setTheme}
        onSettingsChanged={() => void qc.invalidateQueries({ queryKey: appKeys.status })}
      />
      <PushBanner />
      <div className="min-h-0 flex-1">
        {page === "home" ? (
          <main className="h-full overflow-y-auto">
            <HomePage status={status} />
          </main>
        ) : page === "checks" ? (
          <main className="h-full overflow-y-auto">
            <ChecksPage />
          </main>
        ) : page === "settings" ? (
          <main className="h-full overflow-y-auto">
            <SettingsPage status={status} tab={route[1]} />
          </main>
        ) : (
          <RunsPage runId={page === "runs" ? route[1] : undefined} status={status} query={query} />
        )}
      </div>
      <Toaster theme={theme} position="bottom-right" toastOptions={{ className: "font-sans" }} />
    </div>
  );
}
