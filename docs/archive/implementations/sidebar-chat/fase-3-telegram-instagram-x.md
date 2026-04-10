# Sidebar Chat Phase 3 — Historical Note

This phase document referenced `GET /sidebar/status`, which is not part of the
current sidebar API.

## Current sidebar routes

- `GET /sidebar/config`
- `POST /sidebar/config`
- `POST /sidebar/items/:id/toggle`
- `POST /sidebar/items/:id/activate`
- `POST /sidebar/reorder`
- `POST /sidebar/state`

For current behavior, use `src/api/routes/sidebar.ts`.
