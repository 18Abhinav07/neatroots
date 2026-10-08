import { ComputerIcon, FlashIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Icon } from "../components/ui/icon";
import { Spinner } from "../components/ui/spinner";
import { StatusDot } from "../components/ui/status-pill";
import { Switch } from "../components/ui/switch";
import { post, type Status } from "../lib/api";
import { cn } from "../lib/cn";
import type { ThemeChoice } from "../lib/theme";

const NAV = [
  { href: "#/home", page: "home", label: "Home" },
  { href: "#/runs", page: "runs", label: "Runs" },
  { href: "#/checks", page: "checks", label: "Checks" },
  { href: "#/settings", page: "settings", label: "Settings" },
];

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON = { system: ComputerIcon, light: Sun03Icon, dark: Moon02Icon };

/** The one bar across the top: where you are, and whether Bolts is live and has a model. */
export function TopBar({
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
  const llm = status?.engine?.llm;
  const hosted = llm?.where && llm.where !== "local";
  return (
    <header className="flex h-12 shrink-0 items-center gap-6 border-b border-border/60 bg-background px-4">
      <a href="#/home" className="focus-ring flex items-center gap-2 rounded-md">
        <span className="flex size-6 items-center justify-center rounded-md bg-inverse-surface text-inverse-surface-foreground">
          <Icon icon={FlashIcon} size="xxs" />
        </span>
        <span className="text-body-medium text-foreground">Bolts</span>
      </a>
      <nav aria-label="Main" className="flex items-center gap-1">
        {NAV.map((n) => (
          <a
            key={n.page}
            href={n.href}
            aria-current={page === n.page ? "page" : undefined}
            className={cn(
              "focus-ring flex h-7 items-center rounded-md border px-2.5 text-body transition-colors motion-fast",
              page === n.page ? "border-border bg-surface-subtle font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {n.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-4 text-caption text-muted-foreground max-md:hidden">
        <span className="flex items-center gap-1.5" title={connected ? "Live updates connected" : "Reconnecting to Bolts"}>
          <StatusDot tone={connected ? "success" : "danger"} label={connected ? "Live" : "Reconnecting"} />
          {connected ? "Live" : "Reconnecting…"}
        </span>
        <a href="#/settings/models" className="focus-ring flex items-center gap-1.5 rounded-sm hover:text-foreground" title={llm?.error ?? "Where LLM work runs"}>
          <StatusDot tone={!status ? "neutral" : llm?.ok ? "success" : "warning"} label="LLM" />
          <span className="max-w-48 truncate font-mono">{!status ? "…" : llm?.ok ? llm.model : "no LLM"}</span>
          {hosted && <span className="text-foreground-subtle">hosted</span>}
          {!!llm?.busy && <Spinner size="xs" label="The LLM is working" />}
        </a>
        {status && (
          <label className="flex items-center gap-2">
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
      </div>
      <Button
        variant="muted"
        size="icon-sm"
        className="max-md:ml-auto"
        aria-label={`Theme: ${theme}. Switch to ${NEXT[theme]}`}
        title={`Theme: ${theme}`}
        onClick={() => setTheme(NEXT[theme])}
      >
        <Icon icon={THEME_ICON[theme]} size="xs" />
      </Button>
    </header>
  );
}
