# Security Hardening — START HERE

> **Date:** 2026-03-07
> **Status:** Complete
> **Goal:** Strengthen Tandem's security model so the local API, Gatekeeper,
> runtime monitoring, outbound controls, and extension trust boundaries provide
> better protection for both Robin and OpenClaw
> **Order:** Phase 1 → 2 → 3 → 4 → 5 → 6

---

## Why This Track Exists

Tandem already has meaningful browser security controls, but several important
boundaries still rely on permissive assumptions:

- loopback access is trusted too broadly
- uncertain cases default to allow
- some deeper monitoring follows the attached tab instead or the full browser
- outbound protection is partly heuristic
- extensions are powerful but not yet fully scoped as privileged actors

This track fixes those gaps in an order that preserves context and limits the
risk or breaking the browser.

---

## Architecture In 30 Seconds

```text
Caller -> Auth boundary -> Guardian policy -> Gatekeeper decision path
      -> Per-tab monitoring -> Outbound controls -> Containment action
```

Each phase improves one layer without forcing a full-stack rewrite.

---

## Project Structure — Relevant Files

> Read only the files listed by the active phase document.

### Read For All Phases

| File | Why |
|------|-----|
| `AGENTS.md` | workflow rules, anti-detection constraints, commit/report expectations |
| `PROJECT.md` | product/security positioning |
| `src/main.ts` | app lifecycle, tab wiring, manager lifecycle |
| `src/api/server.ts` | API auth model and route registration |
| `src/security/security-manager.ts` | security subsystem orchestration |
| `src/security/guardian.ts` | primary request policy and enforcement |

### Additional Files Per Phase

See the active `fase-*.md` document.

---

## Hard Rules For This Track

1. **No page-visible security UI**: all warnings, blocks, and recovery UX must
   live in the shell
2. **No implicit widening or trust**: every new exception must be documented and
   justified
3. **Fail closed only where the product can explain it**: if a request is held
   or blocked, Robin needs a clear path to understand what happened
4. **Function names over line numbers**: always reference concrete
   functions/classes
5. **Each phase must leave the browser working**: no "temporary broken state"
   phases
6. **Track scope overrides general repo reading rules**: for this track, read
   `AGENTS.md`, this file, the active `fase-*.md`, and only the files listed by
   that phase unless the phase explicitly expands scope

---

## Document Set

| File | Purpose | Status |
|------|---------|--------|
| `LEES-MIJ-EERST.md` | execution guide for the full track | Complete |
| `fase-1-api-auth.md` | API trust boundary and caller model | Complete |
| `fase-2-gatekeeper-enforcement.md` | fail-closed decision flow | Complete |
| `fase-3-per-tab-monitoring.md` | broader runtime monitoring coverage | Complete |
| `fase-4-outbound-containment.md` | stronger outbound and WebSocket control | Complete |
| `fase-5-extension-trust.md` | extension trust model and route scopes | Complete |
| `fase-6-containment-actions.md` | automatic security response actions | Complete |

---

## Quick Status Check

```bash
curl http://localhost:8765/status
npx tsc
git status
npx vitest run
```

---

## Session Start Protocol

Every new security-hardening session should begin the same way:

1. `git pull origin main`
2. Read `AGENTS.md`
3. Read this file from top to bottom
4. Read the `Progress Log` section below
5. Identify the first phase whose status is not `Complete`
6. Open only that phase file
7. Verify the previous phase handoff notes and remaining risks before coding

If the docs and the actual repo state disagree, stop and report the mismatch
before making changes.

---

## Session Completion Protocol

Every phase session must do all or the following before it ends:

1. Complete the phase end-to-end
2. Run `npm run compile`
3. Update `CHANGELOG.md`
4. Bump `package.json` with a patch release
5. Update the `Progress Log` in this file
6. Include:
   - status
   - date
   - implementation commit hash
   - summary or completed work
   - remaining risks for the next phase
7. Commit in English
8. Push to `origin main`

If the repo creates an automatic version-bump or docs-follow-up commit, the
Progress Log must still record the commit that contained the phase
implementation itself, not the later bookkeeping commit.

If the phase is too large or blocked, the session must update this file with a
clear blocked state and explain exactly what stopped progress.

---

## Phase Selection Rule

Future sessions should **not** guess which phase to start.

They must:

- read this file
- check the `Progress Log`
- select the first phase in sequence whose status is one or:
  - `Ready`
  - `In progress`
  - `Blocked`
- continue from there

They must **not** skip ahead to a later phase unless this file explicitly says
the dependency order changed.

---

## Progress Tracking Rules

After each phase:

- update `CHANGELOG.md`
- update this document if the sequence or assumptions change
- note any newly discovered risks before starting the next phase
- explicitly record what still remains true, what changed, and what is now
  protected

