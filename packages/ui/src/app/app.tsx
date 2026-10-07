import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ChecksPage } from "../features/checks/_components/checks-page";
import { appKeys } from "../features/runs/_services/run-keys";
import { RunsPage } from "../features/runs/_components/runs-page";
import { SettingsPage } from "../features/settings/_components/settings-page";
import { api, type Status } from "../lib/api";
import { useLiveEvents } from "../lib/live-events";
import { useRoute } from "../lib/router";
import { useTheme } from "../lib/theme";
import { PushBanner } from "./push-banner";
import { Sidebar } from "./sidebar";

export function App() {
  const route = useRoute();
  const page = route[0] ?? "runs";
  const qc = useQueryClient();
  const [theme, setTheme] = useTheme();
  const { connected } = useLiveEvents();
  const { data: status } = useQuery({ queryKey: appKeys.status, queryFn: () => api<Status>("/api/status"), refetchInterval: 10_000 });

  return (
    <div className="flex h-full">
      <Sidebar
        page={page}
        status={status}
        connected={connected}
        theme={theme}
        setTheme={setTheme}
        onSettingsChanged={() => void qc.invalidateQueries({ queryKey: appKeys.status })}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <PushBanner />
        <div className="grid min-h-0 flex-1">
          {page === "checks" ? (
            <main className="min-h-0 overflow-y-auto">
              <ChecksPage />
            </main>
          ) : page === "settings" ? (
            <main className="min-h-0 overflow-y-auto">
              <SettingsPage status={status} />
            </main>
          ) : (
            <RunsPage runId={page === "runs" ? route[1] : undefined} status={status} />
          )}
        </div>
      </div>
      <Toaster theme={theme} position="bottom-right" toastOptions={{ className: "font-sans" }} />
    </div>
  );
}
