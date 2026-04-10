# Workspaces UI Phase 2 — Historical Note

This phase file described the earlier emoji-based workspace UI. The current
code uses icon slugs and id-based routes.

## Current shell-facing assumptions

- the workspace strip renders workspace `icon` and `color`
- switching targets `POST /workspaces/:id/switch`
- moving a tab targets `POST /workspaces/:id/move-tab`

## Not current

- `emoji` fields in the workspace model
- `/workspaces/:name/*` route examples
- `GET /workspaces/:name/tabs`

For current behavior, use:

- `src/workspaces/manager.ts`
- `src/api/routes/workspaces.ts`