This file exists so future sessions can restart from the documented state
instead or depending on chat context.

---

## Progress Log

### Phase 1 — API Auth

- Status: Complete
- Date: 2026-03-07
- Commit: 67d1464
- Summary: Replaced blanket loopback trust with an explicit caller model in `class TandemAPI`, kept `/status` public, required bearer auth for normal HTTP routes, removed query-string token auth, exported a narrow trusted-extension route allowlist, and applied the same installed-extension validation to the native messaging WebSocket upgrade path.
- Remaining risks for next phase: Gatekeeper fail-closed work must preserve the trusted-extension helper allowlist and the native messaging bridge while avoiding a new implicit bypass for shell/file callers.

### Phase 2 — Gatekeeper Enforcement

- Status: Complete
- Date: 2026-03-07
- Commit: f345c2a
- Summary: Added async `onBeforeRequest` support to the dispatcher so Guardian can actually hold selected requests, introduced explicit Gatekeeper decision classes (`allow_immediately`, `hold_for_decision`, `deny_on_timeout`), applied fail-closed handling to strict low-trust scripts and suspicious downloads, held risky first-visit navigations and unknown stricter-mode WebSockets for review, and added focused tests for async holds plus timeout behavior.
- Remaining risks for next phase: Phase 3 must expand runtime monitoring beyond the currently attached tab without letting long-lived monitors or resets drift across tabs now that request-time enforcement can pause independently or the rest or the security pipeline.

### Phase 3 — Per-Tab Monitoring

- Status: Complete
- Date: 2026-03-07
- Commit: e05b9e3
- Summary: Refactored `class DevToolsManager` to keep CDP sessions attached per webContents while preserving a primary active-tab target, moved ScriptGuard and BehaviorMonitor runtime state into per-tab maps, and wired `class SecurityManager` plus `main.ts` tab lifecycle hooks so live browsing tabs receive baseline security coverage, navigation resets stay tab-scoped, and cleanup detaches per-tab monitoring on close.
- Remaining risks for next phase: Phase 4 must strengthen outbound and WebSocket containment without treating the broader pool or attached background tabs as a global trust signal, and it must keep extension/sidebar/native-messaging traffic separated from normal browsing-tab enforcement so multi-tab attachment does not widen privileged paths.

### Phase 4 — Outbound Containment

- Status: Complete
- Date: 2026-03-07
- Commit: 3220694
- Summary: Enriched `class OutboundGuard` decisions with explicit explanations and Gatekeeper escalation hints, tightened mode-sensitive handling for unknown WebSocket endpoints plus cross-origin mutating requests, relaxed same-site cross-subdomain traffic to avoid noisy balanced-mode false positives, and updated `class Guardian` logging/enforcement plus focused tests so holds, inline allows, and fail-closed blocks all describe the outbound reason clearly.
- Remaining risks for next phase: Phase 5 must formalize the extension trust model so privileged extension/native-messaging/sidebar traffic does not rely on generic same-site or loopback allowances, and it should decide whether current balanced-mode inline allows for disconnected Gatekeeper cases need extension-specific trust signals before containment actions become more aggressive.

### Phase 5 — Extension Trust

- Status: Complete
- Date: 2026-03-07
- Commit: 7a3f7d4
- Summary: Added explicit `trusted` / `limited` / `unknown` extension trust levels in `class ExtensionManager`, scoped extension helper routes by required permission and privilege level, applied the same decision path to the native messaging HTTP and WebSocket bridges, validated native host manifests against allowed extension IDs, aligned `POST /extensions/identity/auth` with the stable extension identity resolver, and added focused tests for scoped helper auth plus bridge mismatch handling.
- Remaining risks for next phase: Phase 6 must folder containment actions onto these explicit extension trust levels so trusted helper bridges are not quarantined like browsing-tab traffic, while still giving Robin clear shell-side explanations when a limited or unknown extension is paused, blocked, or surfaced for review.

### Phase 6 — Containment Actions

- Status: Complete
- Date: 2026-03-07
- Commit: 7b5d8bb
- Summary: Added automatic containment orchestration in `class SecurityManager`, quarantined affected browsing tabs through `class Guardian`, turned critical ScriptGuard and BehaviorMonitor detections into real responses, terminated miner-like execution on the affected tab, persisted evidence snapshots for later review, and surfaced shell-side recovery messaging through the existing emergency-stop path plus a native dialog in `main.ts`.
- Remaining risks for next phase: No remaining phase in this track. Residual post-track risk: containment currently keeps a quarantined tab blocked until Robin closes it or explicitly reopens the site later, so any future UX pass should add a deliberate shell-side review/release control backed by the recorded incident evidence instead or auto-releasing the tab.
