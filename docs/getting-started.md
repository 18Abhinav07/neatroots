# Getting started with Neatlogs Bolts

Bolts checks your AI agent while you build it, on your own machine.
- It reads the traces the public Neatlogs SDK already sends.
- It runs checks on every run, and tells you what went wrong and where.
- It can give your coding agent the evidence over MCP, and can add a note to your agent's next LLM call while the run is still going.

Nothing leaves your machine unless you send it.

This guide covers installing Bolts, connecting an agent, reading what it finds, and the settings worth knowing. For why it exists and who it is for, see [use-case.md](use-case.md).

## 1. Install

```bash
curl -fsSL https://raw.githubusercontent.com/neatlogs/bolts/main/install.sh | sh
```

While the repository is private, clone it first (your git credentials are used), then run the same installer:

```bash
git clone https://github.com/neatlogs/bolts.git && sh bolts/install.sh
```

The installer:
- uses your Node.js if it is version 22 or newer; otherwise it downloads Node.js 24 into `~/.bolts/node` and checks its checksum;
- clones Bolts into `~/.bolts/src` and builds it, which takes a minute or two;
- puts a `bolts` command in `~/.local/bin` and adds that folder to your shell's PATH;
- needs no sudo and changes nothing outside your home folder.

You need macOS or Linux (on Windows, use WSL), git, and about 2 GB of disk: 300 MB for Bolts and 1.5 GB for Laya, the local decision model.

Installer options go after `sh -s --`, for example `curl … | sh -s -- --service`:

| Option | What it does |
| --- | --- |
| `--service` | Also run Bolts in the background now and every time you log in |
| `--ref <branch or tag>` | Install a specific version |
| `--no-modify-path` | Leave your shell profile alone; the installer prints the line to add instead |
| `--dir <path>`, `--bin-dir <path>` | Install somewhere other than `~/.bolts` and `~/.local/bin` |
| `--uninstall` | Remove Bolts but keep your runs and settings |

## 2. Start it

```bash
bolts start                  # runs in this terminal; Ctrl+C to stop
bolts service install        # or: run in the background and start at login
```

Open **http://localhost:4100**.

The first start installs Laya in the background. Rules work right away, and questions start working once a model is available (next step). To skip Laya, use `bolts start --no-laya`.

Check that everything works:

```bash
bolts doctor
```

## 3. Choose your models

Bolts works in three layers. You only need the first to start.

| Layer | What it does | Default |
| --- | --- | --- |
| **Rules** | Code checks on every span: loops, repeated tool calls, error streaks, leaked keys, failed or empty runs | Always on, no model |
| **Decision model** | Answers each check's yes/no question with a probability | Laya on this machine; the LLM answers a question until Laya has earned it |
| **LLM** | Picks the questions that fit your agent, explains problems, writes notes for the agent, summarizes runs | A local model (Ollama, LM Studio, llama.cpp, MLX) |

### A local LLM (the default)

