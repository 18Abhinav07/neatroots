# @neatlogs/bolts-steer

The steering hook for [Neatlogs Bolts](https://github.com/neatlogs/bolts), for TypeScript agents.
When Bolts finds a problem in a run that is still going, this hook adds Bolts' short note to the
agent's next LLM call inside a `<bolts-guidance>` block and records a `bolts.guidance` span. It never
edits tool calls or model output, and does nothing when Bolts is not running.

```bash
npm install @neatlogs/bolts-steer
```

```ts
import * as neatlogs from "neatlogs";
import OpenAI from "openai";
import { configure, wrapOpenAI } from "@neatlogs/bolts-steer";

await neatlogs.init({ workflowName: "refund-agent", flushInterval: 0.5 });
configure({ neatlogs });                       // share the SDK instance with the hook
const client = wrapOpenAI(neatlogs.wrapOpenAI(new OpenAI()));
```

Vercel AI SDK:

```ts
import { wrapLanguageModel } from "ai";
import { boltsMiddleware } from "@neatlogs/bolts-steer";
const model = wrapLanguageModel({ model: openai("gpt-4o"), middleware: boltsMiddleware() });
```

Turn steering on for the project in Bolts (it is off by default):

```bash
bolts steering advisory --project refund-agent   # or gate, self-check, off
```

Also available: `wrapAnthropic`, `applyMessages`, `applyAnthropic`, `guidance()`,
`CHECK_MY_WORK_TOOL` / `ANTHROPIC_CHECK_MY_WORK_TOOL` with `checkMyWork(question)` and
`handleToolCall(name, args)`, and `BoltsHalt` for your own halt rules.

Configuration: `BOLTS_URL` (default: a local `NEATLOGS_ENDPOINT`, else `http://localhost:4100`),
`BOLTS_STEER=off` to disable, `BOLTS_STEER_DEBUG=1` to log each claim. If you trace without the
Neatlogs SDK, pass `configure({ traceId: () => currentTraceIdHex })`.
