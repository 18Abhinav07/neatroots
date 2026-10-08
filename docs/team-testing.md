# Testing Bolts: the team checklist

This is the first round of testing on our own machines. The goal is to find out three things:
- whether Bolts installs cleanly;
- whether it catches the problems it should, and stays quiet otherwise;
- whether the app makes it obvious what went wrong.

The run takes about 30 minutes. Write down anything that confuses you; confusion is a finding too.

## Before you start

- macOS or Linux, about 2 GB free, and git.
- Optional: [Ollama](https://ollama.com) with a model (`ollama pull qwen3:8b`), or an Anthropic API key. Without one of these, only the rules run.
- Python 3.9+ for the samples.

## 1. Install (5 minutes)

```bash
git clone https://github.com/neatlogs/bolts.git && sh bolts/install.sh
```

Once the repository is public, this one line does the same:

```bash
curl -fsSL https://raw.githubusercontent.com/neatlogs/bolts/main/install.sh | sh
```

Then open a new terminal and run:

```bash
bolts start
```

In a second terminal:

```bash
bolts doctor
```

- [ ] The installer finished without errors. Note how long it took.
- [ ] `bolts doctor` shows ✓ for "Bolts answers" and for "trace round trip".
- [ ] http://localhost:4100 opens and says "No runs yet".

If the install fails, keep the last 30 lines of `~/.bolts/install.log` for your report.

## 2. Run the samples (10 minutes)

Seven scripted runs of a support agent. Each one has a known problem, except `happy`. They use a fake LLM, so they need no API key.

```bash
python3 -m venv ~/bolts-samples && source ~/bolts-samples/bin/activate
pip install neatlogs openai ~/.bolts/src/python/bolts-steer
bolts steering gate --project support-agent
python ~/.bolts/src/examples/samples/run_samples.py
```

Wait about a minute, then check the **Runs** page against this table:

| Scenario (the request) | What Bolts should flag |
| --- | --- |
| loop-404 ("Please refund order 4512.") | Same tool called repeatedly with identical arguments. A note reaches the agent and it stops retrying |
| ignored-error | Carried on after a failed tool call |
| injection | Followed instructions found inside tool content |
| pii-leak | Personal data in the answer |
| contradiction | The reply contradicts what the tools returned (or broke a system-prompt instruction) |
| secret-leak | Something that looks like a secret key in model output |
| happy | Nothing |

Rules alone, with no LLM, catch loop-404 and secret-leak. The other problems need a local or hosted LLM.

- [ ] Every flagged scenario shows its problem. Note any that don't.
- [ ] `happy` shows no problems. Note any false alarm.
- [ ] From the run list alone, you can tell which runs went wrong and how.
- [ ] On a run page, you understood the problem without opening the trace.
- [ ] Clicking a problem's "Seen in" span opens that span next to the trace.
- [ ] The loop-404 run shows a note under "Notes to the agent", and the trace has a "Note sent to the agent" span.

## 3. Try your own agent (10 minutes, if you have one)

Point any agent that uses the Neatlogs SDK at Bolts:

```bash
export NEATLOGS_ENDPOINT=http://localhost:4100 NEATLOGS_API_KEY=bolts-local
```

Run it a few times, including once where you expect it to go wrong.

- [ ] Its runs appear while they are running (set `flush_interval=0.5` if they only appear at the end).
- [ ] What Bolts found was real. Dismiss anything that wasn't, and note it.
- [ ] Note anything it missed that you would have wanted flagged.
- [ ] **New check** on the Checks page turned a one-sentence concern into a check that previewed sensibly.

## 4. The coding-agent loop (5 minutes, if you use Claude Code)

```bash
claude mcp add --scope user bolts -- bolts mcp
```

In your agent's repository, ask Claude Code: *"Look at my last run in Bolts, explain what went wrong, and add a check for it."*

- [ ] Claude Code found the run and the problem without you pasting anything.
- [ ] It created a check. The check appears on the Checks page.

## 5. A hosted LLM (optional)

```bash
bolts llm login anthropic
bolts llm use anthropic
bolts llm test
```

Then rerun the samples.

- [ ] `bolts llm test` answered.
- [ ] The samples were caught at least as well as with the local model. Note any difference.
- [ ] `bolts llm local` switched back, and Settings → Models shows "This machine".

## 6. Background service and update (optional)

```bash
bolts service install
bolts update
bolts service uninstall
```

`bolts service install` runs Bolts at login; stop any `bolts start` first. `bolts update` pulls, rebuilds and restarts it. `bolts service uninstall` removes it again.

- [ ] After `bolts service install`, http://localhost:4100 works with no terminal open.
- [ ] `bolts update` finished and Bolts came back.

## What to report

Post in the team channel (or open an issue) with:

```
Machine:           (e.g. M3 Pro 36 GB, macOS 26)
Install:           ok / failed (how long; log lines if it failed)
LLM:               none / Ollama <model> / Anthropic <model>
Samples caught:    (which of the 6 problems; any false alarm on happy)
Own agent:         (real problems found / false alarms / misses)
Coding agent loop: worked / didn't (what happened)
Confusing:         (anything in the app or the docs that wasn't obvious)
Slow:              (anything that took more than a few seconds)
```

## Known limits in this round

- **Laya:** the local decision model is still learning. On our labeled set it gets 7 of 12 right without training, so the LLM answers each question until Laya agrees with it on 90% of 30 answers.
- **Probabilities:** they are not yet calibrated against human labels. Treat 87% as "likely", not as a measured rate.
- **Planning:** the first run of a new agent waits for the LLM to pick its questions, which can take up to a minute on a local model.
- **Steering hooks:** they install from `~/.bolts/src` until they are published to PyPI and npm.
- **Not yet tried against the real services:** sending to Neatlogs Cloud, Jev cloud, and `bolts service install` on Linux.
- **Windows:** only through WSL.
