# Tandem Browser — Feature Roadmap

> **Maintained by:** Kees (tracking) + Robin (decisions)
> **Updated:** 2026-02-28

---

## How status tracking works

| Who | Where | What |
|-----|------|-----|
| **Kees** | This file (ROADMAP.md) | High-level overview: which feature is in which stage |
| **Kees** | `docs/internal/STATUS.md` | Daily progress: what is active, what is blocked |
| **Claude Code** | `docs/implementations/{feature}/LEES-MIJ-EERST.md` | Per-feature phase status: which phases are done, which comes next |

### Phase status in LEES-MIJ-EERST.md
Each `LEES-MIJ-EERST.md` has a table at the top:
```
| Phase | Title | Status | Commit |
|------|-------|--------|--------|
| 1 | Backend + API | ✅ done | abc1234 |
| 2 | Shell UI | ⏳ next | — |
```
Claude Code updates this after each phase. Kees copies the commit into ROADMAP.md.

---

## Workflow

1. **Robin chooses a feature** → Kees marks it as 🔴 ACTIVE
2. **Claude Code executes phase 1** → commit → Robin + Kees review the diff
3. **Claude Code marks the phase as ✅** in LEES-MIJ-EERST.md
4. **Kees updates ROADMAP.md** with the commit hash
5. **Next phase or next feature**

---

## Feature Status — Overview

> ⚠️ **Decision 2026-02-28:** Sidebar infrastructure is the foundation for Workspaces, Messengers, Pinboards, Personal News, Bookmarks, History, and Downloads. This comes FIRST.

**Final sidebar (left):** Workspaces · Messengers · Personal News · Pinboards · Bookmarks · History · Downloads
**Right side remains (Wingman panel):** AI Chat · Activity · Screenshots · ClaroNote

| Feature | Effort | Design doc | Impl docs | Phase status |
|---------|--------|-----------|-----------|-------------|
| **Sidebar Infrastructure** | Medium (3-5d) | ✅ plans/sidebar-infra-design.md | ⏳ writing | ⏳ waiting for Robin go-ahead |
| Workspaces UI | Medium (3-5d) | ✅ plans/workspaces-ui-design.md | ✅ 2 phases | ⏳ waiting for sidebar infra |
| Sidebar Chat (Messengers) | Hard (1-2 wk) | ✅ plans/sidebar-chat-design.md | ✅ 3 phases | ⏳ waiting for sidebar infra |
| Personal News | Medium (3-5d) | ⏳ writing | ⏳ writing | ⏳ waiting for sidebar infra |
| Pinboards | Hard (1-2 wk) | ✅ plans/pinboards-design.md | ✅ 3 phases | ⏳ waiting for sidebar infra |
| Bookmarks sidebar | Easy (1-2d) | ⏳ writing | ⏳ writing | ⏳ waiting for sidebar infra |
| History sidebar | Easy (1-2d) | ⏳ writing | ⏳ writing | ⏳ waiting for sidebar infra |
| Downloads sidebar | Easy (1-2d) | ⏳ writing | ⏳ writing | ⏳ waiting for sidebar infra |
| Tab Islands | Medium (3-5d) | ✅ plans/tab-islands-design.md | ✅ 2 phases | ⏳ not started |
| Split Screen | Medium (3-5d) | ✅ plans/split-screen-design.md | ✅ 2 phases | ⏳ not started |
| Tab Emojis | Easy (1-2d) | ✅ plans/tab-emojis-design.md | ✅ 1 phase | ⏳ not started |
| Search in Tabs | Easy (1-2d) | ✅ plans/search-in-tabs-design.md | ✅ 1 phase | ⏳ not started |
| Ad Blocker | Medium (3-5d) | ✅ plans/ad-blocker-design.md | ✅ 2 phases | ⏳ not started |
| Tab Snoozing | Medium (3-5d) | ✅ plans/tab-snoozing-design.md | ✅ 2 phases | ⏳ not started |
| Private Browsing | Easy (1-2d) | ✅ plans/private-browsing-design.md | ✅ 1 phase | ⏳ not started |

---

## Actively In Progress

> Nothing active — waiting for Robin's choice for the first feature.

---

## Backlog (Later)

| Feature | Priority | Depends on |
|---------|------|----------------|
| Tracker Blocker (active) | 🟡 MED | — |
| Security Badges address bar | 🟡 MED | — |
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

## Do Not Build ❌

Lucid Mode • Facebook Messenger • VK • Crypto Wallet • Cashback • Flow (cross-device) • Speed Dial • Extensions sidebar • Music Player

---

## Completed Features

| Feature | Completed | Commits |
|---------|----------|---------|
| Opera research + gap analysis | 2026-02-28 | 488029e |
| Project management setup | 2026-02-28 | 488029e |
| All design + implementation docs (10 features) | 2026-02-28 | cfa0e1b |
| Cross-device Sync (SyncManager) — phase 1 | 2026-03-01 | ✅ |

---

## Rules

- Status values: ✅ done · ⏳ not started · 🔴 active · ❌ blocked · 🚫 canceled
- Robin decides priority order
- Kees updates after each phase
- Never line numbers — always function names
