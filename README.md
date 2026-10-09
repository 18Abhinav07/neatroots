# neatroots

neatroots checks AI agents while they run on your machine. Traces come from the public
[Neatlogs SDKs](https://github.com/neatlogs/neatlogs); local models check every run; and nothing
leaves your computer unless you send it.

- **Rules** run in code on every span: repeated identical tool calls, error streaks, runaway loops,
  leaked keys, failed or empty runs.
- **A decision model** answers typed questions about each run with a probability. neatroots installs
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
- **Neatlogs Cloud** is one click away: neatroots re-exports a run over the same public OTLP endpoint the
  SDKs use, redacted first.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/neatlogs/neatroots/main/install.sh | sh
neatroots start                                        # http://localhost:4100
```

The installer downloads the prebuilt release (one 15 MB bundle for macOS and Linux) into `~/.neatroots`,
uses your Node.js if it is 22 or newer (otherwise it fetches its own), adds a `neatroots` command to
`~/.local/bin`, and offers to connect the coding agents it finds. No sudo, no git, no build; it takes
a few seconds. Add `-s -- --service` to run neatroots at login.

While the repository is private, fetch the installer with the GitHub CLI (it then downloads the release
the same way): `gh api -H "Accept: application/vnd.github.raw" repos/neatlogs/neatroots/contents/install.sh | sh`.

**[Getting started](docs/getting-started.md)** walks through models, connecting an agent, reading
findings, checks, steering, coding agents and privacy. **[Team testing](docs/team-testing.md)** is
the checklist for this round.

On first start neatroots installs Laya into `~/.neatroots/laya` in the background (about 1.5 GB: PyTorch,
Laya and its checkpoint). Skip it with `--no-laya`. Zero-shot, Laya is not yet reliable on agent-run
questions (7 of 12 on neatroots' labeled set, against 11 of 12 for gemma4), so it starts in shadow mode and
earns each question on your own runs.

Point your agent at neatroots. No SDK change is needed:

```bash
export NEATLOGS_ENDPOINT=http://localhost:4100
export NEATLOGS_API_KEY=neatroots-local
```

```python
import neatlogs
neatlogs.init(workflow_name="refund-agent", instrumentations=["openai"], flush_interval=0.5)
```

`flush_interval=0.5` lets neatroots see spans while the run is still going. Check the path with the
SDK's own doctor, which passes against neatroots:

```bash
python -m neatlogs doctor --probe
```

## Models

Rules need no model. For questions, explanations and notes, run a local model (`ollama pull qwen3:8b`)
or turn on a hosted one:

```bash
neatroots llm login anthropic && neatroots llm use anthropic   # claude-opus-5-5; --model to choose
neatroots llm local                                        # back to this machine only
```

With a hosted LLM on, the run content each LLM task needs is sent to that provider with secrets
removed; rules, storage and the app stay local. Settings → Models does the same in the app.

## Steering (optional)

```bash
pip install ~/.neatroots/src/python/neatroots-steer      # or: npm install ~/.neatroots/src/packages/steer-ts
neatroots steering advisory --project refund-agent
```

```python
import neatroots_steer
client = neatroots_steer.wrap(OpenAI())
```

Modes: `advisory` (a note on the next LLM call), `gate` (each LLM call waits up to 300 ms for pending
checks), `self-check` (the agent gets `check_my_work`), and `halt` from rules you write yourself.
See [docs/steering.md](docs/steering.md).

## Coding agents

```bash
neatroots connect            # finds Claude Code, Codex, Cursor, OpenCode, Windsurf, Amp, Gemini CLI, VS Code, Claude Desktop
```

It adds a `neatroots` entry to each agent's own MCP settings, and neatroots' skills to Claude Code and Codex
(or Settings → Coding agents in the app does it with one click). Any other MCP client can use `http://localhost:4100/mcp`. Tools: `get_current_run`, `search_runs`,
`get_run_outline`, `get_span`, `list_findings`, `explain_run`, `ask`, `judge`, `create_check`,
`preview_check`, `annotate`, `rerun`, `push_to_cloud`. See [docs/mcp.md](docs/mcp.md) and the skills
in [skills/](skills/).

## Commands

| Command | What it does |
| --- | --- |
| `neatroots start` | Collector, checks, steering, app and MCP on one port (4100) |
| `neatroots mcp` | MCP over stdio; starts neatroots if it is not running |
| `neatroots init` | In your repo: a `.neatroots/checks/` folder, optional `.env`, steering and MCP setup |
| `neatroots status`, `neatroots doctor` | What is running, and whether the trace path and models work |
| `neatroots llm`, `neatroots llm use <provider>`, `neatroots llm local` | Where LLM work runs: local, or a hosted provider |
| `neatroots models`, `neatroots laya install`, `neatroots jev login` | Decision models |
| `neatroots steering <mode> --project <name>` | Steering per project; `neatroots steering stop` turns it off everywhere |
| `neatroots cloud login`, `neatroots cloud forward <trace>` | Neatlogs Cloud key (Keychain) and sends |
| `neatroots checks list`, `neatroots checks validate <file>` | Checks in force, and YAML validation |
| `neatroots rerun add <project> "<command>"` | A command coding agents may use to rerun your agent |
| `neatroots service install`, `neatroots update` | Run at login; update to the latest version |

## Repository

| Path | Contents |
| --- | --- |
| `packages/neatroots` | The app: OTLP collector, store, checks engine, models, steering, MCP, cloud relay, CLI |
| `packages/ui` | The web app (React, Tailwind, the Neatlogs design language) |
| `packages/steer-ts` | `@neatlogs/neatroots-steer`, the TypeScript steering hook |
| `python/neatroots-steer` | `neatroots-steer`, the Python steering hook |
| `packages/neatroots/library` | The starter rules and the open question library |
| `examples/refund-agent` | A refund agent instrumented with the public SDK, plus a scripted fake LLM |
| `examples/samples` | Seven scripted support-agent runs, each with a known problem (or none) |
| `install.sh` | The one-line installer |
| `skills/` | Skills for coding agents |
| `docs/` | Getting started, team testing, use case, architecture, steering, checks, cloud, MCP |

## Development

```bash
pnpm install
pnpm build            # UI, then the app (copies the UI into packages/neatroots/dist/ui)
pnpm test             # app tests (vitest)
cd packages/steer-ts && pnpm test
cd python/neatroots-steer && python -m pytest
pnpm --filter @neatlogs/neatroots dev    # app with reload, port 4100
pnpm --filter @neatlogs/neatroots-ui dev # UI on 5173, proxied to 4100 (set NEATROOTS_DEV_ORIGIN=http://localhost:5173 on the app)
```

neatroots is built only from public inputs: the public Neatlogs SDKs and their telemetry schema, open
standards (OpenTelemetry, MCP), and openly licensed models. See [docs/architecture.md](docs/architecture.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
