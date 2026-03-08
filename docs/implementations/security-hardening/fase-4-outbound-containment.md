# Phase 4 — Outbound Containment: Strengthen POST, PUT, PATCH, And WebSocket Policy

> **Feature:** Security hardening
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** Phase 3 complete

---

## Goal Or This Phase

Improve outbound protection so suspicious mutating requests and unknown
WebSocket flows are handled more consistently and more defensively.

---

## Existing Code To Read — Only This

| File | Look for | Why |
|------|----------|-----|
| `src/security/outbound-guard.ts` | `analyzeOutbound()`, `analyzeWebSocket()` | current outbound heuristics |
| `src/security/guardian.ts` | outbound request handling in `checkRequest()` | enforcement wiring |
| `src/security/types.ts` | outbound decision types | policy vocabulary |
| `AGENTS.md` | full file | workflow and anti-detect rules |

---

## Build In This Phase

### 1. Tighten Unknown Outbound Flows

Improve policy for:

- first-time mutating requests to unknown domains
- unknown WebSocket endpoints
- trusted-to-untrusted cross-origin transitions

### 2. Introduce Mode-Sensitive Behavior

Expected direction:

- `strict`: more blocking by default
- `balanced`: hold or flag more aggressively than today
- `permissive`: preserve usability where possible

### 3. Improve Explainability

Logs and API-visible security state should make it clear why a request was:

- allowed
- flagged
- held
- blocked

---

## Acceptance Criteria

- [ ] Unknown WebSocket policy is stricter and more predictable
- [ ] Mutating requests to suspicious destinations are handled more defensively
- [ ] False-positive behavior remains manageable in balanced mode
- [ ] Security logs explain the chosen action clearly

---

## Known Pitfalls

- Overblocking legitimate third-party auth/payment flows
- Assuming Electron `webRequest` can see more than it actually can
- Treating logging improvements as real containment improvements
