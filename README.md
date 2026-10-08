# Neatlogs Bolts

Bolts checks AI agents while they run on your machine. Traces come from the public
[Neatlogs SDKs](https://github.com/neatlogs/neatlogs); local models check every run; and nothing
leaves your computer unless you send it.

- **Rules** run in code on every span: repeated identical tool calls, error streaks, runaway loops,
  leaked keys, failed or empty runs.
- **A decision model** answers typed questions about each run with a probability. Bolts installs
  [Laya](https://huggingface.co/convaiinnovations/laya) (a 421M open typed-decision model) and runs it
  locally, compares it with the local LLM on every answer, and hands it a question once it agrees on
  at least 90% of 30 answers. Until then the local LLM answers. [Jev cloud](https://typesafe.ai) is an
  opt-in hosted alternative.
- **A local LLM** (Ollama, LM Studio, llama.cpp, MLX) plans which questions fit each agent,
  investigates when triage says it is worth it, writes short guidance for the agent, and summarizes runs.
- **Steering** puts a finding back into the agent mid-run: a note in its next LLM call, or a
  `check_my_work` tool it can call itself. Opt-in per project.
- **MCP** gives Claude Code, Cursor or Codex the runs, findings and explanations, so a coding agent
  can fix the bug and add a check that catches it next time.
- **Neatlogs Cloud** is one click away: Bolts re-exports a run over the same public OTLP endpoint the
  SDKs use, redacted first.

## Quick start

```bash
pnpm install && pnpm build                         # from this repo, for now
node packages/bolts/dist/cli.js start              # http://localhost:4100
```

On first start Bolts installs Laya into `~/.bolts/laya` in the background (about 1.5 GB: PyTorch,
Laya and its checkpoint). Skip it with `--no-laya`. Zero-shot, Laya is not yet reliable on agent-run
questions (7 of 12 on Bolts' labeled set, against 11 of 12 for gemma4), so it starts in shadow mode and
earns each question on your own runs.

Point your agent at Bolts. No SDK change is needed:

```bash
export NEATLOGS_ENDPOINT=http://localhost:4100
export NEATLOGS_API_KEY=bolts-local
```

```python
import neatlogs
neatlogs.init(workflow_name="refund-agent", instrumentations=["openai"], flush_interval=0.5)
```

`flush_interval=0.5` lets Bolts see spans while the run is still going. Check the path with the
SDK's own doctor, which passes against Bolts:

```bash
python -m neatlogs doctor --probe
```

Then open http://localhost:4100.

## Steering (optional)

```bash
pip install bolts-steer            # or: npm install @neatlogs/bolts-steer
bolts steering advisory --project refund-agent
```

```python
import bolts_steer
client = bolts_steer.wrap(OpenAI())
```

Modes: `advisory` (a note on the next LLM call), `gate` (each LLM call waits up to 300 ms for pending
checks), `self-check` (the agent gets `check_my_work`), and `halt` from rules you write yourself.
See [docs/steering.md](docs/steering.md).

## Coding agents

```bash
claude mcp add --scope user bolts -- node /path/to/bolts/packages/bolts/dist/cli.js mcp
```

Or any MCP client at `http://localhost:4100/mcp`. Tools: `get_current_run`, `search_runs`,
`get_run_outline`, `get_span`, `list_findings`, `explain_run`, `ask`, `judge`, `create_check`,
`preview_check`, `annotate`, `rerun`, `push_to_cloud`. See [docs/mcp.md](docs/mcp.md) and the skills
in [skills/](skills/).

## Commands

| Command | What it does |
| --- | --- |
| `bolts start` | Collector, checks, steering, app and MCP on one port (4100) |
| `bolts mcp` | MCP over stdio; starts Bolts if it is not running |
| `bolts init` | In your repo: a `.bolts/checks/` folder, optional `.env`, steering and MCP setup |
| `bolts status`, `bolts doctor` | What is running, and whether the trace path and models work |
| `bolts models`, `bolts laya install`, `bolts jev login` | Decision and LLM models |
| `bolts steering <mode> --project <name>` | Steering per project; `bolts steering stop` turns it off everywhere |
| `bolts cloud login`, `bolts cloud forward <trace>` | Neatlogs Cloud key (Keychain) and sends |
| `bolts checks list`, `bolts checks validate <file>` | Checks in force, and YAML validation |
| `bolts rerun add <project> "<command>"` | A command coding agents may use to rerun your agent |

## Repository

| Path | Contents |
| --- | --- |
| `packages/bolts` | The app: OTLP collector, store, checks engine, models, steering, MCP, cloud relay, CLI |
| `packages/ui` | The web app (React, Tailwind, the Neatlogs design language) |
| `packages/steer-ts` | `@neatlogs/bolts-steer`, the TypeScript steering hook |
| `python/bolts-steer` | `bolts-steer`, the Python steering hook |
| `packages/bolts/library` | The starter rules and the open question library |
| `examples/refund-agent` | A refund agent instrumented with the public SDK, plus a scripted fake LLM |
| `skills/` | Skills for coding agents |
| `docs/` | Architecture, steering, checks, cloud, MCP |

## Development

```bash
pnpm install
pnpm build            # UI, then the app (copies the UI into packages/bolts/dist/ui)
pnpm test             # app tests (vitest)
cd packages/steer-ts && pnpm test
cd python/bolts-steer && python -m pytest
pnpm --filter @neatlogs/bolts dev    # app with reload, port 4100
pnpm --filter @neatlogs/bolts-ui dev # UI on 5173, proxied to 4100 (set BOLTS_DEV_ORIGIN=http://localhost:5173 on the app)
```

Bolts is built only from public inputs: the public Neatlogs SDKs and their telemetry schema, open
standards (OpenTelemetry, MCP), and openly licensed models. See [docs/architecture.md](docs/architecture.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
