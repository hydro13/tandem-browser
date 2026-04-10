# Search in Tabs Phase 1 — Historical Note

This phase file no longer matches the shipped API surface.

## Not in the current code

- `GET /tabs/closed`
- any documented closed-tab search API
- tab emoji fields used in the search payload

## Current endpoints relevant to tab search

- `GET /tabs/list`
- `POST /tabs/focus`
- `POST /tabs/open`

Use the live route files under `src/api/routes/` as the source of truth.
