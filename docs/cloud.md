# Neatlogs Cloud

Bolts reaches Neatlogs Cloud the way any SDK does: OTLP/protobuf to the public ingest endpoint
(`https://ingest.neatlogs.com/v1/traces`, or `eu.ingest.neatlogs.com`) with your own `x-api-key`.
It needs no private API.

## Compatibility

- **Ingest.** Bolts accepts exactly what the SDKs send to the cloud: `POST /v1/traces` (protobuf or
  JSON, gzip, `x-api-key`), `/v1/logs`, and the doctor read-back `GET /api/traces/v3/:traceId`, so
  `neatlogs doctor --probe` passes against Bolts. Changing `NEATLOGS_ENDPOINT` is the only switch
  between Bolts and the cloud.
- **Storage.** Spans are stored losslessly in their OTLP form: resource and scope, typed attribute
  values (int64 kept as decimal strings, int vs double, bytes), events, links, status, trace state.
  Large values go to content-addressed blob files and are restored on read.
- **Forwarding.** A forward re-encodes the stored spans as an `ExportTraceServiceRequest` and sends
  them first, then each trace's `neatlogs.trace.complete` marker in a second request, as the SDKs do.
  A run without a marker (interrupted) gets one synthesized under its root.
- **Findings.** Bolts adds `bolts.findings` (JSON) and `bolts.finding.checks` to evidence spans, and
  `bolts.findings.count`, `bolts.run.summary` and `bolts.run.explanation` to the root. How the cloud
  shows them is a contract still to agree with the Neatlogs team.

The relay is tested end to end by forwarding into a second Bolts instance and comparing spans.

## Sending

- One run: **Send run to Cloud** in the app, or `bolts cloud forward <trace-id>`.
- Every finished run of a project: Settings → Projects → Forward to Cloud, or
  `bolts cloud auto <project> on`.
- From a coding agent: `push_to_cloud` asks; you confirm in the app before anything is sent.

Before each send Bolts shows a redaction preview. Emails, phone numbers, API keys, bearer tokens and
private keys are always redacted; add your own patterns in Settings. The SDK's own `mask` and PII
options still apply first, in your process. Every send is logged (Settings → Neatlogs Cloud).

The API key is stored in the macOS Keychain (`bolts cloud login`), never in the database.
