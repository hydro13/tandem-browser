# Workspaces UI Phase 1 — Historical Note

This phase document no longer matches the shipped code.

## Current backend behavior

- workspace records are stored in `~/.tandem/workspaces.json`
- each workspace has `id`, `name`, `icon`, `color`, `order`, `isDefault`, and `tabIds`
- the active workspace is tracked by id
- tabs are assigned and moved by workspace id

## Current routes

- `GET /workspaces`
- `POST /workspaces`
- `DELETE /workspaces/:id`
- `POST /workspaces/:id/switch`
- `PUT /workspaces/:id`
- `POST /workspaces/:id/move-tab`

## Not in the current code

- name-based workspace routes
- `GET /workspaces/:id/tabs`
- emoji-based workspace metadata
- a documented 1:1 mapping between workspaces and sessions

Use `src/workspaces/manager.ts` and `src/api/routes/workspaces.ts` as the
current reference.
