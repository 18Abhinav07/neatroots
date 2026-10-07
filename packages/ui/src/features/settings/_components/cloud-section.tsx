import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Field, Input, Select, Textarea } from "../../../components/ui/field";
import { Panel } from "../../../components/ui/panel";
import { StatusPill } from "../../../components/ui/status-pill";
import type { Status } from "../../../lib/api";
import { ago } from "../../../lib/format";
import { useForwards, useKeyActions, useSaveSettings } from "../_services/settings-queries";

export function CloudSection({ status }: { status: Status }) {
  const save = useSaveSettings();
  const keys = useKeyActions("/api/cloud/key", "Neatlogs Cloud");
  const { data } = useForwards();
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState(status.cloud.endpoint);
  const [patterns, setPatterns] = useState("");
  return (
    <Panel title="Neatlogs Cloud" meta={status.cloud.has_key ? "API key stored" : "No API key"}>
      <div className="flex flex-col gap-4 px-4 py-4">
        <p className="text-body text-muted-foreground">
          Bolts sends runs the way the SDK does: OTLP to the public ingest endpoint with your API key. Every send is redacted first and logged below. Nothing is sent unless you send it or turn on forwarding for a project.
        </p>
        <Field label="API key from app.neatlogs.com" htmlFor="nl-key" hint="Stored in the macOS Keychain, never in Bolts' database.">
          <div className="flex items-center gap-2">
            <Input id="nl-key" type="password" placeholder={status.cloud.has_key ? "Key stored" : "Paste your API key"} value={key} onChange={(e) => setKey(e.target.value)} />
            <Button size="sm" variant="outline" disabled={key.length < 8} pending={keys.store.isPending} onClick={() => keys.store.mutate(key, { onSuccess: () => setKey("") })}>
              Store key
            </Button>
            {status.cloud.has_key && (
              <Button size="sm" variant="ghost" className="text-danger-fg" onClick={() => keys.remove.mutate()}>
                Remove key
              </Button>
            )}
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ingest region" htmlFor="nl-endpoint">
            <Select id="nl-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
              <option value="https://ingest.neatlogs.com">US · ingest.neatlogs.com</option>
              <option value="https://eu.ingest.neatlogs.com">EU · eu.ingest.neatlogs.com</option>
              {!endpoint.includes("neatlogs.com") && <option value={endpoint}>{endpoint}</option>}
            </Select>
          </Field>
          <Field label="Extra redaction patterns" htmlFor="nl-patterns" hint="One regex per line. Emails, phone numbers and keys are always redacted.">
            <Textarea id="nl-patterns" mono rows={2} placeholder="cust_[0-9]+" value={patterns} onChange={(e) => setPatterns(e.target.value)} />
          </Field>
        </div>
        <div>
          <Button
            variant="outline"
            pending={save.isPending}
            onClick={() =>
              save.mutate({
                body: { cloud_endpoint: endpoint, ...(patterns.trim() ? { redact_patterns: patterns.split("\n").map((x) => x.trim()).filter(Boolean) } : {}) },
                message: "Cloud settings saved",
              })
            }
          >
            Save cloud settings
          </Button>
        </div>
        {!!data?.forwards.length && (
          <div className="flex flex-col gap-1.5 border-t border-border pt-4">
            <span className="text-label text-muted-foreground">Recent sends</span>
            {data.forwards.slice(0, 8).map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground tabular-nums">
                <StatusPill tone={f.status === "ok" ? "success" : "danger"}>{f.status === "ok" ? "Sent" : "Failed"}</StatusPill>
                <span className="font-mono">{f.trace_ids.map((t) => t.slice(0, 8)).join(", ")}</span>
                <span>{f.span_count} spans</span>
                <span>{f.redactions} redacted</span>
                <span className="text-foreground-subtle">{ago(f.created_ms)}</span>
                {f.error && <span className="w-full text-danger-fg">{f.error.slice(0, 160)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
