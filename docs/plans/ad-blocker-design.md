# Design: Ad Blocker (Consumer Grade)

> **Date:** 2026-02-28
> **Status:** Planned
> **Effort:** Medium (3-5d)
> **Author:** Kees

---

## Problem / Motivation

Tandem has NetworkShield that blocks 811K+ malicious URLs (phishing, malware), but it does not block advertisements. Ads are not only annoying — they slow down pages, waste bandwidth, and pose a tracking/privacy risk. Every serious browser offers ad blocking. This is table stakes.

**Opera has:** A built-in ad blocker at the network-request level (blocks before render). Uses EasyList filter lists + NoCoin mining protection. Badge in the URL bar with a blocked-count indicator. Per-site exceptions. YouTube ad blocking.
**Tandem currently has:** NetworkShield with custom blocklist (malicious URLs). No EasyList/adblock filter support. No consumer ad blocking.
**Gap:** Large — no ad blocking, only malware blocking.

---

## User Experience — How It Works

> Robin opens a news site. Normally he sees banners, popups, and video ads.
> With the Ad Blocker active: the page loads faster, no ads visible.
> In the toolbar Robin sees a shield icon with a number (e.g. "23") — the number of blocked requests on this page.
> Robin clicks the shield: a popup shows the blocked count and a toggle "Disable for this site".
> On a site that breaks due to ad blocking, Robin clicks the toggle off. The page reloads without ad blocking.
> The whitelist is remembered — subsequent visits to that site are also not filtered.

---

## Technical Approach

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Electron Session                           │
│                                                               │
│   HTTP Request                                                │
│       ↓                                                       │
│   RequestDispatcher                                           │
│       ↓                                                       │
│   AdBlockManager.onBeforeRequest()  (priority 20)            │
│       ↓                                                       │
│   FilterEngine.match(url, resourceType, pageDomain)          │
│       ↓ match?                                                │
│   { cancel: true }  → request blocked                       │
│       ↓ no match                                              │
│   request forwarded to internet                              │
│                                                               │
│   FilterEngine                                                │
│   ├── EasyList.txt      (ads)                                │
│   ├── EasyPrivacy.txt   (trackers)                           │
│   └── NoCoin rules      (crypto mining)                      │
│                                                               │
│   Whitelist (per-domain)                                      │
│   └── ~/.tandem/adblock-whitelist.json                       │
└──────────────────────────────────────────────────────────────┘
```

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/adblock/manager.ts` | AdBlockManager — filter engine lifecycle, whitelist, blocked count tracking |
| `src/adblock/filter-engine.ts` | FilterEngine — parse EasyList/ABP filter rules, match URLs against rules |
| `src/adblock/filter-lists.ts` | Download and cache EasyList + EasyPrivacy filter lists |
| `src/api/routes/adblock.ts` | REST API endpoints for ad blocker |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/registry.ts` | Add `adBlockManager` to `ManagerRegistry` | `interface ManagerRegistry` |
| `src/api/server.ts` | Register AdBlock routes | `setupRoutes()` |
| `src/main.ts` | Instantiate AdBlockManager, register with RequestDispatcher | `startAPI()` |
| `src/main.ts` | Cleanup | `app.on('will-quit')` |
| `shell/index.html` | Shield badge in toolbar | `<div class="toolbar">` |
| `shell/js/main.js` | Badge update logic, whitelist toggle popup | event handlers |
| `shell/css/main.css` | Shield badge styling | new CSS classes |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/adblock/status` | Ad blocker status: enabled, filter count, total blocked |
| POST | `/adblock/toggle` | Toggle ad blocker on/off globally |
| GET | `/adblock/stats` | Statistics: blocked per page, total |
| GET | `/adblock/whitelist` | List whitelisted domains |
| POST | `/adblock/whitelist` | Add domain to whitelist `{domain}` |
| DELETE | `/adblock/whitelist/:domain` | Remove domain from whitelist |
| POST | `/adblock/update-filters` | Force filter list update (download latest version) |

### No new npm packages needed? ✅
We build a lightweight filter engine ourselves. No `@nicedoc/adblocker` or `@nicedoc/cosmetic-filter` needed — they are too heavy and add unnecessary dependencies. EasyList/ABP filter syntax is well documented and the core matching logic is relatively simple (URL pattern matching with domain-option filtering).

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Filter engine: download lists, parse rules, block requests via RequestDispatcher | 1 | — |
| 2 | Shell UI: shield badge, blocked count, per-site whitelist toggle | 1 | Phase 1 |

---

## Risks / Pitfalls

- **Filter list parsing performance:** EasyList has ~90,000 rules. Naive string matching is too slow. We use a hash table for domain-based rules and a compact trie/set for URL-pattern rules. First parse can take ~2-3 seconds — do this async at startup.
- **False positives:** Some EasyList rules block too aggressively. Per-site whitelist is essential as an escape hatch.
- **YouTube ads:** YouTube serves ads via the same domains as video content. Full YouTube ad blocking requires more advanced logic (request pattern matching). V1 blocks default display ads; YouTube-specific rules are a V2 item.
- **RequestDispatcher integration:** The existing `RequestDispatcher` in Tandem routes all `session.webRequest` hooks. AdBlockManager must register with the correct priority (after stealth patches, but before NetworkShield).
- **Memory:** 90K rules in memory is ~10-15MB. Acceptable for a desktop app.

---

## Anti-detect Considerations

- ✅ Ad blocking happens at Electron session level via `webRequest.onBeforeRequest()` — the webview only sees that requests don't arrive, not why
- ✅ No content scripts or DOM manipulation — purely network-level blocking
- ⚠️ Websites can detect that ads don't load (anti-adblock scripts). This is a known issue with every ad blocker. V1 does nothing about this — the user can whitelist the site.

---

## Open Questions

- [ ] Include EasyPrivacy (tracker blocking) in V1, or only EasyList (ads)?
- [ ] Default on or off at first start? Opera defaults to off (opt-in).
- [ ] NoCoin crypto mining protection: add as a third filter list?
