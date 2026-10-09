# Checks

A check is anything Bolt watches for. Checks are YAML, loaded from (later wins on the same id):

1. the shipped library (`packages/bolt/library/`),
2. `~/.neatbolt/checks/`,
3. each project's `.neatbolt/checks/` registered with `neatbolt init`,
4. questions the planner or a coding agent wrote (kept in the database until you save them).

## Rules

Code, no model, every span.

```yaml
id: repeated-tool-call
kind: rule
title: Same tool called repeatedly with identical arguments
rule:
  type: repeat            # repeat | errors | count | threshold | match | run_end
  span: { type: [tool, mcp_tool] }
  same: [tool, input]
  at_least: 3
guidance: >-
  You have called {tool} {count} times with the same arguments ({args}) ...
action: flag              # or halt (your own rules only)
```

| type | Fires when |
| --- | --- |
| `repeat` | `at_least` matching spans share the `same` fields; resolves when the next call differs |
| `errors` | `consecutive` matching spans failed in a row |
| `count` | the run has `at_least` matching spans |
| `threshold` | a run metric (`total_tokens`, `llm_calls`, `duration_ms`, …) reaches `at_least` |
| `match` | a regex matches a span's `input`, `output`, `error` or `name` |
| `run_end` | the run ended with `error`, `no_output` or `interrupted` |

## Questions

Answered by the decision model with a probability. Yes/no questions are phrased as failures, so a
high probability always means a problem.

```yaml
id: refund-without-ownership
kind: yes_no              # yes_no | choice | score
scope: trace              # span | trace | session
ask: Did the agent issue a refund without first confirming the customer owns the order?
evidence:
  spans: { type: tool, name: [lookup_order, issue_refund] }
  fields: [input, output, status]
  last: 12
  final_output: false
when: live                # live (as spans arrive, and at run end) | end
flag_at: 0.8
guidance: Confirm the customer owns the order before issuing a refund.
applies_to: { workflow: refund-agent }
```

`choice` questions take `options` (label → description) and `flag_on`; `score` questions take
`levels` and `flag_at_level`.

## Where questions come from

- The **question library**: ignored tool errors, repeating without progress, answers that contradict
  tools, system-prompt violations, unfinished tasks, following instructions found in tool content,
  personal data in output, wrong tool or arguments.
- The **planner**: on a workflow's first run the local LLM reads the system prompt, first user message
  and tools, picks 3–8 library questions, fills in parameters, and writes new questions only for gaps.
  Plans are cached per workflow and redone when new tools appear.
- **You**: describe a concern in the app (Checks → New check) and the LLM drafts the question; preview
  it on recent runs before saving.
- **Coding agents**: `create_check` and `preview_check` over MCP.

## Findings

A finding is raised when a rule fires or a probability crosses the line. It becomes **active** when a
note reaches the agent, **resolved** when a later check of the same question falls below the line, and
**dismissed** when you disagree. A model error or timeout records the check as **not checked**; it never
counts as a pass. Dismissals feed each check's precision; noisy checks are flagged for retirement.

## Which model answers

With `classifier.backend: auto`: Jev cloud when you turned it on; otherwise the local LLM. Every LLM
answer is also put to Laya in the background, and Bolt records whether Laya agreed. Once Laya agrees
on at least 90% of 30 answers for a question, that question goes to Laya first (about 100 ms instead of
seconds). With no local LLM, Laya answers everything. Settings → Models shows the agreement per question.

## Cost control

When the local LLM stands in for the decision model, span-level questions are asked only about the
newest waiting span (at most four per check per run), identical questions are answered from a cache,
and note-writing jumps the LLM queue. With Laya or Jev every span is asked.
