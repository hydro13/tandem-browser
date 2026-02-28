# Tandem Browser — Feature Roadmap

> **Beheerd door:** Kees (bijhouden) + Robin (beslissingen)
> **Bijgewerkt:** 2026-02-28

---

## Hoe status tracking werkt

| Wie | Waar | Wat |
|-----|------|-----|
| **Kees** | Dit bestand (ROADMAP.md) | Groot overzicht: welke feature in welk stadium |
| **Kees** | `docs/STATUS.md` | Dagelijkse voortgang: wat loopt, wat geblokkeerd |
| **Claude Code** | `docs/implementations/{feature}/LEES-MIJ-EERST.md` | Per-feature fase-status: welke fases klaar, welke volgende |

### Fase-status in LEES-MIJ-EERST.md
Elke `LEES-MIJ-EERST.md` heeft bovenaan een tabel:
```
| Fase | Titel | Status | Commit |
|------|-------|--------|--------|
| 1 | Backend + API | ✅ klaar | abc1234 |
| 2 | Shell UI | ⏳ volgende | — |
```
Claude Code werkt dit bij na elke fase. Kees kopieert de commit naar ROADMAP.md.

---

## Werkwijze

1. **Robin kiest feature** → Kees markeert als 🔴 ACTIEF
2. **Claude Code voert fase 1 uit** → commit → Robin + Kees reviewen diff
3. **Claude Code markeert fase als ✅** in LEES-MIJ-EERST.md
4. **Kees werkt ROADMAP.md bij** met commit hash
5. **Volgende fase of volgende feature**

---

## Feature Status — Overzicht

> ⚠️ **Besluit 2026-02-28:** Sidebar infrastructuur is het fundament voor Workspaces, Messengers, Pinboards, Personal News, Bookmarks, History, Downloads. Dit komt EERST.

**Definitieve sidebar (links):** Workspaces · Messengers · Personal News · Pinboards · Bookmarks · History · Downloads
**Rechts blijft (copilot panel):** AI Chat · Activity · Screenshots · ClaroNote

| Feature | Effort | Design doc | Impl docs | Fase status |
|---------|--------|-----------|-----------|-------------|
| **Sidebar Infrastructuur** | Medium (3-5d) | ⏳ schrijven | ⏳ schrijven | ⏳ niet gestart — **EERST** |
| Workspaces UI | Medium (3-5d) | ✅ plans/workspaces-ui-design.md | ✅ 2 fases | ⏳ wacht op sidebar infra |
| Sidebar Chat (Messengers) | Hard (1-2 wk) | ✅ plans/sidebar-chat-design.md | ✅ 3 fases | ⏳ wacht op sidebar infra |
| Personal News | Medium (3-5d) | ⏳ schrijven | ⏳ schrijven | ⏳ wacht op sidebar infra |
| Pinboards | Hard (1-2 wk) | ✅ plans/pinboards-design.md | ✅ 3 fases | ⏳ wacht op sidebar infra |
| Bookmarks sidebar | Easy (1-2d) | ⏳ schrijven | ⏳ schrijven | ⏳ wacht op sidebar infra |
| History sidebar | Easy (1-2d) | ⏳ schrijven | ⏳ schrijven | ⏳ wacht op sidebar infra |
| Downloads sidebar | Easy (1-2d) | ⏳ schrijven | ⏳ schrijven | ⏳ wacht op sidebar infra |
| Tab Islands | Medium (3-5d) | ✅ plans/tab-islands-design.md | ✅ 2 fases | ⏳ niet gestart |
| Split Screen | Medium (3-5d) | ✅ plans/split-screen-design.md | ✅ 2 fases | ⏳ niet gestart |
| Tab Emojis | Easy (1-2d) | ✅ plans/tab-emojis-design.md | ✅ 1 fase | ⏳ niet gestart |
| Search in Tabs | Easy (1-2d) | ✅ plans/search-in-tabs-design.md | ✅ 1 fase | ⏳ niet gestart |
| Ad Blocker | Medium (3-5d) | ✅ plans/ad-blocker-design.md | ✅ 2 fases | ⏳ niet gestart |
| Tab Snoozing | Medium (3-5d) | ✅ plans/tab-snoozing-design.md | ✅ 2 fases | ⏳ niet gestart |
| Private Browsing | Easy (1-2d) | ✅ plans/private-browsing-design.md | ✅ 1 fase | ⏳ niet gestart |

---

## Actief bezig

> Niets actief — wachten op Robin's keuze voor eerste feature.

---

## Backlog (later)

| Feature | Prio | Afhankelijk van |
|---------|------|----------------|
| Tracker Blocker (actief) | 🟡 MED | — |
| Security Badges adresbalk | 🟡 MED | — |
| Tab Traces (recency glow) | 🟡 MED | — |
| Duplicate Tabs Highlighter | 🟡 MED | — |
| Tab Preview on Hover | 🟡 MED | — |
| Paste Protection | 🟡 MED | — |
| Spotify/Music sidebar | 🟡 MED | Sidebar Chat |
| Dynamic Themes | 🟡 MED | — |
| Visual Tab Cycler (Ctrl+Tab) | 🟢 LOW | — |
| Currency/Unit converter popup | 🟢 LOW | — |
| Page Translate | 🟢 LOW | — |

---

## Niet bouwen ❌

Lucid Mode • Facebook Messenger • VK • Crypto Wallet • Cashback • Flow (cross-device) • Speed Dial • Extensions sidebar • Music Player

---

## Voltooide Features

| Feature | Afgerond | Commits |
|---------|----------|---------|
| Opera research + gap analyse | 2026-02-28 | 488029e |
| Project management setup | 2026-02-28 | 488029e |
| Alle design + impl docs (10 features) | 2026-02-28 | cfa0e1b |

---

## Regels

- Statuswaarden: ✅ klaar · ⏳ niet gestart · 🔴 actief · ❌ geblokkeerd · 🚫 geannuleerd
- Robin beslist prio-volgorde
- Kees werkt bij na elke fase
- Nooit regelnummers — altijd functienamen
