# Phase 4 — Core Feed Expansion: Curated structured threat intel

> **Feature:** Security Blocklist Refresh
> **Sessions:** 1 session
> **Priority:** MEDIUM
> **Depends on:** Phase 3 complete

---

## Goal Or This Phase

This phase uses the new parser and scheduler model to add a curated set or
structured security feeds. The goal is better phishing, malware, and known bad
infrastructure coverage without turning the browser core into a generic ad or
tracker blocker.

---

## Existing Code To Read — ONLY This

| File | Look for | Why |
|------|----------|-----|
| `src/security/blocklists/updater.ts` | source definitions | add curated new feeds |
| `src/security/network-shield.ts` | `checkDomain()`, `checkUrl()` | verify new feeds fit domain/url-first lookups |
| `src/security/security-manager.ts` | scheduler integration | ensure new sources fit update tiers |
| `src/security/types.ts` | source parser/config typing | keep source metadata consistent |

---

## Build In This Phase

### 1. Add curated feeds

**What:** Add structured feeds that fit Tandem's core security scope, such as
OpenPhish, ThreatFox, and a proper PhishTank-compatible source if still
valuable.

**Files:** `src/security/blocklists/updater.ts`

### 2. Keep source quality explicit

**What:** Mark sources by category and update tier so threat feeds stay
high-signal and supportable.

**Files:** `src/security/types.ts`, `src/security/blocklists/updater.ts`

### 3. Document exclusions

**What:** Explicitly keep ad/tracker mega-lists out or this track even if the
parser could ingest them.

**Files:** track docs if needed, source definitions

---

## Acceptance Criteria

```bash
TOKEN=$(cat ~/.tandem/api-token)
npm run compile
npx vitest run
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/security/status
# Expected: additional curated sources appear without startup regression
```

**Behavior checks:**
- new sources parse successfully with the new model
- startup remains fast because heavy work still hydrates in the background
- security status reflects the expanded curated source set
- no EasyList/OISD-style browser-core feed is added in this phase

---

## Known Pitfalls

- avoid adding feeds just because they are large
- verify licensing/access expectations before relying on a feed
- keep domain/url-first semantics; CIDR work remains a separate follow-up
