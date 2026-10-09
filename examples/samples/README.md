# samples

Seven scripted support-agent runs, each with a known failure for neatroots' checks to find:
a lookup loop on a 404, an ignored tool error, a prompt injection in tool output, a personal-data
leak, a contradiction, a leaked secret, and one clean run.

```bash
pip install -r ../refund-agent/requirements.txt
python run_samples.py                 # all of them
python run_samples.py injection happy # some of them
```
