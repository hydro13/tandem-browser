# Workspaces UI — Current Notes

This implementation pack predates the current workspace model.

## Current code shape

- routes are id-based, not name-based
- workspace metadata uses `icon` slugs, not emoji fields
- workspaces are tab-grouping and filtering state, not a 1:1 wrapper over `SessionManager`

## Live routes

- `GET /workspaces`
- `POST /workspaces`
- `DELETE /workspaces/:id`
- `POST /workspaces/:id/switch`
- `PUT /workspaces/:id`
- `POST /workspaces/:id/move-tab`

## Source of truth

- `src/workspaces/manager.ts`
- `src/api/routes/workspaces.ts`

Treat the older phase docs in this folder as historical implementation notes,
not as current API documentation.
