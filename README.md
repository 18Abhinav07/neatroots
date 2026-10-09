# Neatlogs Bolt

Bolt checks AI agents while they run on your machine. Traces come from the public
[Neatlogs SDKs](https://github.com/neatlogs/neatlogs); local models check every run; and nothing
leaves your computer unless you send it.

- **Rules** run in code on every span: repeated identical tool calls, error streaks, runaway loops,
  leaked keys, failed or empty runs.
- **A decision model** answers typed questions about each run with a probability. Bolt installs
  [Laya](https://huggingface.co/convaiinnovations/laya) (a 421M open typed-decision model) and runs it
  locally, compares it with the local LLM on every answer, and hands it a question once it agrees on
  at least 90% of 30 answers. Until then the local LLM answers. [Jev cloud](https://typesafe.ai) is an
  opt-in hosted alternative.
- **An LLM** plans which questions fit each agent, investigates when triage says it is worth it, writes
  short guidance for the agent, and summarizes runs. It runs locally by default (Ollama, LM Studio,
  llama.cpp, MLX). Claude, OpenAI, OpenRouter, Gemini or any OpenAI-compatible API are opt-in.
- **Steering** puts a finding back into the agent mid-run: a note in its next LLM call, or a
  `check_my_work` tool it can call itself. Opt-in per project.
- **MCP** gives Claude Code, Cursor or Codex the runs, findings and explanations, so a coding agent
  can fix the bug and add a check that catches it next time.
- **Home** shows how the agents have been doing over a period: what keeps failing, which tools and
  models break, what is holding up, and a short LLM reading of those numbers.
- **Neatlogs Cloud** is one click away: Bolt re-exports a run over the same public OTLP endpoint the
  SDKs use, redacted first.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/neatlogs/neatlogs-bolt/main/install.sh | sh
neatbolt start                                        # http://localhost:4100
```

The installer builds Bolt into `~/.neatbolt` (with its own Node.js if yours is older than 22), adds a
`neatbolt` command to `~/.local/bin`, and needs no sudo. Add `-s -- --service` to run Bolt at login.
While the repository is private: `git clone https://github.com/neatlogs/neatlogs-bolt.git && sh neatlogs-bolt/install.sh`.

**[Getting started](docs/getting-started.md)** walks through models, connecting an agent, reading
findings, checks, steering, coding agents and privacy. **[Team testing](docs/team-testing.md)** is
the checklist for this round.

On first start Bolt installs Laya into `~/.neatbolt/laya` in the background (about 1.5 GB: PyTorch,
Laya and its checkpoint). Skip it with `--no-laya`. Zero-shot, Laya is not yet reliable on agent-run
questions (7 of 12 on Bolt' labeled set, against 11 of 12 for gemma4), so it starts in shadow mode and
earns each question on your own runs.

Point your agent at Bolt. No SDK change is needed:

```bash
export NEATLOGS_ENDPOINT=http://localhost:4100
export NEATLOGS_API_KEY=neatbolt-local
```

```python
import neatlogs
neatlogs.init(workflow_name="refund-agent", instrumentations=["openai"], flush_interval=0.5)
```

`flush_interval=0.5` lets Bolt see spans while the run is still going. Check the path with the
SDK's own doctor, which passes against Bolt:

```bash
python -m neatlogs doctor --probe
```

## Models

Rules need no model. For questions, explanations and notes, run a local model (`ollama pull qwen3:8b`)
or turn on a hosted one:

```bash
neatbolt llm login anthropic && neatbolt llm use anthropic   # claude-opus-5-5; --model to choose
neatbolt llm local                                        # back to this machine only
```

With a hosted LLM on, the run content each LLM task needs is sent to that provider with secrets
removed; rules, storage and the app stay local. Settings → Models does the same in the app.

## Steering (optional)

```bash
pip install ~/.neatbolt/src/python/neatbolt-steer      # or: npm install ~/.neatbolt/src/packages/steer-ts
neatbolt steering advisory --project refund-agent
```

```python
import neatbolt_steer
client = neatbolt_steer.wrap(OpenAI())
```

Modes: `advisory` (a note on the next LLM call), `gate` (each LLM call waits up to 300 ms for pending
checks), `self-check` (the agent gets `check_my_work`), and `halt` from rules you write yourself.
See [docs/steering.md](docs/steering.md).

## Coding agents

```bash
claude mcp add --scope user neatbolt -- neatbolt mcp
```

Or any MCP client at `http://localhost:4100/mcp`. Tools: `get_current_run`, `search_runs`,
`get_run_outline`, `get_span`, `list_findings`, `explain_run`, `ask`, `judge`, `create_check`,
`preview_check`, `annotate`, `rerun`, `push_to_cloud`. See [docs/mcp.md](docs/mcp.md) and the skills
in [skills/](skills/).

## Commands

| Command | What it does |
| --- | --- |
| `neatbolt start` | Collector, checks, steering, app and MCP on one port (4100) |
| `neatbolt mcp` | MCP over stdio; starts Bolt if it is not running |
| `neatbolt init` | In your repo: a `.neatbolt/checks/` folder, optional `.env`, steering and MCP setup |
| `neatbolt status`, `neatbolt doctor` | What is running, and whether the trace path and models work |
| `neatbolt llm`, `neatbolt llm use <provider>`, `neatbolt llm local` | Where LLM work runs: local, or a hosted provider |
| `neatbolt models`, `neatbolt laya install`, `neatbolt jev login` | Decision models |
| `neatbolt steering <mode> --project <name>` | Steering per project; `neatbolt steering stop` turns it off everywhere |
| `neatbolt cloud login`, `neatbolt cloud forward <trace>` | Neatlogs Cloud key (Keychain) and sends |
| `neatbolt checks list`, `neatbolt checks validate <file>` | Checks in force, and YAML validation |
| `neatbolt rerun add <project> "<command>"` | A command coding agents may use to rerun your agent |
| `neatbolt service install`, `neatbolt update` | Run at login; update to the latest version |

## Repository

| Path | Contents |
| --- | --- |
| `packages/bolt` | The app: OTLP collector, store, checks engine, models, steering, MCP, cloud relay, CLI |
| `packages/ui` | The web app (React, Tailwind, the Neatlogs design language) |
| `packages/steer-ts` | `@neatlogs/bolt-steer`, the TypeScript steering hook |
| `python/neatbolt-steer` | `neatbolt-steer`, the Python steering hook |
| `packages/bolt/library` | The starter rules and the open question library |
| `examples/refund-agent` | A refund agent instrumented with the public SDK, plus a scripted fake LLM |
| `examples/samples` | Seven scripted support-agent runs, each with a known problem (or none) |
| `install.sh` | The one-line installer |
| `skills/` | Skills for coding agents |
| `docs/` | Getting started, team testing, use case, architecture, steering, checks, cloud, MCP |

## Development

```bash
pnpm install
pnpm build            # UI, then the app (copies the UI into packages/bolt/dist/ui)
pnpm test             # app tests (vitest)
cd packages/steer-ts && pnpm test
cd python/neatbolt-steer && python -m pytest
pnpm --filter @neatlogs/bolt dev    # app with reload, port 4100
pnpm --filter @neatlogs/bolt-ui dev # UI on 5173, proxied to 4100 (set NEATBOLT_DEV_ORIGIN=http://localhost:5173 on the app)
```

Bolt is built only from public inputs: the public Neatlogs SDKs and their telemetry schema, open
standards (OpenTelemetry, MCP), and openly licensed models. See [docs/architecture.md](docs/architecture.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
