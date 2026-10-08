# Working on Bolts

Bolts checks AI agents on the developer's machine. Read `README.md` and `docs/architecture.md` first.

## Ground rules

- Public inputs only: the public Neatlogs SDKs and their telemetry schema and doctor contract,
  OpenTelemetry, MCP, publicly documented APIs (Jev), openly licensed models. Never copy code,
  prompts, schemas or logic from Neatlogs' internal services. The UI follows the Neatlogs design
  language (tokens and design rules only).
- Local by default. Nothing leaves the machine unless the user turns it on (cloud forward, Jev cloud, a hosted LLM).
- Keep `/v1/traces` and the doctor read-back compatible with what the public SDKs send to
  ingest.neatlogs.com; keep stored spans lossless so cloud forwarding stays exact.

## Commands

```bash
pnpm install && pnpm build
pnpm test                                  # packages/bolts (vitest)
cd packages/steer-ts && pnpm test
cd python/bolts-steer && python -m pytest  # needs a venv with pytest
pnpm --filter @neatlogs/bolts typecheck && pnpm --filter @neatlogs/bolts-ui typecheck
```

## Conventions

- Node ≥ 22, ESM, TypeScript strict. Files under 500 lines.
- The server logs to stderr only (stdout belongs to `bolts mcp`).
- UI: Tailwind v4 semantic tokens only (no raw colors, no arbitrary type sizes), Hugeicons through
  `components/ui/icon.tsx`, StatusPill for state and NeatBadge for categories, one primary (default)
  Button per view, the Empty family for empty states, Verb + Noun labels on actions.
- Checks: library YAML in `packages/bolts/library/`; yes/no questions are phrased as failures.
