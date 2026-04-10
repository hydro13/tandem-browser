# Phase 2 — Gatekeeper Enforcement: Stop Default-Allow For Uncertain Cases

> **Feature:** Security hardening
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** Phase 1 complete

---

## Goal Or This Phase

Turn Gatekeeper from an advisory system into an enforcement layer for selected
high-risk cases. The end result should be that chosen classes or requests are
held for a decision or denied on timeout instead or being allowed immediately.

---

## Existing Code To Read — Only This

| File | Look for | Why |
|------|----------|-----|
| `src/security/guardian.ts` | `queueForGatekeeper()`, `checkRequest()` | current allow-first behavior |
| `src/security/gatekeeper-ws.ts` | `sendDecisionRequest()`, timeout handling | decision lifecycle |
| `src/security/security-manager.ts` | `initGatekeeper()` | system wiring |
| `src/security/types.ts` | gatekeeper-related types | policy model |
| `AGENTS.md` | full file | workflow and anti-detect rules |

---

## Build In This Phase

### 1. Introduce Decision Classes

Create explicit categories such as:

- allow immediately
- hold for decision
- deny on timeout

### 2. Apply Fail-Closed Policy To High-Risk Cases

Candidate buckets:

- first-visit `mainFrame` navigations
- strict-mode script loads on low-trust domains
- suspicious downloads
- unknown WebSocket endpoints in stricter modes

### 3. Keep Balanced Mode Usable

Avoid turning normal browsing into constant prompt spam. This phase should
tighten policy, not destroy usability.

---

## Acceptance Criteria

- [ ] Selected uncertain requests are no longer always allowed immediately
- [ ] Timeout behavior is explicit and testable
- [ ] Normal balanced-mode browsing still works
- [ ] Logs clearly show when a request was held, allowed, blocked, or timed out

---

## Known Pitfalls

- Over-triggering prompts and making the browser unusable
- Introducing request hangs without visible recovery
- Applying fail-closed logic to low-value events instead or real risk
