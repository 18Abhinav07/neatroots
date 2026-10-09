import { useState } from "react";
import { PendingButton } from "@/components/pending-button";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import type { Status } from "@/lib/api";
import { ago } from "@/lib/format";
import { useForwards, useKeyActions, useSaveSettings } from "../_services/settings-queries";
import { KeyInput, OptionSelect, SettingField, SettingsPanel } from "./form";

const REGIONS = [
  { value: "https://ingest.neatlogs.com", label: "US · ingest.neatlogs.com" },
  { value: "https://eu.ingest.neatlogs.com", label: "EU · eu.ingest.neatlogs.com" },
];

export function CloudSection({ status }: { status: Status }) {
  const save = useSaveSettings();
  const keys = useKeyActions("/api/cloud/key", "Neatlogs Cloud");
  const { data } = useForwards();
  const [endpoint, setEndpoint] = useState(status.cloud.endpoint);
  const [patterns, setPatterns] = useState("");
  const regions = REGIONS.some((r) => r.value === endpoint) ? REGIONS : [...REGIONS, { value: endpoint, label: endpoint }];
  return (
    <>
      <SettingsPanel title="Neatlogs Cloud" meta={status.cloud.has_key ? "API key stored" : "no API key"}>
        <p className="text-sm text-muted-foreground">
          Neatlogs Bolt sends runs the way the SDK does: OTLP to the public ingest endpoint with your API key. Every send is redacted first and logged below.
        </p>
        <SettingField label="API key from app.neatlogs.com" htmlFor="nl-key" hint="Stored in the macOS Keychain, never in the Neatlogs Bolt database.">
          <KeyInput
            id="nl-key"
            label="Neatlogs Cloud API key"
            stored={status.cloud.has_key}
            storing={keys.store.isPending}
            onStore={(k, done) => keys.store.mutate(k, { onSuccess: done })}
            onRemove={() => keys.remove.mutate()}
          />
        </SettingField>
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingField label="Ingest region" htmlFor="nl-endpoint">
            <OptionSelect id="nl-endpoint" className="h-8" value={endpoint} onValueChange={setEndpoint} options={regions} />
          </SettingField>
          <SettingField label="Extra redaction patterns" htmlFor="nl-patterns" hint="One regex per line. Emails, phone numbers and keys are always redacted.">
            <Textarea id="nl-patterns" rows={2} className="resize-none font-mono text-xs" placeholder="cust_[0-9]+" value={patterns} onChange={(e) => setPatterns(e.target.value)} />
          </SettingField>
        </div>
        <div>
          <PendingButton
            variant="secondary"
            pending={save.isPending}
            onClick={() =>
              save.mutate({
                body: {
                  cloud_endpoint: endpoint,
                  ...(patterns.trim()
                    ? {
                        redact_patterns: patterns
                          .split("\n")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      }
                    : {}),
                },
                message: "Cloud settings saved",
              })
            }
          >
            Save cloud settings
          </PendingButton>
        </div>
      </SettingsPanel>
      {!!data?.forwards.length && (
        <SettingsPanel title="Recent sends" meta={`${data.forwards.length}`}>
          <ul className="-mx-6 -mb-6 flex max-h-72 flex-col overflow-y-auto border-t border-border">
            {data.forwards.map((f) => (
              <li key={f.id} className="flex h-11 shrink-0 items-center gap-3 border-b border-border/60 px-6 text-xs text-muted-foreground tabular-nums last:border-0" title={f.error ?? undefined}>
                <StatusPill size="sm" tone={f.status === "ok" ? "success" : "danger"}>
                  {f.status === "ok" ? "Sent" : "Failed"}
                </StatusPill>
                <span className="min-w-0 flex-1 truncate font-mono">{f.trace_ids.map((t) => t.slice(0, 8)).join(", ")}</span>
                <span className="shrink-0">{f.span_count} spans</span>
                <span className="hidden shrink-0 sm:inline">{f.redactions} redacted</span>
                <span className="w-20 shrink-0 text-right">{ago(f.created_ms)}</span>
              </li>
            ))}
          </ul>
        </SettingsPanel>
      )}
    </>
  );
}
