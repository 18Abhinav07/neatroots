import { Activity01Icon, CheckListIcon, ComputerIcon, FlashIcon, Moon02Icon, Settings02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { toast } from "sonner";
import { Icon } from "../components/ui/icon";
import { Spinner } from "../components/ui/spinner";
import { StatusDot } from "../components/ui/status-pill";
import { Switch } from "../components/ui/switch";
import { post, type Status } from "../lib/api";
import { cn } from "../lib/cn";
import type { ThemeChoice } from "../lib/theme";

const NAV: { href: string; page: string; label: string; icon: IconSvgElement }[] = [
  { href: "#/runs", page: "runs", label: "Runs", icon: Activity01Icon },
  { href: "#/checks", page: "checks", label: "Checks", icon: CheckListIcon },
  { href: "#/settings", page: "settings", label: "Settings", icon: Settings02Icon },
];

export function Sidebar({
  page,
  status,
  connected,
  theme,
  setTheme,
  onSettingsChanged,
}: {
  page: string;
  status?: Status;
  connected: boolean;
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  onSettingsChanged: () => void;
}) {
  const engine = status?.engine;
  const hosted = engine?.llm.where && engine.llm.where !== "local";
  const decisions: Record<string, string> = { laya: "Laya", jev: "Jev", "jev-cloud": "Jev cloud", llm: "the LLM" };
  const models = !status ? "checking…" : engine?.llm.ok ? `${engine.llm.model}${hosted ? " (hosted)" : ""}` : "no LLM";
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar max-md:w-14">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-inverse-surface text-inverse-surface-foreground">
          <Icon icon={FlashIcon} size="xxs" />
        </span>
        <span className="text-title max-md:hidden">Bolts</span>
        <span className="font-mono text-3xs text-foreground-subtle max-md:hidden">{status ? `v${status.version}` : ""}</span>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
        {NAV.map((n) => (
          <a
            key={n.page}
            href={n.href}
            aria-current={page === n.page ? "page" : undefined}
            className={cn(
              "focus-ring flex h-8 items-center gap-2.5 rounded-md px-2.5 text-body-medium transition-colors motion-fast",
              page === n.page ? "bg-surface-active text-foreground" : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
            )}
          >
            <Icon icon={n.icon} size="sm" />
            <span className="max-md:hidden">{n.label}</span>
          </a>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3 border-t border-sidebar-border px-4 py-4 max-md:hidden">
        <div className="flex flex-col gap-2 text-caption">
          <span className="flex items-center gap-2 text-muted-foreground">
            <StatusDot tone={connected ? "success" : "danger"} label={connected ? "Live updates connected" : "Reconnecting to Bolts"} />
            {connected ? "Live" : "Reconnecting…"}
          </span>
          <a
            href="#/settings/models"
            className="focus-ring -mx-1 flex items-center gap-2 rounded-sm px-1 text-muted-foreground hover:text-foreground"
            title={engine?.llm.ok ? `Questions are answered by ${decisions[engine.decision.backend ?? ""] ?? "nothing yet"}` : (engine?.llm.error ?? "No LLM: rules still run")}
          >
            <StatusDot tone={!status ? "neutral" : engine?.llm.ok ? "success" : "warning"} label={engine?.llm.ok ? "LLM available" : "No LLM"} />
            <span className="min-w-0 truncate font-mono text-foreground">{models}</span>
            {!!engine?.llm.busy && <Spinner size="xs" label="The LLM is working" />}
          </a>
        </div>
        {status && (
          <label className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
            Steering
            <Switch
              label="Steering for all projects"
              checked={status.steering.enabled}
              onChange={async (v) => {
                await post("/api/settings", { steering_enabled: v });
                toast.success(v ? "Steering is on for projects that enabled it" : "Steering is off everywhere; nothing is sent to agents");
                onSettingsChanged();
              }}
            />
          </label>
        )}
        <div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
          {(
            [
              ["system", ComputerIcon, "System theme"],
              ["light", Sun03Icon, "Light theme"],
              ["dark", Moon02Icon, "Dark theme"],
            ] as const
          ).map(([value, icon, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              aria-label={label}
              title={label}
              onClick={() => setTheme(value)}
              className={cn(
                "focus-ring flex h-6 flex-1 cursor-pointer items-center justify-center rounded-sm",
                theme === value ? "bg-card text-foreground elevation-card" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon icon={icon} size="xxs" />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