Install [Ollama](https://ollama.com), then pull a model:

```bash
ollama pull qwen3:8b          # 16 GB+ machines; gemma4 and llama3.1:8b also work
```

Bolts picks an installed model that fits your machine's memory. To see what it chose, run `bolts models`.

### A hosted LLM (opt-in)

If you would rather use Claude or another hosted model, store a key and turn it on:

```bash
bolts llm login anthropic                          # paste the key; it goes to the macOS Keychain
bolts llm use anthropic                            # claude-opus-5-5 by default
bolts llm use anthropic --model claude-sonnet-5-5  # or pick a model
bolts llm test                                     # one tiny prompt, to confirm it works
bolts llm local                                    # back to this machine only
```

You can also do this in the app under **Settings → Models → Hosted provider**.

- **Providers:** Anthropic, OpenAI, OpenRouter, Google Gemini, Groq, Mistral, Together AI, and any OpenAI-compatible server (`bolts llm use custom --base-url https://…/v1 --model …`). `bolts llm providers` lists them, and `bolts llm models <provider>` lists a provider's models.
- **What is sent:** when a hosted LLM is on, the run content each LLM task needs is sent to that provider. Keys, tokens and private keys are removed first. `--redact all` also removes emails and phone numbers, though that can stop the personal-data check from seeing a leak. Rules, stored runs and the app stay on your machine.
- **Fallback:** if the provider fails or has no key, Bolts falls back to the local LLM. Turn this off with `--no-fallback`.
- **Cost:** Bolts asks the LLM a few questions per run while Laya is learning, and more when it investigates a problem. Pick a smaller model, such as `claude-haiku-5-5`, if your agent runs a lot.

### Jev cloud (opt-in)

[Jev](https://typesafe.ai) is a hosted typed-decision model. To use it for decisions:

```bash
bolts jev login && bolts jev on
```

## 4. Connect your agent

Bolts speaks the same protocol as Neatlogs Cloud, so an agent that already uses the Neatlogs SDK only needs two environment variables:

```bash
export NEATLOGS_ENDPOINT=http://localhost:4100
export NEATLOGS_API_KEY=bolts-local
```

If the agent isn't instrumented yet:

```python
import neatlogs
neatlogs.init(workflow_name="refund-agent", instrumentations=["openai"], flush_interval=0.5)
```

```ts
import * as neatlogs from "neatlogs";
await neatlogs.init({ workflowName: "refund-agent", flushInterval: 0.5 });
```

- `workflow_name` is the project name Bolts shows.
- `flush_interval=0.5` (`flushInterval` in TypeScript) sends spans every half second, so Bolts can check a run while it is still going.

In your agent's repository, `bolts init --project refund-agent --write-env` writes the two variables to `.env` and adds a `.bolts/checks/` folder for checks your team shares.

To check the path end to end with the SDK's own doctor:

```bash
python -m neatlogs doctor --probe
```

## 5. Read what Bolts found

The **Runs** page lists each run:
- **Each row:** what the run was asked to do and its most important open problem.
- **Run page:** the problems come first, each with a one-line cause. Click one to see the suggested fix, the spans that show it, and how sure Bolts is.
- **Explain run:** the LLM writes a likely cause for the whole run.
- **Trace:** the trace and the selected span sit side by side. Bolts opens the span that best shows the top problem. Click any span to see its input and output.
- **Dismiss finding:** use it when a finding is wrong. Bolts counts dismissals per check, so you can see which checks are noisy.
- **Labels:** **Mark as issue / good** on a span records your judgment. Bolts uses it when measuring its checks.

## 6. Checks

The **Checks** page lists everything Bolts watches for:
- **Rules** run in code on every span.
- **Questions** go to the decision model. For each agent, the LLM picks the library questions that fit its goal, system prompt and tools, and may write new ones for risks the library does not cover. Two questions always run: ignored tool errors and followed injected instructions.
- **Your own checks:** click **New check**, describe the problem in a sentence, and Bolts drafts a yes/no question. **Preview on recent runs** shows how often it would fire before you save it.
- **Sharing checks:** keep them in your repository's `.bolts/checks/` folder to share with your team. `bolts checks validate <file>` checks the YAML. The format is in [checks.md](checks.md).

## 7. Steering (opt-in)

Steering puts a finding back into the agent while it is still running. It is off until you turn it on for a project, and it needs a small hook in your agent:

```bash
pip install ~/.bolts/src/python/bolts-steer        # until the hook is published: pip install bolts-steer
bolts steering gate --project refund-agent
```

```python
import bolts_steer
client = bolts_steer.wrap(OpenAI())   # or Anthropic(); sync or async
```

For TypeScript, run `npm install ~/.bolts/src/packages/steer-ts` and see [steering.md](steering.md).

| Mode | What happens |
| --- | --- |
| `advisory` | A short note is added to the agent's next LLM call |
| `gate` | Each LLM call waits up to 300 ms for pending checks, then adds the note |
| `self-check` | The agent gets a `check_my_work` tool it can call |

Limits:
- At most one note per LLM call and three per run.
- Only rules you write with `action: halt` can stop a run.
- `bolts steering stop` turns steering off everywhere at once. The sidebar switch does the same.

## 8. Coding agents (MCP)

Give Claude Code, Cursor or Codex the runs, findings and explanations:

```bash
claude mcp add --scope user bolts -- bolts mcp
```

Other clients can use the HTTP endpoint `http://localhost:4100/mcp`.

Then ask, for example: *"Fix what Bolts found in my last run, and add a check so it is caught next time."* Your coding agent can:
- read the run, find the problem and explain it;
- write a check and preview it on recent runs;
- rerun your agent, if you registered a command with `bolts rerun add <project> "<command>"`.

[mcp.md](mcp.md) lists the tools. The `skills/` folder has ready-made skills for coding agents.

## 9. Neatlogs Cloud

To keep a run, or share it with your team, send it to Neatlogs Cloud:

```bash
bolts cloud login                                   # your app.neatlogs.com API key, stored in the Keychain
```

Then click **Send to Cloud** on a run. Bolts shows what it will remove before it sends anything. To forward every run of a project as it finishes, run `bolts cloud auto <project> on`. See [cloud.md](cloud.md).

## What leaves your machine

| Feature | Default | What is sent, and where |
| --- | --- | --- |
| Rules, Laya, local LLM, storage, app | On | Nothing; all local |
| Hosted LLM | Off | Run content each LLM task needs, minus secrets, to the provider you choose |
| Jev cloud | Off | Span content a question needs, to api.typesafe.ai |
| Neatlogs Cloud | Off | Runs you send or a project you forward, redacted first, to ingest.neatlogs.com |
| Steering | Off | Notes go to your own agent's next LLM call; nothing leaves the machine |
| Install and update | — | Downloads Bolts, Node.js, packages and Laya |

Bolts listens on 127.0.0.1 only. API keys live in the macOS Keychain (on Linux, a file only you can read in `~/.bolts`) and never in Bolts' database.

## Commands

| Command | What it does |
| --- | --- |
| `bolts start` | Run Bolts on port 4100 (`--port`, `--no-laya`) |
| `bolts service install / uninstall / status / restart` | Run in the background and start at login |
| `bolts status`, `bolts doctor` | What is running; whether everything works |
| `bolts init` | Set up an agent's repository (`--project`, `--write-env`, `--steering`, `--mcp claude`) |
| `bolts llm` | Where LLM calls go; `login`, `use`, `local`, `models`, `test`, `providers` |
| `bolts models`, `bolts laya install`, `bolts jev login / on / off` | Decision models |
| `bolts steering <mode> --project <name>`, `bolts steering stop` | Steering |
| `bolts checks list`, `bolts checks validate <file>` | Checks |
| `bolts cloud login / forward / auto` | Neatlogs Cloud |
| `bolts rerun add <project> "<command>"` | Let coding agents rerun your agent |
| `bolts mcp` | MCP over stdio for coding agents |
| `bolts update` | Update to the latest version |

## Update and uninstall

```bash
bolts update                                       # pulls, rebuilds and restarts the background service
curl -fsSL https://raw.githubusercontent.com/neatlogs/bolts/main/install.sh | sh -s -- --uninstall
```

Uninstalling keeps `~/.bolts`, which holds your runs, settings and Laya. Delete that folder to remove them too. API keys stay in the Keychain under "neatlogs-bolts".

## Troubleshooting

| Problem | Try |
| --- | --- |
| `bolts: command not found` | Open a new terminal, or add `~/.local/bin` to your PATH |
| `port 4100 is in use` | Bolts is already running: run `bolts status`. Or use `bolts start --port 4200` and point `NEATLOGS_ENDPOINT` at it |
| No runs appear | Check that both variables are set in the agent's process. Run `python -m neatlogs doctor --probe` and `bolts doctor` |
| Runs appear only at the end | Set `flush_interval=0.5` in `neatlogs.init` |
| "No LLM" in the sidebar | Start Ollama (`ollama serve`) and pull a model, or turn on a hosted LLM. Rules still run without one |
| Laya failed to install | Run `bolts laya install` to see the error (it needs `uv` or Python 3.10+). Bolts works without Laya: the LLM answers instead |
| Hosted LLM errors | `bolts llm` shows the error. "Rejected the key": run `bolts llm login <provider>` again. "Model not found": check `bolts llm models <provider>` |
| Steering notes never arrive | Turn steering on for the project, install the hook, and set `BOLTS_STEER_DEBUG=1` in the agent to see what the hook does |
| Where are the logs? | The terminal running `bolts start`, or `~/.bolts/logs/bolts.log` for the background service. `BOLTS_DEBUG=1` adds detail |
