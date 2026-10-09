# @neatlogs/bolt-steer

The steering hook for [Neatlogs Bolt](https://github.com/neatlogs/neatlogs-bolt), for TypeScript agents.
When Bolt finds a problem in a run that is still going, this hook adds Bolt' short note to the
agent's next LLM call inside a `<neatbolt-guidance>` block and records a `neatbolt.guidance` span. It never
edits tool calls or model output, and does nothing when Bolt is not running.

```bash
npm install @neatlogs/bolt-steer
```

```ts
import * as neatlogs from "neatlogs";
import OpenAI from "openai";
import { configure, wrapOpenAI } from "@neatlogs/bolt-steer";

await neatlogs.init({ workflowName: "refund-agent", flushInterval: 0.5 });
configure({ neatlogs });                       // share the SDK instance with the hook
const client = wrapOpenAI(neatlogs.wrapOpenAI(new OpenAI()));
```

Vercel AI SDK:

```ts
import { wrapLanguageModel } from "ai";
import { boltMiddleware } from "@neatlogs/bolt-steer";
const model = wrapLanguageModel({ model: openai("gpt-4o"), middleware: boltMiddleware() });
```

Turn steering on for the project in Bolt (it is off by default):

```bash
neatbolt steering advisory --project refund-agent   # or gate, self-check, off
```

Also available: `wrapAnthropic`, `applyMessages`, `applyAnthropic`, `guidance()`,
`CHECK_MY_WORK_TOOL` / `ANTHROPIC_CHECK_MY_WORK_TOOL` with `checkMyWork(question)` and
`handleToolCall(name, args)`, and `BoltHalt` for your own halt rules.

Configuration: `NEATBOLT_URL` (default: a local `NEATLOGS_ENDPOINT`, else `http://localhost:4100`),
`NEATBOLT_STEER=off` to disable, `NEATBOLT_STEER_DEBUG=1` to log each claim. If you trace without the
Neatlogs SDK, pass `configure({ traceId: () => currentTraceIdHex })`.
