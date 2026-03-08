# Design: Security Containment Review UX

> **Date:** 2026-03-07
> **Status:** Draft
> **Effort:** Medium
> **Author:** Codex

---

## Problem / Motivation

Tandem now has working containment actions in `class SecurityManager`, but the
current shell warning still asks too much of the user.

Today the browser can say:

- a tab was quarantined
- future requests are blocked
- the site was forced into strict mode

But it still leaves the human with an implicit question that most users cannot
answer:

> "Was this a real threat or a false positive?"

That is not an acceptable product boundary for normal users. Tandem should make
the safe choice obvious by default and only expose deeper technical evidence to
users who explicitly want it.

**Goal:** replace the current containment popup with a recovery flow that:

- keeps non-technical users safe without requiring security judgment
- gives technical users optional extra evidence and controls
- never resumes a potentially compromised page in the same tab
- supports a controlled "safe review" experience for partial recovery

---

## Product Principles

1. **Do not ask the user to judge trust directly**
   Use action-oriented choices such as `Close Tab` or `Open Safe Review`, not
   `Allow Anyway`.

2. **Never resume the original contaminated tab**
   Once a critical script or runtime behavior has already executed, the page's
   DOM and JS state may already be compromised. Recovery must happen in a new
   tab with protections applied before load.

3. **Default to the safest understandable action**
   The standard recommendation should be obvious and should not require reading
   technical details.

4. **Technical detail is optional, not mandatory**
   Power users can inspect the evidence, but normal users should not need to.

5. **Warnings live in the shell, never in the page**
   All banners, dialogs, and controls remain outside the webview.

---

## User Experience

### Normal user flow

> Robin opens a site. Tandem detects a critical third-party script and contains
> the tab. The shell presents a clear warning: the tab was blocked to protect
> him. He sees three choices: `Close Tab`, `Open Safe Review`, and `Details`.
> He does not need to decide whether the script was malicious or benign.

### Technical user flow

> Robin opens `Details` and sees the trigger type, affected domain, blocked
> resources, containment actions taken, and the available review profiles. He
> can choose a safe review mode without reviving the original page.

---

## Recovery Model

### Current contaminated tab

The original tab remains quarantined or is closed.

It must **not** gain an `Allow anyway` action.

Allowed actions:

- `Close Tab`
- `Open Safe Review`
- `View Technical Details`

### Safe Review tab

Recovery happens by opening a new tab under an explicit review policy.

Initial review profiles:

| Profile | Purpose | Default audience |
|---------|---------|------------------|
| `flagged-domain-blocked` | Reload site while blocking only the detected suspicious domain(s) | default |
| `third-party-scripts-blocked` | Reload site while blocking all third-party scripts | safer fallback |
| `read-only-snapshot` | Show a non-interactive snapshot/text-oriented review mode | highest safety |

The browser should recommend `flagged-domain-blocked` first for general review,
then escalate to stricter profiles if the site still triggers containment or
breaks badly.

---

## UX Copy Strategy

### Default message

Use plain-language copy such as:

> **This tab was blocked to protect you**
>
> Tandem detected a suspicious script or behavior on this page and stopped the
> tab before it could continue loading.

### Action labels

- `Close Tab` `(Recommended)`
- `Open Safe Review`
- `Technical Details`

### What not to say

Avoid copy like:

- "Only reopen this if you trust it"
- "Decide whether this is a false positive"
- "Allow anyway"

These phrases shift security judgment onto the user.

---

## Technical Details Panel

The panel should be collapsed by default and shown only on demand.

Suggested sections:

| Section | Contents |
|---------|----------|
| Summary | trigger type, severity, affected page/domain |
| Containment actions | tab quarantined, strict mode forced, trust downgraded, execution terminated if applicable |
| Blocked resources | suspicious script URL or domain, plus blocked follow-up requests |
| Evidence | saved script list, recent resource snapshots, incident ID |
| Review options | which safe review profiles are available and what each blocks |

This information should come from the stored `SecurityContainmentIncident`
record rather than recomputing state from the live tab.

---

## Safe Review Architecture

