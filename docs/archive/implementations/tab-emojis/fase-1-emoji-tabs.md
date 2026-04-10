# Tab Emojis Phase 1 — Historical Note

This phase file described an unimplemented feature. The current tab routes and
tab manager do not expose emoji storage or emoji mutation endpoints.

## Current tab routes

- `POST /tabs/open`
- `POST /tabs/close`
- `GET /tabs/list`
- `POST /tabs/focus`
- `POST /tabs/group`
- `POST /tabs/source`
- `POST /tabs/reconcile`
- `POST /tabs/cleanup`

## Not current

- `/tabs/:id/emoji`
- persistent tab emoji storage
- shell IPC for `tab-emoji-changed`
