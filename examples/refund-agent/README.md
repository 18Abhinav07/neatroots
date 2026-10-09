# refund-agent

A refund agent steered by neatroots: when a check fires mid-run, neatroots puts a short note into
the agent's next LLM call (through `neatroots_steer.wrap`). Watch the notes in the run's
"Notes to the agent" panel.

```bash
pip install -r requirements.txt
neatroots steering advisory --project refund-agent
python agent.py "Refund order 4512"                          # with Ollama
LLM_BASE_URL=http://127.0.0.1:4199/v1 python agent.py        # with the scripted fake LLM (python fake_llm.py)
```
