import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Field, Input, Select } from "../../../components/ui/field";
import { Panel } from "../../../components/ui/panel";
import { SegmentedTabs } from "../../../components/ui/segmented-tabs";
import { StatusPill } from "../../../components/ui/status-pill";
import { Switch } from "../../../components/ui/switch";
import type { LlmInfo, Status } from "../../../lib/api";
import { useLlm, useLlmActions, useSaveSettings } from "../_services/settings-queries";

/**
 * Where the LLM runs: this machine by default, or a hosted provider the user turns on.
 * The LLM plans checks, explains problems, writes notes and summarizes runs.
 */
export function LlmSection({ status }: { status: Status }) {
  const { data: llm, error } = useLlm();
  const [where, setWhere] = useState<"local" | "hosted">("local");
  useEffect(() => {
    if (llm) setWhere(llm.config.enabled ? "hosted" : "local");
  }, [llm?.config.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!llm) {
    return (
      <Panel title="LLM">
        <p className="px-4 py-6 text-body text-muted-foreground">{error ? `Couldn't load the LLM settings: ${(error as Error).message}` : "Loading…"}</p>
      </Panel>
    );
  }
  const active = llm.active === "local" ? `${llm.local.model} on this machine` : llm.active ? `${llm.external?.model} at ${llm.external?.label}` : null;
  return (
    <Panel
      title="LLM"
      meta={active ? `answering now: ${active}` : "no LLM answering; rules still run"}
      actions={
        <SegmentedTabs
          label="Where the LLM runs"
          value={where}
          onValueChange={setWhere}
          size="compact"
          items={[
            { value: "local", label: "This machine" },
            { value: "hosted", label: "Hosted provider" },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-4 px-4 py-4">
        <p className="text-body text-muted-foreground">Plans which questions fit each agent, explains problems, writes notes for the agent and summarizes runs.</p>
        {where === "local" ? <LocalLlm llm={llm} status={status} /> : <HostedLlm llm={llm} />}
      </div>
    </Panel>
  );
}

function LocalLlm({ llm, status }: { llm: LlmInfo; status: Status }) {
  const save = useSaveSettings();
  const actions = useLlmActions();
  const [url, setUrl] = useState(status.config.llm.baseUrl);
  const [model, setModel] = useState(status.config.llm.model);
  return (
    <>
      <div className="flex items-center gap-2 text-body">
        <StatusPill tone={llm.local.ok ? "success" : "warning"}>{llm.local.ok ? "Running" : "Not found"}</StatusPill>
        <span className="min-w-0 truncate text-muted-foreground">
          {llm.local.ok ? (
            <>
              <span className="font-mono text-foreground">{llm.local.model}</span> at {llm.local.baseUrl}
            </>
          ) : (
            `${llm.local.error ?? "unavailable"}. Start Ollama or LM Studio, or use a hosted provider.`
          )}
        </span>
      </div>
      {llm.config.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-subtle px-3 py-2.5">
          <span className="text-body text-foreground">{llm.external?.label} is on. Switch back so nothing is sent to it.</span>
          <Button
            variant="outline"
            pending={actions.save.isPending}
            onClick={() => actions.save.mutate({ body: { enabled: false }, message: "The LLM runs on this machine only" })}
          >
            Use this machine only
          </Button>
        </div>
      )}
      <details className="flex flex-col gap-3">
        <summary className="cursor-pointer text-caption text-muted-foreground">Change the local server</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Server URL" htmlFor="llm-url" hint="Any OpenAI-compatible server: Ollama, LM Studio, llama.cpp, MLX.">
            <Input id="llm-url" className="font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="Model" htmlFor="llm-model" hint={`"auto" picks an installed model for this machine (${status.tier.memoryGb} GB).`}>
            <Input id="llm-model" className="font-mono text-xs" value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <Button variant="outline" pending={save.isPending} onClick={() => save.mutate({ body: { llm_base_url: url, llm_model: model }, message: "Local LLM saved" })}>
            Save local server
          </Button>
        </div>
      </details>
    </>
  );
}

function HostedLlm({ llm }: { llm: LlmInfo }) {
  const actions = useLlmActions();
  const cfg = llm.config;
  const [provider, setProvider] = useState(cfg.provider);
  const preset = llm.providers.find((p) => p.id === provider) ?? llm.providers[0];
  const same = provider === cfg.provider;
  const [model, setModel] = useState(same ? cfg.model || preset.default_model : preset.default_model);
  const [baseUrl, setBaseUrl] = useState(same ? cfg.baseUrl : "");
  const [redact, setRedact] = useState(cfg.redact);
  const [fallback, setFallback] = useState(cfg.fallbackToLocal);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const hasKey = !!preset.key;
  const on = cfg.enabled && same;
  const choose = (id: string) => {
    const p = llm.providers.find((x) => x.id === id);
    setProvider(id);
    setModel(id === cfg.provider ? cfg.model : (p?.default_model ?? ""));
    setBaseUrl(id === cfg.provider ? cfg.baseUrl : "");
    setModels([]);
  };
  const body = { provider, model, base_url: baseUrl, redact, fallback_to_local: fallback };
  const options = [...new Set([...preset.suggested, ...models])];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Provider" htmlFor="ext-provider">
          <Select id="ext-provider" value={provider} onChange={(e) => choose(e.target.value)}>
            {llm.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Model" htmlFor="ext-model" hint={hasKey ? undefined : "Store a key to list this provider's models."}>
          <div className="flex items-center gap-2">
            <Input id="ext-model" list="ext-models" className="font-mono text-xs" placeholder="model id" value={model} onChange={(e) => setModel(e.target.value)} />
            <datalist id="ext-models">
              {options.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {hasKey && same && (
              <Button size="sm" variant="ghost" pending={actions.models.isPending} onClick={() => actions.models.mutate(undefined, { onSuccess: (r) => setModels(r.models) })}>
                List models
              </Button>
            )}
          </div>
        </Field>
      </div>
      {(provider === "custom" || baseUrl) && (
        <Field label="Base URL" htmlFor="ext-url" hint="OpenAI-compatible, ending in /v1 for most servers.">
          <Input id="ext-url" className="font-mono text-xs" placeholder={preset.base_url || "https://…/v1"} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
      )}
      <Field
        label={`${preset.label} API key`}
        htmlFor="ext-key"
        hint={preset.key?.startsWith("env:") ? `Read from $${preset.key.slice(4)}.` : "Stored in the macOS Keychain, never in Bolts' database."}
      >
        <div className="flex items-center gap-2">
          <Input id="ext-key" type="password" placeholder={hasKey ? "Key stored" : "Paste your API key"} value={key} onChange={(e) => setKey(e.target.value)} />
          <Button
            size="sm"
            variant="outline"
            disabled={key.length < 8}
            pending={actions.storeKey.isPending}
            onClick={() => actions.storeKey.mutate({ provider, key }, { onSuccess: () => setKey("") })}
          >
            Store key
          </Button>
          {preset.key === "stored" && (
            <Button size="sm" variant="ghost" className="text-danger-fg" onClick={() => actions.removeKey.mutate(provider)}>
              Remove key
            </Button>
          )}
        </div>
      </Field>
      {preset.key_url && !hasKey && (
        <a className="text-caption text-muted-foreground underline-offset-4 hover:underline" href={preset.key_url} target="_blank" rel="noreferrer">
          Get an API key from {preset.label}
        </a>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Remove before sending" htmlFor="ext-redact">
          <Select id="ext-redact" value={redact} onChange={(e) => setRedact(e.target.value as typeof redact)}>
            <option value="secrets">Secrets: keys, tokens, private keys</option>
            <option value="all">Secrets, emails, phone numbers and your Cloud patterns</option>
            <option value="off">Nothing</option>
          </Select>
        </Field>
        <label className="flex items-center justify-between gap-3 self-end rounded-md bg-surface-subtle px-3 py-2 text-body text-foreground">
          Use the local LLM if {preset.label} fails
          <Switch label="Fall back to the local LLM" checked={fallback} onChange={setFallback} />
        </label>
      </div>
      <p className="text-caption text-warning-fg">
        When on, the run content each LLM task needs is sent to {preset.label}. Rules, stored runs and this app stay on this machine. Removing personal data can make the
        personal-data check miss leaks.
      </p>
      {llm.external?.enabled && same && !llm.external.ok && llm.external.error && <p className="text-caption text-danger-fg">{llm.external.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {on ? (
          <Button variant="outline" pending={actions.save.isPending} onClick={() => actions.save.mutate({ body, message: "Hosted LLM saved" })}>
            Save changes
          </Button>
        ) : (
          <Button
            disabled={!hasKey || !model}
            pending={actions.save.isPending}
            onClick={() => actions.save.mutate({ body: { ...body, enabled: true }, message: `${preset.label} is on` })}
          >
            Use {preset.label}
          </Button>
        )}
        {on && (
          <Button variant="ghost" pending={actions.test.isPending} onClick={() => actions.test.mutate()}>
            Test connection
          </Button>
        )}
        {!hasKey && <span className="text-caption text-foreground-subtle">Store a key first.</span>}
      </div>
    </>
  );
}
