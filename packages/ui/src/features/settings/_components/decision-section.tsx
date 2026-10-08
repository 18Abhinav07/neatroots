import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Field, Input, Select } from "../../../components/ui/field";
import { Panel } from "../../../components/ui/panel";
import { Spinner } from "../../../components/ui/spinner";
import { StatusPill, type Tone } from "../../../components/ui/status-pill";
import { Switch } from "../../../components/ui/switch";
import type { Status } from "../../../lib/api";
import { useKeyActions, useLayaAction, useSaveSettings } from "../_services/settings-queries";

const LAYA_STATE: Record<string, { tone: Tone; label: string }> = {
  running: { tone: "success", label: "Running" },
  installing: { tone: "info", label: "Installing" },
  starting: { tone: "info", label: "Starting" },
  not_installed: { tone: "neutral", label: "Not installed" },
  stopped: { tone: "neutral", label: "Stopped" },
  disabled: { tone: "neutral", label: "Off" },
  failed: { tone: "danger", label: "Failed" },
  external: { tone: "success", label: "External server" },
};

function LayaTrust({ trust }: { trust: { question: string; n: number; agreement: number | null; trusted: boolean }[] }) {
  if (!trust.length) return <p className="text-caption text-foreground-subtle">Laya is compared with the LLM on every answer; nothing measured yet.</p>;
  const trusted = trust.filter((t) => t.trusted).length;
  return (
    <details className="text-caption text-muted-foreground">
      <summary className="cursor-pointer">
        Laya answers {trusted} of {trust.length} questions on its own
      </summary>
      <ul className="mt-2 flex flex-col gap-1">
        {trust.slice(0, 12).map((t) => (
          <li key={t.question} className="flex items-center justify-between gap-3 tabular-nums">
            <span className="truncate font-mono text-3xs">{t.question}</span>
            <span className={t.trusted ? "text-success-fg" : "text-foreground-subtle"}>
              {t.agreement === null ? "—" : `${Math.round(t.agreement * 100)}%`} of {t.n}
              {t.trusted ? " · Laya" : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The decision model: Laya on this machine, Jev cloud opt-in, and advanced routing. */
export function DecisionSection({ status }: { status: Status }) {
  const save = useSaveSettings();
  const laya = useLayaAction();
  const jevKey = useKeyActions("/api/classifier/jev-key", "Jev");
  const [backend, setBackend] = useState(status.config.classifier.backend);
  const [clsUrl, setClsUrl] = useState(status.config.classifier.baseUrl);
  const [key, setKey] = useState("");
  useEffect(() => {
    setBackend(status.config.classifier.backend);
  }, [status.config.classifier.backend]);
  const layaState = status.classifier?.laya;
  const ls = LAYA_STATE[layaState?.state ?? "not_installed"] ?? LAYA_STATE.not_installed;
  const jev = status.classifier?.jev_cloud;
  return (
    <Panel
      title="Decision model"
      meta={status.engine?.decision.backend ? `answering now: ${status.engine.decision.backend === "llm" ? "the LLM" : status.engine.decision.backend}` : undefined}
    >
      <div className="flex flex-col gap-6 px-4 py-4">
        <section className="flex flex-col gap-3">
          <p className="text-body text-muted-foreground">
            Answers each check's yes/no question with a probability. Until Laya has earned a question (90% agreement with the LLM over 30 answers), the LLM answers it.
          </p>
          <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="text-body-strong">Laya</span>
                <span className="text-caption text-foreground-subtle">421M typed-decision model, local</span>
              </span>
              <StatusPill tone={ls.tone}>{ls.label}</StatusPill>
            </div>
            {layaState?.message && (
              <p className="flex items-center gap-2 text-caption text-muted-foreground">
                {(layaState.state === "installing" || layaState.state === "starting") && <Spinner size="xs" label="" />}
                {layaState.message}
                {layaState.progress !== null && layaState.progress !== undefined && <span className="tabular-nums">· {Math.round(layaState.progress * 100)}%</span>}
              </p>
            )}
            <LayaTrust trust={status.classifier?.trust ?? []} />
            <div className="flex flex-wrap gap-2">
              {(layaState?.state === "not_installed" || layaState?.state === "failed" || layaState?.state === "disabled") && (
                <Button size="sm" variant="outline" pending={laya.isPending} onClick={() => laya.mutate("install")}>
                  Install Laya
                </Button>
              )}
              {(layaState?.state === "running" || layaState?.state === "stopped") && (
                <Button size="sm" variant="ghost" pending={laya.isPending} onClick={() => laya.mutate("restart")}>
                  Restart Laya
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="text-body-strong">Jev cloud</span>
                <span className="text-caption text-foreground-subtle">TypeSafe typed-decision API</span>
              </span>
              <Switch
                label="Use Jev cloud"
                checked={!!jev?.enabled}
                onChange={(v) =>
                  save.mutate({ body: { jev_cloud_enabled: v }, message: v ? "Jev cloud is on; span content is sent to TypeSafe for decisions" : "Jev cloud is off" })
                }
              />
            </div>
            <p className="text-caption text-warning-fg">When on, the span content a question needs is sent to api.typesafe.ai. Everything else stays local.</p>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                aria-label="Jev API key"
                placeholder={jev?.has_key ? "Key stored" : "Paste your TypeSafe API key"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={key.length < 8}
                pending={jevKey.store.isPending}
                onClick={() => jevKey.store.mutate(key, { onSuccess: () => setKey("") })}
              >
                Store key
              </Button>
              {jev?.has_key && (
                <Button size="sm" variant="ghost" className="text-danger-fg" onClick={() => jevKey.remove.mutate()}>
                  Remove key
                </Button>
              )}
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-caption text-muted-foreground">Advanced: choose the decision model yourself</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Which decision model answers" htmlFor="cls-backend">
                <Select id="cls-backend" value={backend} onChange={(e) => setBackend(e.target.value)}>
                  <option value="auto">Automatic: Jev cloud if on, else the LLM; Laya takes proven questions</option>
                  <option value="laya">Laya only</option>
                  <option value="jev-cloud">Jev cloud only</option>
                  <option value="jev">A Jev-compatible server at the URL</option>
                  <option value="llm">The LLM</option>
                </Select>
              </Field>
              <Field label="Jev-compatible server URL" htmlFor="cls-url" hint="Used when that server is chosen (POST /v1/systemone).">
                <Input id="cls-url" className="font-mono text-xs" value={clsUrl} onChange={(e) => setClsUrl(e.target.value)} />
              </Field>
            </div>
            <div className="mt-3">
              <Button
                variant="outline"
                pending={save.isPending}
                onClick={() => save.mutate({ body: { classifier_backend: backend, classifier_url: clsUrl }, message: "Decision model saved" })}
              >
                Save decision model
              </Button>
            </div>
          </details>
        </section>
      </div>
    </Panel>
  );
}
