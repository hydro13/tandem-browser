# Current API Notes

This document covers live API features that are easy to miss in the README.
It is based on the current code in `src/api/routes/` and related modules.

## Route Count

Tandem currently exposes `301` HTTP routes across the API and security route
modules.

## `POST /tabs/open`

Opens a new tab.

### Important request fields

- `url` optional, defaults to `about:blank`
- `groupId` optional
- `source` optional: `robin`, `kees`, or `wingman`
- `focus` optional boolean, defaults to `true`
- `inheritSessionFrom` optional string tab id

### `inheritSessionFrom`

If `inheritSessionFrom` points at an existing source tab, Tandem will:

1. open the destination tab
2. dump IndexedDB data from the source tab
3. restore that IndexedDB data into the new tab
4. reload the destination page

This is intended for sites that keep login state in IndexedDB instead of
cookies or localStorage.

If the source tab does not exist, Tandem still opens the tab and ignores the
inheritance request.

## `X-Tab-Id` Background Targeting

Use `X-Tab-Id: <tabId>` when you want to inspect or evaluate a background tab
without focusing it first.

### Current route support

- `GET /snapshot`
- `GET /page-content`
- `GET /page-html`
- `POST /execute-js`
- `POST /wait`
- `GET /links`
- `GET /forms`

`POST /execute-js` also still accepts `tabId` in the JSON body, but the header
is the preferred targeting mechanism.

### Snapshot refs

Snapshot refs now remember which tab produced them, so `/snapshot/text`,
`/snapshot/click`, and `/snapshot/fill` keep resolving against that source tab
instead of whichever tab happens to be active later.

## Injection Scanner Middleware

The injection scanner sits on agent-facing content routes:

- `GET /page-content`
- `GET /page-html`
- `GET /snapshot`
- `GET /snapshot/text`
- `POST /execute-js`

It scans returned text and HTML for prompt-injection patterns.

### Outcomes

- score `< 30`: response passes unchanged
- score `30-69`: response passes with `injectionWarnings`
- score `>= 70`: response is blocked unless the domain has an active override

### `injectionWarnings`

Warning responses add:

```json
{
  "injectionWarnings": {
    "riskScore": 42,
    "findingCount": 2,
    "summary": "…",
    "findings": [
      {
        "id": "ignore_previous",
        "severity": "critical",
        "category": "instruction_override",
        "description": "Attempts to override prior instructions",
        "matchedText": "ignore previous instructions"
      }
    ]
  }
}
```

Blocked responses do not include the original page payload.

## `POST /security/injection-override`

Temporarily bypasses prompt-injection blocking for one domain.

### Request body

```json
{ "domain": "example.com" }
```

### Behavior

- grants a 5-minute override
- intended for explicit user confirmation after a block event

## `GET /config/openclaw-connect`

Builds the signed OpenClaw gateway connect payload used by Tandem's in-app
Wingman chat.

### Query parameters

- `nonce` required

### Response

Returns:

```json
{ "params": { "...": "signed connect payload" } }
```

### Error conditions

- `400` if `nonce` is missing
- `404` if `~/.openclaw/openclaw.json` is missing

## `GET /network/har`

Exports the current network log in HAR format.

### Query parameters

- `limit` optional, defaults to `100`
- `domain` optional filter

### Behavior

- returns HAR JSON
- sets `Content-Disposition` so the response downloads as a `.har` file

## Google Photos Integration

Routes:

- `GET /integrations/google-photos/status`
- `POST /integrations/google-photos/config`
- `POST /integrations/google-photos/connect`
- `POST /integrations/google-photos/disconnect`
- `GET /google-photos/oauth/callback`

These endpoints support local OAuth configuration, connect or disconnect, and
the callback flow used for screenshot uploads.

## Preview System

Routes:

- `GET /previews`
- `POST /preview`
- `PUT /preview/:id`
- `GET /preview/:id/meta`
- `GET /preview/:id`
- `DELETE /preview/:id`
- `GET /previews/index`

### Behavior

- previews are stored under `~/.tandem/previews/`
- `POST /preview` creates a preview and opens it in a new tab by default
- `PUT /preview/:id` updates it and increments its version
- `GET /preview/:id` serves the preview HTML with injected live reload polling
- preview pages are public routes so they can be opened directly in a browser tab

## `GET /active-tab/context`

Returns a compact agent-oriented view of the active browsing state.

### Includes

- readiness state
- active tab id, URL, and title
- viewport and scroll data when available
- a short text excerpt from the active page
- all open tabs with active-state markers

Use this when the agent needs context without separately polling `/status` and
content endpoints.
