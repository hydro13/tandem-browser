# Phase 3 — Per-Tab Monitoring: Expand Runtime Coverage Beyond The Attached Tab

> **Feature:** Security hardening
> **Sessions:** 1-2 sessions
> **Priority:** HIGH
> **Depends on:** Phase 2 complete

---

## Goal Or This Phase

Broaden ScriptGuard and BehaviorMonitor coverage so runtime security is not tied
mainly to the currently attached or focused tab.

---

## Existing Code To Read — Only This

| File | Look for | Why |
|------|----------|-----|
| `src/main.ts` | tab registration and attach flow | current trigger path |
| `src/security/security-manager.ts` | `onTabAttached()` | current single-tab runtime wiring |
| `src/security/script-guard.ts` | monitor injection and subscriptions | per-tab assumptions |
| `src/security/behavior-monitor.ts` | resource monitoring | attachment assumptions |
| `src/devtools/manager.ts` | attach model | CDP lifecycle constraints |
| `AGENTS.md` | full file | workflow and anti-detect rules |

---

## Build In This Phase

### 1. Introduce Per-Tab Security State

Track which tabs have:

- CDP attached
- monitors injected
- resource monitoring active
- strict-mode policy

### 2. Expand Coverage

Ensure that at least one or these becomes true:

- every live browsing tab gets baseline security coverage
- high-risk tabs get full monitoring automatically

### 3. Preserve Lifecycle Hygiene

All per-tab state must be cleaned up on:

- tab close
- navigation reset where required
- window teardown

---

## Acceptance Criteria

- [ ] Security coverage is no longer limited to only the active tab path
- [ ] Background or restored tabs receive the intended baseline monitoring
- [ ] No obvious lifecycle leaks or duplicate monitor injection
- [ ] `npm run compile` and relevant tests still pass

---

## Known Pitfalls

- CDP attach churn and performance regressions
- monitor injection races during tab restore/navigation
- leaked intervals/subscriptions on tab close
