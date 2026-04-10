# Sidebar Chat Phase 1 — Historical Note

This phase file predates the current sidebar route set.

## Current sidebar routes

- `GET /sidebar/config`
- `POST /sidebar/config`
- `POST /sidebar/items/:id/toggle`
- `POST /sidebar/items/:id/activate`
- `POST /sidebar/reorder`
- `POST /sidebar/state`

## Not in the current code

- `GET /sidebar/status`
- the older `/sidebar/open`, `/sidebar/close`, and `/sidebar/toggle` examples from this implementation track

Use `src/api/routes/sidebar.ts` and `src/sidebar/manager.ts` as the current
reference.
