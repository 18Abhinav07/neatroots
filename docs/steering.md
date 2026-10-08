# Steering

Steering gets a finding back into an agent while it is still running. It is opt-in per project and
never edits tool calls or model output. It needs a small hook in the agent's process.

## Turn it on

```bash
pip install bolts-steer                              # Python
npm install @neatlogs/bolts-steer                    # TypeScript
bolts steering advisory --project <service name>     # or in the app: Settings → Projects
```

The project is the SDK's `workflow_name` (the OTLP `service.name`).

## Add the hook

Python, any OpenAI or Anthropic client (sync or async):

```python
import bolts_steer
client = bolts_steer.wrap(OpenAI())
```

Other frameworks: `messages = bolts_steer.apply(messages)` before the call, or
`note = bolts_steer.guidance()` to place the note yourself.

TypeScript:

```ts
import * as neatlogs from "neatlogs";
import { configure, wrapOpenAI, boltsMiddleware } from "@neatlogs/bolts-steer";
configure({ neatlogs });                                   // share the SDK instance
const client = wrapOpenAI(neatlogs.wrapOpenAI(new OpenAI()));
// AI SDK: wrapLanguageModel({ model, middleware: boltsMiddleware() })
```

## What happens

1. A rule fires or a question crosses its line on a run that is still going.
2. Bolts queues a template note at once, filled with facts (tool name, count, arguments).
3. In parallel the local LLM writes a better note. The decision model checks it twice: is it
   supported by the evidence, and does it pass on text copied from tool output? If both pass before
   the agent's next LLM call, it replaces the template.
4. On the agent's next LLM call the hook claims one note and adds it inside a `<bolts-guidance>` block
   (to the last user message, or as a new user message after tool results). The hook records a
   `bolts.guidance` span, so the trace shows exactly what was added.

Limits: one note per LLM call, three per run. Notes left unclaimed when the run ends expire.

## Modes

| Mode | Behavior |
| --- | --- |
| `off` | Nothing is sent (the default). |
| `advisory` | Notes are added to the next LLM call once the spans that triggered them have arrived. |
| `gate` | Each LLM call flushes the SDK and waits up to 300 ms for pending checks on the run. Use this when the agent loops faster than the SDK exports. |
| `self-check` | Give the agent `CHECK_MY_WORK_TOOL`; it asks Bolts a yes/no question about its own run and gets a probability with evidence span ids. |
| `halt` | A rule you wrote with `action: halt` makes the hook raise `BoltsHalt` before the next LLM call. Library rules never halt. |

`bolts steering stop` (or the switch in the app's sidebar) turns steering off everywhere at once.

## Timing

Spans reach Bolts when the SDK exports them. Use `flush_interval=0.5` (Python) or `flushInterval: 0.5`
(TypeScript). In `gate` mode the hook flushes before each LLM call, so a note can reach the very next
call after the step that caused it.

## Safety

Span content is treated as untrusted. Notes never include raw tool output; LLM-written notes are
checked before they are sent and fall back to the template otherwise. The hook does nothing when
Bolts is not running, and backs off for five seconds after a failed request. `BOLTS_STEER=off`
disables it in a process.
