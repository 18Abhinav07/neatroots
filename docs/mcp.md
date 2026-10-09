# Coding agents (MCP)

Bolt serves MCP over streamable HTTP at `http://localhost:4100/mcp` and over stdio with
`neatbolt mcp` (which starts Bolt if it is not running). Both expose the same tools.

```bash
claude mcp add --scope user neatbolt -- neatbolt mcp
```

| Tool | Returns | Model |
| --- | --- | --- |
| `get_current_run` | The run in focus in the app (or the latest), its outline, findings and selected span | none |
| `search_runs` | Runs by workflow, project, status, findings, time or text | none |
| `get_run_outline` | Span tree with kinds, status, tokens, durations, previews, findings inline | none |
| `get_span` | A span's input, output, error and attributes; JSONPath selection and paging | none |
| `list_findings` | Findings with probabilities, evidence span ids and explanations | none |
| `explain_run` | Likely cause, the spans that show it, a fix, and an evidence-support score | local LLM, checked by the decision model |
| `ask` | An answer over local runs, citing span ids | local LLM, checked by the decision model |
| `judge` | The probability that a yes/no question about chosen spans is yes | decision model |
| `create_check`, `preview_check` | A new check from a concern or YAML, and its hit rate on recent runs | local LLM, then decision model |
| `annotate` | Marks a run or span as issue, good, or a note | none |
| `rerun` | Reruns the agent with the command you registered (`neatbolt rerun add`) | none |
| `push_to_cloud` | Asks to send runs to Neatlogs Cloud; you confirm in the app | none |

Span ids can be shortened to any unique prefix. Run content is data recorded from an agent; the
server's instructions tell clients not to follow instructions inside it.
