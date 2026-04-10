# Phase 6 — Containment Actions: Move From Detection To Response

> **Feature:** Security hardening
> **Sessions:** 1 session
> **Priority:** MEDIUM-HIGH
> **Depends on:** Phase 5 complete

---

## Goal Or This Phase

Add automatic containment responses so critical detections do not merely appear
in logs. The browser should be able to isolate, pause, or escalate when the
risk is high enough.

---

## Existing Code To Read — Only This

| File | Look for | Why |
|------|----------|-----|
| `src/security/script-guard.ts` | critical detections | response hooks |
| `src/security/behavior-monitor.ts` | anomaly detections | escalation triggers |
| `src/security/security-manager.ts` | orchestration | containment wiring |
| `src/security/guardian.ts` | mode/trust controls | policy side effects |
| `src/main.ts` | window/tab lifecycle | shell-visible actions |
| `AGENTS.md` | full file | workflow and anti-detect rules |

---

## Build In This Phase

### 1. Define Automatic Responses

Candidate actions:

- isolate tab
- suspend automation
- downgrade trust immediately
- require Robin review

### 2. Keep The UX Recoverable

Any automatic action should be:

- visible
- reversible where appropriate
- clearly explained in logs or shell UI

### 3. Preserve Forensics

Containment should not erase the evidence needed to understand what happened.

---

## Acceptance Criteria

- [ ] At least one critical detection path triggers a real containment action
- [ ] Robin can understand what happened and what to do next
- [ ] OpenClaw is paused or constrained when appropriate
- [ ] Incident evidence remains available for review

---

## Known Pitfalls

- Adding noisy auto-actions for medium-confidence events
- Hiding or silently killing tabs without explanation
- Containment logic creating new lifecycle bugs or data loss
