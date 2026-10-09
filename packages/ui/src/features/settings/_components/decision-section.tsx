import { useEffect, useState } from "react";
import { PendingButton } from "@/components/pending-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import type { Status } from "@/lib/api";
import type { Tone } from "../../runs/_libs/labels";
import { useKeyActions, useLayaAction, useSaveSettings } from "../_services/settings-queries";
import { KeyInput, OptionSelect, SettingField, SettingsPanel } from "./form";

const LAYA_STATE: Record<string, { tone: Tone; label: string }> = {
  running: { tone: "success", label: "Running" },
  installing: { tone: "info", label: "Installing" },
  starting: { tone: "info", label: "Starting" },
  not_installed: { tone: "muted", label: "Not installed" },
  stopped: { tone: "muted", label: "Stopped" },
  disabled: { tone: "muted", label: "Off" },
  failed: { tone: "danger", label: "Failed" },
  external: { tone: "success", label: "External server" },
};

const BACKENDS = [
  { value: "auto", label: "Automatic: Jev cloud if on, else the LLM; Laya takes proven questions" },
  { value: "laya", label: "Laya only" },
  { value: "jev-cloud", label: "Jev cloud only" },
  { value: "jev", label: "A Jev-compatible server at the URL" },
  { value: "llm", label: "The LLM" },
];

/** How far Laya has earned each question, in a box that scrolls. */
function LayaTrust({ trust }: { trust: { question: string; n: number; agreement: number | null; trusted: boolean }[] }) {
  if (!trust.length) return <p className="text-xs text-muted-foreground">Laya is compared with the LLM on every answer; nothing measured yet.</p>;
  const trusted = trust.filter((t) => t.trusted).length;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">
        Laya answers {trusted} of {trust.length} questions on its own
      </span>
      <ul className="flex max-h-40 flex-col overflow-y-auto rounded-lg border border-border">
        {trust.map((t) => (
          <li key={t.question} className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3 text-xs tabular-nums last:border-0">
            <span className="truncate font-mono text-2xs">{t.question}</span>
            <span className={t.trusted ? "shrink-0 text-success-fg" : "shrink-0 text-muted-foreground"}>
              {t.agreement === null ? "–" : `${Math.round(t.agreement * 100)}%`} of {t.n}
              {t.trusted ? " · Laya" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The decision model: Laya on this machine, Jev cloud opt-in, and advanced routing. */
export function DecisionSection({ status }: { status: Status }) {
  const save = useSaveSettings();
  const laya = useLayaAction();
  const jevKey = useKeyActions("/api/classifier/jev-key", "Jev");
  const [backend, setBackend] = useState(status.config.classifier.backend);
  const [clsUrl, setClsUrl] = useState(status.config.classifier.baseUrl);
  useEffect(() => {
    setBackend(status.config.classifier.backend);
  }, [status.config.classifier.backend]);
  const layaState = status.classifier?.laya;
  const ls = LAYA_STATE[layaState?.state ?? "not_installed"] ?? LAYA_STATE.not_installed;
  const jev = status.classifier?.jev_cloud;
  const busy = layaState?.state === "installing" || layaState?.state === "starting";
  return (
    <SettingsPanel
      title="Decision model"
      meta={status.engine?.decision.backend ? `answering now: ${status.engine.decision.backend === "llm" ? "the LLM" : status.engine.decision.backend}` : undefined}
    >
      <p className="text-sm text-muted-foreground">
        Answers each check's yes/no question with a probability. Until Laya has earned a question (90% agreement with the LLM over 30 answers), the LLM answers it.
      </p>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">Laya</span>
            <span className="truncate text-xs text-muted-foreground">421M typed-decision model, local</span>
          </span>
          <StatusPill size="sm" tone={ls.tone}>
            {ls.label}
          </StatusPill>
        </div>
        {layaState?.message && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {busy && <Spinner size="xs" />}
            {layaState.message}
            {layaState.progress != null && <span className="tabular-nums">· {Math.round(layaState.progress * 100)}%</span>}
          </p>
        )}
        <LayaTrust trust={status.classifier?.trust ?? []} />
        {(layaState?.state === "not_installed" || layaState?.state === "failed" || layaState?.state === "disabled") && (
          <div>
            <PendingButton size="sm" variant="secondary" pending={laya.isPending} onClick={() => laya.mutate("install")}>
              Install Laya
            </PendingButton>
          </div>
        )}
        {(layaState?.state === "running" || layaState?.state === "stopped") && (
          <div>
            <PendingButton size="sm" variant="secondary" pending={laya.isPending} onClick={() => laya.mutate("restart")}>
              Restart Laya
            </PendingButton>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">Jev cloud</span>
            <span className="truncate text-xs text-muted-foreground">TypeSafe typed-decision API</span>
          </span>
          <Switch
            aria-label="Use Jev cloud"
            checked={!!jev?.enabled}
            onCheckedChange={(v) => save.mutate({ body: { jev_cloud_enabled: v }, message: v ? "Jev cloud is on; span content is sent to TypeSafe for decisions" : "Jev cloud is off" })}
          />
        </div>
        <p className="text-xs text-warning-fg">When on, the span content a question needs is sent to api.typesafe.ai. Everything else stays local.</p>
        <KeyInput
          id="jev-key"
          label="Jev API key"
          stored={!!jev?.has_key}
          storing={jevKey.store.isPending}
          onStore={(k, done) => jevKey.store.mutate(k, { onSuccess: done })}
          onRemove={() => jevKey.remove.mutate()}
        />
      </div>

      <Collapsible>
        <CollapsibleTrigger className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Advanced: choose the decision model yourself</CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingField label="Which decision model answers" htmlFor="cls-backend">
              <OptionSelect id="cls-backend" className="h-8" value={backend} onValueChange={setBackend} options={BACKENDS} />
            </SettingField>
            <SettingField label="Jev-compatible server URL" htmlFor="cls-url" hint="Used when that server is chosen (POST /v1/systemone).">
              <Input id="cls-url" className="h-8 font-mono text-xs" value={clsUrl} onChange={(e) => setClsUrl(e.target.value)} />
            </SettingField>
          </div>
          <div>
            <PendingButton
              variant="secondary"
              pending={save.isPending}
              onClick={() => save.mutate({ body: { classifier_backend: backend, classifier_url: clsUrl }, message: "Decision model saved" })}
            >
              Save decision model
            </PendingButton>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </SettingsPanel>
  );
}
