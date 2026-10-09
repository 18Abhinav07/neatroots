# neatbolt-steer

The steering hook for [Neatlogs Bolt](https://github.com/neatlogs/neatlogs-bolt). When Bolt finds a
problem in a run that is still going, this hook adds Bolt' short note to the agent's next LLM
call inside a `<neatbolt-guidance>` block and records a `neatbolt.guidance` span event. It never edits
tool calls or model output, and it does nothing when Bolt is not running.

```bash
pip install neatbolt-steer
```

```python
import neatlogs, neatbolt_steer
neatlogs.init(workflow_name="refund-agent", instrumentations=["openai"], flush_interval=0.5)
from openai import OpenAI

client = neatbolt_steer.wrap(OpenAI())        # OpenAI, AsyncOpenAI, Anthropic, AsyncAnthropic
```

Turn steering on for the project in Bolt (it is off by default):

```bash
neatbolt steering advisory --project refund-agent   # or gate, self-check, off
```

Other ways in:

- `neatbolt_steer.apply(messages)` adds the pending note to OpenAI-style messages yourself;
  `apply_anthropic(messages)` for the Anthropic Messages API.
- `neatbolt_steer.guidance()` returns the pending note (or `None`) for any framework.
- `CHECK_MY_WORK_TOOL` / `ANTHROPIC_CHECK_MY_WORK_TOOL` give the agent a tool to ask Bolt a
  yes/no question about its own run; answer tool calls with `neatbolt_steer.handle_tool_call(name, args)`
  or call `neatbolt_steer.check_my_work(question)`.
- `BoltHalt` is raised before an LLM call when one of your own halt rules fires.

Configuration: `NEATBOLT_URL` (default: the local `NEATLOGS_ENDPOINT`, else `http://localhost:4100`),
`NEATBOLT_STEER=off` to disable. No dependencies beyond the standard library; it reads the current
trace from OpenTelemetry when `opentelemetry-api` is installed (the Neatlogs SDK installs it).
