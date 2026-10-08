# Architecture

Bolts is one local process (`bolts start`, port 4100) in three layers: capture through the public
SDK, a check orchestrator that runs a model cascade, and the surfaces people and coding agents use.
It follows the "Neatlogs Bolts Architecture" design doc.

```
your agent ── Neatlogs SDK (public) ── OTLP ──► collector ──► store (SQLite + blobs)
     ▲                                                │
     │ notes (claim / SSE)                            ▼
 steering hook ◄──── steering hub ◄──── check orchestrator ──► decision model (Laya / Jev / LLM)
                                                │                local LLM (plan, explain, write)
                     app UI ◄── API + SSE ──────┤
            coding agent ◄── MCP (HTTP, stdio) ─┤
          Neatlogs Cloud ◄── relay (opt-in) ────┘
```

## Code map (`packages/bolts/src`)

| Module | Job |
| --- | --- |
| `otlp/codec.ts` | OTLP protobuf/JSON decode and lossless encode (vendored opentelemetry-proto) |
| `semantics/view.ts` | Span kind, input/output, model, tokens from public `neatlogs.*`, OpenInference and GenAI attributes |
| `store/db.ts`, `store/blobs.ts` | SQLite (WAL): sessions, runs, spans, findings, notes, plans, checks, decisions, explanations, summaries, annotations, forwards; FTS5 search; retention |
| `server/collector.ts`, `server/readback.ts` | `/v1/traces`, `/v1/logs`, doctor read-back |
| `checks/` | YAML check schema (zod), registry, rule evaluation |
| `models/llm.ts` | OpenAI-compatible client with priority queue (urgent notes, high decisions, low investigations) |
| `models/decision.ts` | Jev typed-decision API client; router Laya → custom server → Jev cloud → LLM stand-in |
| `models/laya.ts` | Installs and supervises `laya-serve` on 127.0.0.1 with a per-install token |
| `engine/` | Orchestrator: rules, plans, questions, triage, investigations, notes, summaries, budgets |
| `steering/hub.ts` | Notes per run, atomic claim, gate wait, SSE stream |
| `mcp/` | Tool definitions, streamable HTTP mount, stdio bridge |
| `relay/` | Cloud forwarding, redaction, Keychain |
| `server/api.ts` | App and hook API, security (Host allowlist, Origin check) |

## The cascade

| Job | Done by | When |
| --- | --- | --- |
| Decide which questions to check | local LLM (planner) | first run of a workflow; again when new tools appear |
| Rules | code | every span |
| Answer each planned question | decision model | matching spans as they arrive, and at run end |
| Label each tool result | heuristic, then decision model if ambiguous | every tool span |
| Decide whether a finding needs a closer look | decision model (score 0–4) | every finding; failed runs |
| Investigate and explain | local LLM | triage ≥ 2.5, up to 3 per run (more queue after the run) |
| Write guidance for the running agent | local LLM | when a finding is raised and steering is on |
| Check the LLM's own output | decision model | before a note is sent; on every explanation |
| Summarize a run | local LLM | run end |

## Run end

A run ends when its root span arrives or the SDK's `neatlogs.trace.complete` marker does. Bolts then
runs end-only questions and any live question with unseen evidence, triages failed runs, works off
queued investigations, and writes the summary.

## Security

Bolts binds to 127.0.0.1. A Host allowlist blocks DNS rebinding; state-changing API calls from other
origins are refused; the OTLP routes allow any origin so browser SDKs can send traces. Laya runs on
127.0.0.1 behind a random token. Cloud endpoints set from the app must be `*.neatlogs.com` (or
localhost for testing). Secrets live in the macOS Keychain.

## Public inputs only

Bolts is built from public building blocks: the public Neatlogs SDKs (`neatlogs`, `neatlogs-typescript`)
and their public telemetry schema and doctor contract, OpenTelemetry, MCP, the Jev typed-decision API
as documented publicly, and openly licensed models (Laya, Apache-2.0). Checks, prompts and rules are
written for the local use case. The app UI follows the Neatlogs design language (tokens and design
rules only).
