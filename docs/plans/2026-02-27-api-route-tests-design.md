# API Route Integration Tests — Design

**Item:** #17 from code-quality STATUS.md
**Date:** 2026-02-27
**Approach:** Supertest + Vitest

## Architecture

One shared test helper + 12 test files (one per route file).

```
src/api/tests/
  helpers.ts           — mock context factory + test app builder
  routes/
    agents.test.ts     — 16 endpoints
    browser.test.ts    — 14 endpoints
    content.test.ts    — 17 endpoints
    data.test.ts       — 25 endpoints
    devtools.test.ts   — 15 endpoints
    extensions.test.ts — 14 endpoints
    media.test.ts      — 19 endpoints
    misc.test.ts       — 55+ endpoints
    network.test.ts    — 10 endpoints
    sessions.test.ts   — 11 endpoints
    snapshots.test.ts  — 8 endpoints
    tabs.test.ts       — 7 endpoints
```

## Test Helper (`helpers.ts`)

- `createMockContext()` — returns a `RouteContext` where every manager property is a vi.fn() stub with sensible defaults (empty arrays, resolved promises).
- `createTestApp(registerFn, ctx)` — creates a minimal Express app with `express.json()` middleware, calls the route registration function, and returns the app for supertest.
- Mock `BrowserWindow` (win) with a vi.fn() stub.

## Test Pattern Per Endpoint

For each endpoint, 2-3 tests:
1. **Happy path** — manager returns data, assert 200 + response body shape
2. **Error handling** — manager throws, assert 500 + `{ error: '...' }`
3. **Validation** (where applicable) — missing required fields, assert 400

## Dependencies

- `supertest` + `@types/supertest` as devDependencies
- Mock `electron` module at top of each test file (existing pattern from tabs.test.ts)

## Scope

~200 endpoints x ~2.5 tests = ~500 test cases, ~4000-5000 lines of test code.