### High-level flow

```text
critical detection
    -> SecurityManager creates SecurityContainmentIncident
    -> shell opens containment dialog
    -> user selects Open Safe Review
    -> shell requests a new review tab
    -> new tab launches with review policy active before navigation
    -> shell shows Safe Review banner outside the webview
```

### Critical rule

The review tab is a **new browsing context**, not a resumed original tab.

That ensures the page reloads under policy rather than continuing from a
possibly compromised JS state.

### Review policy model

Add a review-policy concept with the following fields:

- `mode`
- `incidentId`
- `sourceUrl`
- `blockedDomains`
- `blockThirdPartyScripts`
- `disableAutomation`
- `disableAutofill`
- `readOnly`

Suggested first implementation:

- open a new tab from `main.ts`
- associate the tab with a review policy in `class SecurityManager`
- have `class Guardian` enforce the additional blocked-domain rules for that
  review tab
- surface the active review mode through shell state and a shell banner

---

## Why Partial Allow Must Use A New Tab

This is the key product/security rule:

> Tandem may allow part of the page to reload under a stricter review policy,
> but it may not continue the already-contained original page.

Reason:

- suspicious script may already have modified DOM state
- event listeners may already be patched
- forms may already have been rewritten
- credentials or clipboard data may already have been read

Therefore "block the bad part, allow the rest" is only valid as:

- close/quarantine original tab
- open a new review tab
- apply blocking before the new load begins

---

## Recommended UI States

### Containment dialog

Audience: everyone.

Shows:

- simple explanation
- recommended action
- open safe review
- optional details toggle

### Safe Review banner

Audience: everyone inside the review tab.

Shows:

- `Safe Review Mode`
- short explanation of what is blocked
- indicator that automation/autofill are disabled
- `Close Review Tab`
- optional `Change Review Mode`

### Technical Details drawer

Audience: technical/power users.

Shows incident details from the persisted record.

---

## Severity Handling

| Severity | Default path | User options |
|---------|--------------|--------------|
| `critical` | recommend `Close Tab` | `Close Tab`, `Open Safe Review`, `Technical Details` |
| `high` | recommend `Close Tab` | `Close Tab`, `Open Safe Review`, `Technical Details` |
| `medium` | may use a lighter warning in the future | same model if containment is active |

The original tab should still never get a same-tab resume action for contained
critical incidents.

---

## Proposed Implementation Phases

| Phase | Scope | Notes |
|------|-------|-------|
| 1 | Replace current containment dialog copy and actions | no same-tab resume |
| 2 | Add `SecurityContainmentIncident` fields for user/technical summaries and review options | reuse persisted incident data |
| 3 | Add `Open Safe Review` flow with `flagged-domain-blocked` policy | first usable recovery path |
| 4 | Add stricter profiles: `third-party-scripts-blocked` and `read-only-snapshot` | fallback for stubborn sites |
| 5 | Add technical details drawer and blocked-resource inspection | power-user visibility |

---

## Risks / Pitfalls

- **Overpromising safety:** "Safe Review" must be clearly described as a
  controlled reload, not a guarantee that the site is clean.
- **Policy leaks across tabs:** review rules must stay scoped to the new review
  tab and must not widen or persist unexpectedly.
- **Broken sites in review mode:** stricter profiles may break layout or login
  flows; that is acceptable as long as the UX explains why.
- **Too much technical detail in the main dialog:** normal users should not be
  overwhelmed.

---

## Anti-Detect Considerations

- All warnings, banners, and review controls stay in the shell
- Review policy enforcement stays in main-process/session policy layers
- No page-visible UI is injected into the webview
- Review mode must not add a stable site-visible Tandem fingerprint beyond the
  normal effects of blocked third-party resources

---

## Open Decisions

- Should `critical` incidents automatically close the original tab after the
  dialog, or keep it visibly blocked until the user closes it?
- Should `read-only-snapshot` use Tandem's existing snapshot/content pipeline,
  or a lightweight HTML/text extraction path?
- Should the first Safe Review profile block only the flagged domain, or the
  exact flagged resource URLs when available?

