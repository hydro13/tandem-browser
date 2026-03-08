# Design: Ad Blocker (Consumer Grade)

> **Date:** 2026-02-28
> **Status:** Draft
> **Effort:** Medium (3-5d)
> **Author:** Kees

---

## Problem / Motivation

Tandem has NetworkShield that 811K+ malicious URLs blokkeert (phishing, malware), but the blokkeert no advertenties. Advertenties are not only vervelend — ze vertragen page's, verspillen bandbreedte, and vormen a tracking/privacy risk. Elke serieuze browser biedt ad blocking. Dit is table stakes.

**Opera has:** A built-in ad blocker at the network-request level (blocks before render). Uses EasyList filter lists + NoCoin mining protection. Badge in the URL bar with a blocked-count indicator. Per-site exceptions. YouTube ad blocking.
**Tandem currently has:** NetworkShield with custom blocklist (malicious URLs). No EasyList/adblock filter support. No consumer ad blocking.
**Gap:** Large — no ad blocking, only malware blocking.

---

## User Experience — How It Works

> Robin opens a nieuwssite. Normaal sees he banners, popups, and video-ads.
> With the Ad Blocker actief: the page loads faster, no ads visible.
> In the toolbar sees Robin a schildje with a getal (bv. "23") — the aantal blocked requests op this page.
> Robin clicks op the schildje: a popup shows the geblokkeerde aantal and a toggle "Uitzetten for this site".
> Op a site that kapot gaat door ad blocking, clicks Robin the toggle out. The page herlaadt without ad blocking.
> The whitelist is onthouden — next bezoeken about that site are also not gefilterd.

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
│   request doorgezet to internet                             │
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
| `src/adblock/filter-engine.ts` | FilterEngine — parse EasyList/ABP filter rules, match URLs tegen rules |
| `src/adblock/filter-lists.ts` | Download and cache EasyList + EasyPrivacy filterlijsten |
| `src/api/routes/adblock.ts` | REST API endpoints for ad blocker |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/registry.ts` | `adBlockManager` add about `ManagerRegistry` | `interface ManagerRegistry` |
| `src/api/server.ts` | AdBlock routes registreren | `setupRoutes()` |
| `src/main.ts` | AdBlockManager instantiëren, registreren bij RequestDispatcher | `startAPI()` |
| `src/main.ts` | Cleanup | `app.on('will-quit')` |
| `shell/index.html` | Shield badge in toolbar | `<div class="toolbar">` |
| `shell/js/main.js` | Badge update logica, whitelist toggle popup | event handlers |
| `shell/css/main.css` | Shield badge styling | new CSS classes |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/adblock/status` | Ad blocker status: enabled, filter count, total blocked |
| POST | `/adblock/toggle` | Schakel ad blocker in/out globaal |
| GET | `/adblock/stats` | Statistics: blocked per page, total |
| GET | `/adblock/whitelist` | List gewhiteliste domains |
| POST | `/adblock/whitelist` | Voeg domain toe about whitelist `{domain}` |
| DELETE | `/adblock/whitelist/:domain` | Delete domain or whitelist |
| POST | `/adblock/update-filters` | Forceer filter list update (download nieuwste versie) |

### No new npm packages needed? ✅
We bouwen a own lightweight filter engine. No `@nicedoc/adblocker` or `@nicedoc/cosmetic-filter` nodig — that are te zwaar and voegen onnodige dependencies toe. EasyList/ABP filter syntax is goed gedocumenteerd and the core matching logic is relatief simpel (URL pattern matching with domain-optie filtering).

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Filter engine: download lijsten, parse rules, block requests via RequestDispatcher | 1 | — |
| 2 | Shell UI: shield badge, blocked count, per-site whitelist toggle | 1 | Phase 1 |

---

## Risks / Pitfalls

- **Filter list parsing performance:** EasyList has ~90.000 rules. Naïeve string matching is te traag. We use a hash-tabel for domain-based rules and a compacte trie/set for URL-pattern rules. First parse can ~2-3 seconden duren — doe this async bij startup.
- **False positives:** Sommige EasyList rules blokkeren te agressief. Per-site whitelist is essentieel if escape hatch.
- **YouTube ads:** YouTube serves ads via the same domains if video content. Volledige YouTube ad blocking requires meer advanced logica (request pattern matching). V1 blokkeert default display ads; YouTube specific rules are a V2 item.
- **RequestDispatcher integratie:** The existing `RequestDispatcher` in Tandem routeert alle `session.webRequest` hooks. AdBlockManager must zich registreren with the juiste priority (na stealth patches, but vóór NetworkShield).
- **Memory:** 90K rules in memory is ~10-15MB. Acceptabel for a desktop app.

---

## Anti-detect considerations

- ✅ Ad blocking gebeurt op Electron session niveau via `webRequest.onBeforeRequest()` — the webview sees only that requests not aankomen, not why
- ✅ No content scripts or DOM manipulatie — purely netwerk-niveau blocking
- ⚠️ Websites can detecteren that ads not laden (anti-adblock scripts). Dit is a known issue with elke ad blocker. V1 doet hier nothing mee — user can the site whitelisten.

---

## Decisions Needed from Robin

- [ ] Wil you EasyPrivacy (tracker blocking) also meteen in V1, or only EasyList (ads)?
- [ ] Default about or out bij first start? Opera has the default out (opt-in).
- [ ] NoCoin crypto mining protection: add if derde filterlijst?

---

## Approval

Robin: [ ] Go / [ ] No-go / [ ] Go with adjustment: ___________
