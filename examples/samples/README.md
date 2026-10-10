# samples

Seven scripted support-agent runs, each with a known failure for neatroots' checks to find:
a lookup loop on a 404, an ignored tool error, a prompt injection in tool output, a personal-data
leak, a contradiction, a leaked secret, and one clean run.

```bash
uv run run_samples.py                 # all of them
uv run run_samples.py injection happy # some of them
uv run score.py                       # once checks finish: what each sample raised vs expected.json
```
