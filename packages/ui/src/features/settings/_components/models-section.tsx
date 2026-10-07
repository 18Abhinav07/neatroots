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

export function ModelsSection({ status }: { status: Status }) {
  const save = useSaveSettings();
  const laya = useLayaAction();
  const jevKey = useKeyActions("/api/classifier/jev-key", "Jev");
  const [llmUrl, setLlmUrl] = useState(status.config.llm.baseUrl);
  const [llmModel, setLlmModel] = useState(status.config.llm.model);
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
    <Panel title="Models" meta={`${status.tier.memoryGb} GB memory · ${status.tier.tier} tier`}>
      <div className="flex flex-col gap-6 px-4 py-4">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-title">Decision model</h3>
              <p className="text-caption text-muted-foreground">Answers every typed question with a probability. Laya runs on this machine; Jev cloud is opt-in.</p>
            </div>
          </div>
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
              <Switch label="Use Jev cloud" checked={!!jev?.enabled} onChange={(v) => save.mutate({ body: { jev_cloud_enabled: v }, message: v ? "Jev cloud is on; span content is sent to TypeSafe for decisions" : "Jev cloud is off" })} />
            </div>
            <p className="text-caption text-warning-fg">When on, the span content a question needs is sent to api.typesafe.ai. Everything else stays local.</p>
            <div className="flex items-center gap-2">
              <Input type="password" aria-label="Jev API key" placeholder={jev?.has_key ? "Key stored" : "Paste your TypeSafe API key"} value={key} onChange={(e) => setKey(e.target.value)} />
              <Button size="sm" variant="outline" disabled={key.length < 8} pending={jevKey.store.isPending} onClick={() => jevKey.store.mutate(key, { onSuccess: () => setKey("") })}>
                Store key
              </Button>
              {jev?.has_key && (
                <Button size="sm" variant="ghost" className="text-danger-fg" onClick={() => jevKey.remove.mutate()}>
                  Remove key
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Which decision model answers" htmlFor="cls-backend">
              <Select id="cls-backend" value={backend} onChange={(e) => setBackend(e.target.value)}>
                <option value="auto">Automatic: Laya, then Jev cloud if on, then the LLM</option>
                <option value="laya">Laya only</option>
                <option value="jev-cloud">Jev cloud only</option>
                <option value="jev">A Jev-compatible server at the URL below</option>
                <option value="llm">The local LLM</option>
              </Select>
            </Field>
            <Field label="Jev-compatible server URL" htmlFor="cls-url" hint="Used when the server above is chosen (POST /v1/systemone).">
              <Input id="cls-url" className="font-mono text-xs" value={clsUrl} onChange={(e) => setClsUrl(e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-title">Local LLM</h3>
            <p className="text-caption text-muted-foreground">{status.tier.description}. Any OpenAI-compatible server works: Ollama, LM Studio, llama.cpp, MLX.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Server URL" htmlFor="llm-url">
              <Input id="llm-url" className="font-mono text-xs" value={llmUrl} onChange={(e) => setLlmUrl(e.target.value)} />
            </Field>
            <Field label="Model" htmlFor="llm-model" hint={'"auto" picks an installed model for this machine.'}>
              <Input id="llm-model" className="font-mono text-xs" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} />
            </Field>
          </div>
          <p className="text-caption text-muted-foreground">
            Now: LLM {status.engine?.llm.ok ? <span className="font-mono text-foreground">{status.engine.llm.model}</span> : `unavailable (${status.engine?.llm.error ?? "unknown"})`} · decisions{" "}
            <span className="font-mono text-foreground">{status.engine?.decision.backend ?? "unavailable"}</span>
          </p>
        </section>
        <div>
          <Button
            variant="outline"
            pending={save.isPending}
            onClick={() => save.mutate({ body: { llm_base_url: llmUrl, llm_model: llmModel, classifier_backend: backend, classifier_url: clsUrl }, message: "Model settings saved" })}
          >
            Save model settings
          </Button>
        </div>
      </div>
    </Panel>
  );
}
