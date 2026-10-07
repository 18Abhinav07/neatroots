import type { Status } from "../api";
import { BoltIcon, CopyButton } from "./bits";

export function EmptyState({ port, status }: { port: number; status?: Status }) {
  const env = `export NEATLOGS_ENDPOINT=http://localhost:${port}\nexport NEATLOGS_API_KEY=bolts-local`;
  const py = `import neatlogs\nneatlogs.init(workflow_name="my-agent", instrumentations=["openai"], flush_interval=0.5)`;
  return (
    <div className="empty">
      <div>
        <BoltIcon size={44} />
        <h1>Waiting for your first run</h1>
        <p>Bolts checks AI agents while they run on this machine. Point the public Neatlogs SDK at it; nothing leaves your computer.</p>
        <div className="codeblock mono">
          {env}
          <CopyButton text={env} />
        </div>
        <div className="codeblock mono">
          {py}
          <CopyButton text={py} />
        </div>
        <p className="hint">
          Already instrumented? Just set the two variables. Check the path with <span className="mono">neatlogs doctor --probe</span>.
        </p>
        {status?.engine && !status.engine.llm.ok && (
          <p className="hint" style={{ color: "var(--signal)" }}>
            No local LLM found at {status.config.llm.baseUrl}. Rules will still run; start Ollama or LM Studio for questions, explanations and notes.
          </p>
        )}
      </div>
    </div>
  );
}
