# Design: Security Hardening Roadmap

> **Date:** 2026-03-07
> **Status:** Approved
> **Effort:** Hard (multi-phase)
> **Author:** Kees

---

## Problem / Motivation

Tandem already has a real security stack, but the current implementation does
not yet provide a complete containment boundary for either the human user or the
AI runtime.

The highest-impact gaps today are:

- the local HTTP API trusts loopback traffic too broadly
- Gatekeeper defaults to allow for uncertain requests
- deep runtime monitoring follows the attached tab more than the full browser
- outbound protection is meaningful but only partial
- extensions are privileged but not yet scoped like privileged actors
- several layers detect and log, but do not yet contain

**Goal:** convert the current stack from "good telemetry + targeted prevention"
into a layered security architecture that is harder to bypass, easier to reason
about, and safer for OpenClaw to use against the live web.

---

## User Experience — How It Should Feel

> Robin browses normally. Tandem stays usable and does not drown him in prompts.
> OpenClaw can still navigate, inspect, and automate, but higher-risk actions
> are explicitly gated. Dangerous flows fail closed. Suspicious tabs or requests
> are isolated early instead of merely being logged after the fact.

This roadmap is intentionally designed to improve containment without making the
browser feel constantly blocked or brittle.

---

## Technical Approach

### Architecture

```text
Local caller / Shell / OpenClaw / Extension
                |
                v
        Auth + Scope Boundary
                |
                v
    Guardian Policy + Gatekeeper Enforcement
                |
                v
  Per-tab Runtime Monitoring + Trust Evolution
                |
                v
   Outbound / WS Control + Extension Isolation
                |
                v
        Automatic Containment Actions
```

### New Files

| File | Responsibility |
|------|----------------|
| `docs/implementations/security-hardening/LEES-MIJ-EERST.md` | Execution guide for the full hardening track |
| `docs/implementations/security-hardening/fase-1-api-auth.md` | API trust-boundary hardening |
| `docs/implementations/security-hardening/fase-2-gatekeeper-enforcement.md` | Gatekeeper fail-closed policy |
| `docs/implementations/security-hardening/fase-3-per-tab-monitoring.md` | Multi-tab security coverage |
| `docs/implementations/security-hardening/fase-4-outbound-containment.md` | Stronger outbound and WebSocket policy |
| `docs/implementations/security-hardening/fase-5-extension-trust.md` | Extension trust model and route scoping |
| `docs/implementations/security-hardening/fase-6-containment-actions.md` | Automatic isolation and incident response |

### Existing Files Expected To Change Across The Track

| File | Why |
|------|-----|
| `src/api/server.ts` | auth boundary, local/internal caller model |
| `src/api/routes/extensions.ts` | extension-origin policy and capability scoping |
| `src/security/guardian.ts` | fail-closed policy and risk classification |
| `src/security/gatekeeper-ws.ts` | decision lifecycle and timeout behavior |
| `src/security/security-manager.ts` | per-tab security orchestration |
| `src/security/script-guard.ts` | broader coverage and containment hooks |
| `src/security/behavior-monitor.ts` | per-tab monitoring and escalation |
| `src/security/outbound-guard.ts` | stronger POST/PUT/PATCH/WebSocket controls |
| `src/main.ts` | lifecycle wiring, tab attach, cleanup |
| `src/extensions/*` | extension trust boundaries and allowed capabilities |

### New API / Policy Concepts

| Area | Expected Outcome |
|------|------------------|
| API auth | loopback is no longer enough for full access |
| Internal shell access | uses IPC or a dedicated internal auth lane |
| Gatekeeper policy | selected requests can be held or denied on timeout |
| Tab monitoring | runtime protections apply beyond the focused tab |
| Extension access | sensitive routes require explicit extension trust |
| Containment | critical detections can isolate tabs or suspend automation |

### New npm packages?

No new npm packages are expected for the initial roadmap.

---

## Phase Breakdown

| Phase | Focus | Sessions | Depends on |
|------|-------|----------|------------|
| 1 | API trust boundary and auth hardening | 1 | — |
| 2 | Gatekeeper enforcement and fail-closed policy | 1 | Phase 1 |
| 3 | Per-tab security coverage | 1-2 | Phase 2 |
| 4 | Outbound and WebSocket containment | 1 | Phase 3 |
| 5 | Extension trust model and route scoping | 1 | Phase 4 |
| 6 | Automatic containment actions | 1 | Phase 5 |

---

## Risks / Pitfalls

- **Breaking local integrations:** tightening the API too early can break shell
  features, OpenClaw calls, or extension bridges if the caller model is not
  made explicit first
- **Too many prompts:** fail-closed policy can make browsing unusable unless
  the decision buckets are carefully chosen
- **CDP overhead:** attaching deeper monitoring to more tabs can create
  lifecycle complexity and performance regressions
- **Extension regressions:** privileged extension behavior must be scoped without
  breaking essential flows like 1Password
- **Containment UX:** automatic isolation must be visible and reversible

### Follow-up Design

- `docs/plans/security-containment-review-design.md` — containment recovery UX,
  safe review tabs, and optional technical-detail flows after automatic
  containment

---

## Anti-Detect Considerations

- API auth and policy work should stay outside the page context
- Per-tab security instrumentation must continue to avoid detectable page-side
  artifacts
- Any new enforcement UI belongs in the shell, not in the webview
- Extension scoping must avoid introducing site-visible browser fingerprints

---

## Recommended Execution Strategy

1. Fix trust boundaries before tuning detections
2. Make risky cases fail closed before expanding coverage
3. Expand coverage across tabs only after the policy model is stable
4. Treat extensions as privileged local software, not normal page content
5. Add containment actions last, after signals and false-positive behavior are
   better understood

This sequence keeps the blast radius manageable and preserves context from one
phase to the next.
