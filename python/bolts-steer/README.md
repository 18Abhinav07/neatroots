# bolts-steer

The steering hook for [Neatlogs Bolts](https://github.com/neatlogs/bolts). When Bolts finds a
problem in a run that is still going, this hook adds Bolts' short note to the agent's next LLM
call inside a `<bolts-guidance>` block and records a `bolts.guidance` span event. It never edits
tool calls or model output, and it does nothing when Bolts is not running.

```bash
pip install bolts-steer
```

```python
import neatlogs, bolts_steer
neatlogs.init(workflow_name="refund-agent", instrumentations=["openai"], flush_interval=0.5)
from openai import OpenAI

client = bolts_steer.wrap(OpenAI())        # OpenAI, AsyncOpenAI, Anthropic, AsyncAnthropic
```

Turn steering on for the project in Bolts (it is off by default):

```bash
bolts steering advisory --project refund-agent   # or gate, self-check, off
```

Other ways in:

- `bolts_steer.apply(messages)` adds the pending note to OpenAI-style messages yourself;
  `apply_anthropic(messages)` for the Anthropic Messages API.
- `bolts_steer.guidance()` returns the pending note (or `None`) for any framework.
- `CHECK_MY_WORK_TOOL` / `ANTHROPIC_CHECK_MY_WORK_TOOL` give the agent a tool to ask Bolts a
  yes/no question about its own run; answer tool calls with `bolts_steer.handle_tool_call(name, args)`
  or call `bolts_steer.check_my_work(question)`.
- `BoltsHalt` is raised before an LLM call when one of your own halt rules fires.

Configuration: `BOLTS_URL` (default: the local `NEATLOGS_ENDPOINT`, else `http://localhost:4100`),
`BOLTS_STEER=off` to disable. No dependencies beyond the standard library; it reads the current
trace from OpenTelemetry when `opentelemetry-api` is installed (the Neatlogs SDK installs it).
