# CLAUDE.md

Read [AGENTS.md](./AGENTS.md) in full — it is the development guide for coding
agents working on this repository: workflow, testing gates, git discipline,
context discipline, and the anti-detection architecture rules that must never
be violated.

Before changing code, also read [ARCHITECTURE.md](./ARCHITECTURE.md) for the
layer model and the manager system.

Quick facts:

- Verify gate (same as CI): `npm run verify`
- Managers: see `src/registry.ts` (the source of truth, not doc counts)
- All repository content is English; replies to Robin may be Dutch
