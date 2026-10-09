# Getting started with Neatlogs Bolt

Bolt checks your AI agent while you build it, on your own machine.
- It reads the traces the public Neatlogs SDK already sends.
- It runs checks on every run, and tells you what went wrong and where.
- It can give your coding agent the evidence over MCP, and can add a note to your agent's next LLM call while the run is still going.

Nothing leaves your machine unless you send it.

This guide covers installing Bolt, connecting an agent, reading what it finds, and the settings worth knowing. For why it exists and who it is for, see [use-case.md](use-case.md).

## 1. Install

```bash
curl -fsSL https://raw.githubusercontent.com/neatlogs/neatlogs-bolt/main/install.sh | sh
```

While the repository is private, fetch the installer with the [GitHub CLI](https://cli.github.com) (signed in with `gh auth login` to an account in the neatlogs org). The installer then downloads the release through it too:

```bash
gh api -H "Accept: application/vnd.github.raw" repos/neatlogs/neatlogs-bolt/contents/install.sh | sh
```

The installer:
- downloads the prebuilt release, one bundle of about 15 MB for macOS and Linux on Apple silicon, Intel and arm64, and checks its checksum;
- uses your Node.js if it is version 22 or newer; otherwise it downloads Node.js 24 into `~/.neatbolt/node` and checks its checksum;
- puts a `neatbolt` command in `~/.local/bin` and adds that folder to your shell's PATH;
- offers to connect the coding agents it finds (Claude Code, Codex, Cursor and others; see section 8);
- needs no sudo and changes nothing outside your home folder, except the MCP settings of agents you agree to connect.

You need macOS or Linux (on Windows, use WSL) and about 2 GB of disk: 70 MB for Bolt and 1.5 GB for Laya, the local decision model.

Installer options go after `sh -s --`, for example `curl … | sh -s -- --service`:

| Option | What it does |
| --- | --- |
| `--service` | Also run Bolt in the background now and every time you log in |
| `--version <tag>` | Install a specific release, e.g. `v0.1.0` |
| `--connect`, `--no-connect` | Connect the coding agents found here without asking, or don't offer |
| `--from-source`, `--ref <branch>` | Clone and build instead of downloading (needs git) |
| `--no-modify-path` | Leave your shell profile alone; the installer prints the line to add instead |
| `--dir <path>`, `--bin-dir <path>` | Install somewhere other than `~/.neatbolt` and `~/.local/bin` |
| `--uninstall` | Remove Bolt but keep your runs and settings |

## 2. Start it

```bash
neatbolt start                  # runs in this terminal; Ctrl+C to stop
neatbolt service install        # or: run in the background and start at login
```

Open **http://localhost:4100**.

The first start installs Laya in the background. Rules work right away, and questions start working once a model is available (next step). To skip Laya, use `neatbolt start --no-laya`.

Check that everything works:

```bash
neatbolt doctor
```

## 3. Choose your models

Bolt works in three layers. You only need the first to start.

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

Bolt picks an installed model that fits your machine's memory. To see what it chose, run `neatbolt models`.

### A hosted LLM (opt-in)

If you would rather use Claude or another hosted model, store a key and turn it on:

```bash
neatbolt llm login anthropic                          # paste the key; it goes to the macOS Keychain
neatbolt llm use anthropic                            # claude-opus-5-5 by default
neatbolt llm use anthropic --model claude-sonnet-5-5  # or pick a model
neatbolt llm test                                     # one tiny prompt, to confirm it works
neatbolt llm local                                    # back to this machine only
```

You can also do this in the app under **Settings → Models → Hosted provider**.

- **Providers:** Anthropic, OpenAI, OpenRouter, Google Gemini, Groq, Mistral, Together AI, and any OpenAI-compatible server (`neatbolt llm use custom --base-url https://…/v1 --model …`). `neatbolt llm providers` lists them, and `neatbolt llm models <provider>` lists a provider's models.
- **What is sent:** when a hosted LLM is on, the run content each LLM task needs is sent to that provider. Keys, tokens and private keys are removed first. `--redact all` also removes emails and phone numbers, though that can stop the personal-data check from seeing a leak. Rules, stored runs and the app stay on your machine.
- **Fallback:** if the provider fails or has no key, Bolt falls back to the local LLM. Turn this off with `--no-fallback`.
- **Cost:** Bolt asks the LLM a few questions per run while Laya is learning, and more when it investigates a problem. Pick a smaller model, such as `claude-haiku-5-5`, if your agent runs a lot.

### Jev cloud (opt-in)

[Jev](https://typesafe.ai) is a hosted typed-decision model. To use it for decisions:

```bash
neatbolt jev login && neatbolt jev on
```

## 4. Connect your agent

Bolt speaks the same protocol as Neatlogs Cloud, so an agent that already uses the Neatlogs SDK only needs two environment variables:

```bash
export NEATLOGS_ENDPOINT=http://localhost:4100
export NEATLOGS_API_KEY=neatbolt-local
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

- `workflow_name` is the project name Bolt shows.
- `flush_interval=0.5` (`flushInterval` in TypeScript) sends spans every half second, so Bolt can check a run while it is still going.

In your agent's repository, `neatbolt init --project refund-agent --write-env` writes the two variables to `.env` and adds a `.neatbolt/checks/` folder for checks your team shares.

To check the path end to end with the SDK's own doctor:

```bash
python -m neatlogs doctor --probe
```

## 5. Read what Bolt found

**Home** shows how your agents have been doing over the last 24 hours, 7 days or 30 days, against the period before. Everything on it is computed from your own runs:
- **Totals:** how many runs had problems or failed, and how long runs take.
- **Needs attention:** problems by how many runs they hit, tools that fail or return nothing, and models with errors.
- **Working well:** projects, tools and models with a clean record, checks that found nothing, and problems you no longer see.
- **What stands out:** the LLM's short reading of these numbers. It sees only the aggregates, never run content, and Bolt drops any sentence that quotes a number not in the data.
- **The guide:** while setup is incomplete, Home also shows how to use Bolt, checked against what is actually set up.

Click a problem to see every run it hit.

The **Runs** page lists each run:
- **Each row:** what the run was asked to do and its most important open problem.
- **Run page:** the problems come first, each with a one-line cause. Click one to see the suggested fix, the spans that show it, and how sure Bolt is.
- **Explain run:** the LLM writes a likely cause for the whole run.
- **Trace:** the trace and the selected span sit side by side. Bolt opens the span that best shows the top problem. Click any span to see its input and output.
- **Dismiss finding:** use it when a finding is wrong. Bolt counts dismissals per check, so you can see which checks are noisy.
- **Labels:** **Mark as issue / good** on a span records your judgment. Bolt uses it when measuring its checks.

## 6. Checks

The **Checks** page lists everything Bolt watches for:
- **Rules** run in code on every span.
- **Questions** go to the decision model. For each agent, the LLM picks the library questions that fit its goal, system prompt and tools, and may write new ones for risks the library does not cover. Two questions always run: ignored tool errors and followed injected instructions.
- **Your own checks:** click **New check**, describe the problem in a sentence, and Bolt drafts a yes/no question. **Preview on recent runs** shows how often it would fire before you save it.
- **Sharing checks:** keep them in your repository's `.neatbolt/checks/` folder to share with your team. `neatbolt checks validate <file>` checks the YAML. The format is in [checks.md](checks.md).

## 7. Steering (opt-in)

Steering puts a finding back into the agent while it is still running. It is off until you turn it on for a project, and it needs a small hook in your agent:

```bash
pip install ~/.neatbolt/src/python/neatbolt-steer        # until the hook is published: pip install neatbolt-steer
neatbolt steering gate --project refund-agent
```

```python
import neatbolt_steer
client = neatbolt_steer.wrap(OpenAI())   # or Anthropic(); sync or async
```

For TypeScript, run `npm install ~/.neatbolt/src/packages/steer-ts` and see [steering.md](steering.md).

| Mode | What happens |
| --- | --- |
| `advisory` | A short note is added to the agent's next LLM call |
| `gate` | Each LLM call waits up to 300 ms for pending checks, then adds the note |
| `self-check` | The agent gets a `check_my_work` tool it can call |

Limits:
- At most one note per LLM call and three per run.
- Only rules you write with `action: halt` can stop a run.
- `neatbolt steering stop` turns steering off everywhere at once. The sidebar switch does the same.

## 8. Coding agents (MCP)

Give your coding agent the runs, findings and explanations:

```bash
neatbolt connect                 # pick from the agents found on this machine
neatbolt connect cursor codex    # or name them
neatbolt connect --list          # what's found and what's connected
neatbolt connect --remove cursor
```

Supported: Claude Code, Codex, Cursor, OpenCode, Windsurf, Amp, Gemini CLI, VS Code and Claude Desktop. Each gets a `neatbolt` entry in its own MCP settings, in the format its docs give; other entries are kept, and the file is backed up once (`*.neatbolt-backup`) before the first change. A settings file with comments is left alone, and Bolt prints what to add instead. **Settings → Coding agents** in the app does the same with one click.

Other clients can use the HTTP endpoint `http://localhost:4100/mcp`.

Then ask, for example: *"Fix what Bolt found in my last run, and add a check so it is caught next time."* Your coding agent can:
- read the run, find the problem and explain it;
- write a check and preview it on recent runs;
- rerun your agent, if you registered a command with `neatbolt rerun add <project> "<command>"`.

[mcp.md](mcp.md) lists the tools. The `skills/` folder has ready-made skills for coding agents.

## 9. Neatlogs Cloud

To keep a run, or share it with your team, send it to Neatlogs Cloud:

```bash
neatbolt cloud login                                   # your app.neatlogs.com API key, stored in the Keychain
```

Then click **Send to Cloud** on a run. Bolt shows what it will remove before it sends anything. To forward every run of a project as it finishes, run `neatbolt cloud auto <project> on`. See [cloud.md](cloud.md).

## What leaves your machine

| Feature | Default | What is sent, and where |
| --- | --- | --- |
| Rules, Laya, local LLM, storage, app | On | Nothing; all local |
| Hosted LLM | Off | Run content each LLM task needs, minus secrets, to the provider you choose |
| Jev cloud | Off | Span content a question needs, to api.typesafe.ai |
| Neatlogs Cloud | Off | Runs you send or a project you forward, redacted first, to ingest.neatlogs.com |
| Steering | Off | Notes go to your own agent's next LLM call; nothing leaves the machine |
| Install and update | — | Downloads Bolt, Node.js, packages and Laya |

Bolt listens on 127.0.0.1 only. API keys live in the macOS Keychain (on Linux, a file only you can read in `~/.neatbolt`) and never in Bolt' database.

## Commands

| Command | What it does |
| --- | --- |
| `neatbolt start` | Run Bolt on port 4100 (`--port`, `--no-laya`) |
| `neatbolt service install / uninstall / status / restart` | Run in the background and start at login |
| `neatbolt status`, `neatbolt doctor` | What is running; whether everything works |
| `neatbolt init` | Set up an agent's repository (`--project`, `--write-env`, `--steering`, `--mcp claude`) |
| `neatbolt llm` | Where LLM calls go; `login`, `use`, `local`, `models`, `test`, `providers` |
| `neatbolt models`, `neatbolt laya install`, `neatbolt jev login / on / off` | Decision models |
| `neatbolt steering <mode> --project <name>`, `neatbolt steering stop` | Steering |
| `neatbolt checks list`, `neatbolt checks validate <file>` | Checks |
| `neatbolt cloud login / forward / auto` | Neatlogs Cloud |
| `neatbolt rerun add <project> "<command>"` | Let coding agents rerun your agent |
| `neatbolt mcp` | MCP over stdio for coding agents |
| `neatbolt update` | Update to the latest version |

## Update and uninstall

```bash
neatbolt update                                       # pulls, rebuilds and restarts the background service
neatbolt connect --remove --detected   # optional; uninstalling does this too
curl -fsSL https://raw.githubusercontent.com/neatlogs/neatlogs-bolt/main/install.sh | sh -s -- --uninstall
```

Uninstalling keeps `~/.neatbolt`, which holds your runs, settings and Laya. Delete that folder to remove them too. API keys stay in the Keychain under "neatlogs-bolt".

## Troubleshooting

| Problem | Try |
| --- | --- |
| `bolts: command not found` | Open a new terminal, or add `~/.local/bin` to your PATH |
| `port 4100 is in use` | Bolt is already running: run `neatbolt status`. Or use `neatbolt start --port 4200` and point `NEATLOGS_ENDPOINT` at it |
| No runs appear | Check that both variables are set in the agent's process. Run `python -m neatlogs doctor --probe` and `neatbolt doctor` |
| Runs appear only at the end | Set `flush_interval=0.5` in `neatlogs.init` |
| "No LLM" in the sidebar | Start Ollama (`ollama serve`) and pull a model, or turn on a hosted LLM. Rules still run without one |
| Laya failed to install | Run `neatbolt laya install` to see the error (it needs `uv` or Python 3.10+). Bolt works without Laya: the LLM answers instead |
| Hosted LLM errors | `neatbolt llm` shows the error. "Rejected the key": run `neatbolt llm login <provider>` again. "Model not found": check `neatbolt llm models <provider>` |
| Steering notes never arrive | Turn steering on for the project, install the hook, and set `NEATBOLT_STEER_DEBUG=1` in the agent to see what the hook does |
| Where are the logs? | The terminal running `neatbolt start`, or `~/.neatbolt/logs/neatbolt.log` for the background service. `NEATBOLT_DEBUG=1` adds detail |
