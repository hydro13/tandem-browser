# Tandem vs Opera — Gap Analysis & Roadmap

> Updated: 2026-04-11 (previous: 2026-02-28)
> Tandem v0.70.0 (231 MCP tools, 57 src modules) vs Opera Desktop (68 features)
> Purpose: Identify remaining high-value Opera features to build into Tandem

---

## Executive Summary

Since the original gap analysis (Feb 2026, v0.15.1), Tandem has grown from 380+ features to v0.70.0 with 231 MCP tools, 57 source modules, and 19 API route files. Several HIGH priority gaps have been closed:

### What's Been Built Since Feb 2026

| Feature | Was | Now | Notes |
|---------|-----|-----|-------|
| **Sidebar Chat Clients** | ❌ Missing | ✅ Complete | WhatsApp, Discord, Slack, Telegram, Instagram, X, Gmail, Calendar |
| **Pinboards** | ❌ Missing | ✅ Complete | Full CRUD, link/image/text/quote cards, layouts, themes, emoji badges |
| **Workspaces UI** | ⚠️ Partial | ✅ Complete | AI workspaces with visual switching, emoji icons, persistence |
| **Tracker Blocker** | ⚠️ Detect only | ✅ Active blocking | Blocklist support, domain allowlist, request interception |
| **Paste Protection** | ❌ Missing | ✅ Implemented | Clipboard manager with read/write monitoring |
| **Tab Groups** | ⚠️ Basic | ⚠️ Better | TabGroup model with names/colors, but no auto-grouping or collapsible UI |

### New Capabilities Not in Original Analysis

| Feature | Version | Description |
|---------|---------|-------------|
| **Prompt Injection Guard** | v0.65.0 | 40+ detection patterns, hidden text detection, risk scoring (0-100) |
| **AI Workspaces** | v0.67.0 | Dedicated agent workspace isolation with full lifecycle |
| **Awareness Tools** | v0.70.0 | `tandem_awareness_digest` + `tandem_awareness_focus` for agent context |
| **Native Voice-to-Text** | v0.62.0 | Apple Speech API (macOS), Whisper fallback |
| **231 MCP Tools** | v0.69.0 | Full parity with HTTP API, 32 modular tool files |
| **Chrome Import Suite** | v0.69.0 | Profiles, bookmarks, history, cookies, continuous sync |
| **Extension Gallery** | v0.69.0 | Update management, conflict detection, disk usage tracking |
| **Live Preview System** | — | HTML preview create/update/list/delete |
| **DevTools Protocol** | — | Network HAR, console, DOM query, performance, storage via API |
| **Video Recording** | — | Screen/audio capture with MP4/WebM export |

### Current Score

- **19 features** Opera has that Tandem **also has** (✅) — unchanged
- **12 features** Opera has that Tandem **partially has** (⚠️) — was 17, improved
- **19 features** Opera has that Tandem **is missing** (❌) — was 29, many built
- **5 features** excluded per Robin's preferences

**The remaining pattern:** The consumer UX gap has narrowed significantly. Sidebar messengers and Pinboards — the two hardest items — are done. What remains is mostly **tab organization polish** (Islands, Split Screen, Search in Tabs), **consumer privacy UX** (ad blocker UI, private browsing window), and **lifestyle features** (battery saver, translate, themes).

### Updated Top 10 Remaining Features to Build

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 1 | **Tab Islands** (upgrade) | Auto-grouping, collapsing, naming — infrastructure exists but no UX | Medium (3-5 days) |
| 2 | **Split Screen** | Multi-pane browsing — still completely missing | Medium (3-5 days) |
| 3 | **Ad Blocker** (consumer) | EasyList filter support — NetworkShield blocks threats, not ads | Medium (3-5 days) |
| 4 | **Search in Tabs** | Ctrl+Space tab search popup — API exists, no UI | Easy (1-2 days) |
| 5 | **Tab Snoozing** | Auto-suspend inactive tabs for memory savings | Medium (3-5 days) |
| 6 | **Private Browsing Window** | Cmd+Shift+N ephemeral window — session isolation exists, no UX | Easy (1-2 days) |
| 7 | **Tab Emojis** | Emoji badges on individual tabs — exists on workspaces/pinboards, not tabs | Easy (1-2 days) |
| 8 | **Security Badges** | Visual indicators in address bar | Easy (1-2 days) |
| 9 | **Speed Dial** (configurable) | Customizable start page tiles with folders | Medium (3-5 days) |
| 10 | **Search Engine Management** | Multiple engines with keywords | Medium (3-5 days) |

---

## Remaining Gaps by Priority

### 🔴 HIGH Priority — Build These Next

| # | Feature | Opera Description | Tandem Status | Effort |
|---|---------|-------------------|---------------|--------|
| 1 | **Tab Islands** | Auto-groups by browsing context. Collapsible. Named handles. Shift+click multi-select | ⚠️ Partial — `TabGroup` model with name/color exists, but no auto-grouping, no collapsible UI, no island handles | Medium (3-5 days) |
| 2 | **Split Screen** | 2-4 panes, resizable, independent navigation | ❌ Missing — single-tab architecture | Medium (3-5 days) |
| 3 | **Ad Blocker** (consumer) | EasyList filters, YouTube ads, NoCoin, per-site exceptions, shield badge | ⚠️ Partial — NetworkShield blocks malicious URLs and trackers, but no consumer ad blocking (EasyList/uBlock filters) | Medium (3-5 days) |
| 4 | **Search in Tabs** | Ctrl+Space real-time search by title/URL, recently closed | ❌ Missing — `GET /tabs/list` API exists but no search popup UI | Easy (1-2 days) |
| 5 | **Tab Snoozing** | Auto-suspend inactive tabs to free memory | ❌ Missing — resource monitoring exists but no auto-suspension | Medium (3-5 days) |
| 6 | **Private Browsing** | Ephemeral window, Cmd+Shift+N, auto-delete all data on close | ⚠️ Partial — full session partition isolation exists, but no "incognito" UI shortcut or auto-cleanup | Easy (1-2 days) |

### 🟡 MEDIUM Priority — Build After Highs

| # | Feature | Opera Description | Tandem Status | Effort |
|---|---------|-------------------|---------------|--------|
| 7 | **Tab Emojis** | Emoji badges on tabs, hover selector, persists across sessions | ⚠️ Partial — emoji used in workspaces/pinboards but not on individual tabs | Easy (1-2 days) |
| 8 | **Security Badges** | Visual address bar icons: HTTPS, blocked count, VPN, permissions | ❌ Missing — security data available via APIs, no visual badges | Easy (1-2 days) |
| 9 | **Tab Traces** | Highlight recently used tabs with brightness correlating to recency | ❌ Missing | Easy (1-2 days) |
| 10 | **Duplicate Tabs Highlighter** | Highlight and bulk-close duplicate tabs | ❌ Missing | Easy (1-2 days) |
| 11 | **Tab Preview on Hover** | Thumbnail preview when hovering over tabs | ❌ Missing | Medium (3-5 days) |
| 12 | **Speed Dial** (configurable) | User-customizable tile grid with folders, drag-and-drop, thumbnails | ⚠️ Partial — has quick links, configurable links planned | Medium (3-5 days) |
| 13 | **Startup Preferences** | Restore previous session tabs on startup, or open specific pages | ⚠️ Partial — session state save/load exists, no "restore on startup" toggle | Easy (1-2 days) |
| 14 | **Search Engine Management** | Multiple search engines with keywords, custom engines from any site | ❌ Missing — DuckDuckGo only | Medium (3-5 days) |
| 15 | **Search Popup** (highlight actions) | Popup above selected text with search, copy, conversions | ⚠️ Partial — context menu "Search Google for..." exists | Medium (3-5 days) |
| 16 | **Delete Browsing Data** (granular) | Per-type + time range deletion | ⚠️ Partial — `POST /data/wipe` exists but limited granularity | Easy (1-2 days) |
| 17 | **Clear Data on Exit** | Auto-delete selected data types on browser close | ❌ Missing | Easy (1-2 days) |
| 18 | **Opera Translate** | 47-language page translation | ❌ Missing — extension available | Medium (3-5 days) |
| 19 | **Dynamic Themes** | Animated wallpapers, sound effects, music-reactive | ⚠️ Partial — dark/light/system + Liquid Glass | Medium (3-5 days) |

### 🟢 LOW Priority — Nice to Have

| # | Feature | Opera Description | Tandem Status | Effort |
|---|---------|-------------------|---------------|--------|
| 20 | **Visual Tab Cycler** | Thumbnail Ctrl+Tab preview | ❌ Missing | Medium (3-5 days) |
| 21 | **Easy Files** | Recent downloads/clipboard in file upload dialogs | ❌ Missing | Medium (3-5 days) |
| 22 | **Currency Converter** | Auto-convert highlighted monetary values | ❌ Missing | Easy (1-2 days) |
| 23 | **Unit Converter** | Convert imperial/metric on selection | ❌ Missing | Easy (1-2 days) |
| 24 | **Time Zone Converter** | Convert timezone abbreviations to local | ❌ Missing | Easy (1-2 days) |
| 25 | **BABE (Address Bar)** | Pop-out panel with frequent sites, recommendations | ⚠️ Partial — basic URL bar with autocomplete | Medium (3-5 days) |
| 26 | **Do Not Track** | Send DNT header with every request | ❌ Missing | Easy (< 1 day) |
| 27 | **Video Skip** | Jump to end of video with one click | ❌ Missing | Easy (1-2 days) |
| 28 | **Wallpapers** | Custom start page wallpapers | ❌ Missing | Easy (1-2 days) |
| 29 | **Language Customization** | Browser UI localization | ❌ Missing | Medium (3-5 days) |
| 30 | **Opera Sync** | Cross-device sync of bookmarks, tabs, history, passwords | ⚠️ Partial — Chrome bookmark import/sync exists | Hard (1-2 weeks) |
| 31 | **My Flow** | Encrypted cross-device sharing via QR code | ❌ Missing — needs Tandem mobile | Hard (1-2 weeks) |
| 32 | **Battery Saver** | Reduce background activity on battery | ❌ Missing | Medium (3-5 days) |
| 33 | **Spotify/Music Player** | Sidebar music player, detachable | ⚠️ Now possible via sidebar — could add as sidebar panel | Easy (1-2 days) |
| 34 | **Save Tabs as Speed Dial** | Batch save tabs to bookmark folder | ⚠️ Partial — session state save + bookmarks exist | Easy (1-2 days) |
| 35 | **Easy Setup Panel** | Quick-config panel for key features | ⚠️ Partial — onboarding exists | Easy (1-2 days) |

---

## Feature-by-Feature Comparison Table

| # | Feature | Opera | Tandem | Gap | Priority |
|---|---------|-------|--------|-----|----------|
| | **TAB MANAGEMENT** | | | | |
| 1.1 | Tab Islands | Auto-grouping, collapsible, named, colored clusters | TabGroup model (name, color, tabIds) — no auto-grouping or collapse UI | ⚠️ Partial | 🔴 HIGH |
| 1.2 | Workspaces | 5 named buckets, visual sidebar switching | ✅ Full workspaces with AI agent support, visual switching, emoji icons | ✅ **Tandem exceeds** | — |
| 1.3 | Split Screen | 2-4 panes, resizable, independent navigation | None | ❌ Missing | 🔴 HIGH |
| 1.4 | Tab Emojis | Emoji badges on tabs, hover selector | Emoji on workspaces/pinboards, not individual tabs | ⚠️ Partial | 🟡 MED |
| 1.5 | Tab Traces | Recency-based brightness highlighting | None | ❌ Missing | 🟡 MED |
| 1.6 | Search in Tabs | Ctrl+Space search by title/URL | API only — no search popup | ❌ Missing | 🔴 HIGH |
| 1.7 | Visual Tab Cycler | Thumbnail Ctrl+Tab preview | None | ❌ Missing | 🟢 LOW |
| 1.8 | Tab Preview on Hover | Thumbnail on tab hover | None | ❌ Missing | 🟡 MED |
| 1.9 | Pin Tabs | Favicon-only, persist across restart | ✅ Tab pin/unpin | ✅ Match | — |
| 1.10 | Tab Snoozing | Auto-suspend inactive tabs | None | ❌ Missing | 🔴 HIGH |
| 1.11 | Duplicate Tabs Highlighter | Highlight + bulk close dupes | None | ❌ Missing | 🟡 MED |
| 1.12 | Close Tab Variations | Close other, close right, reopen | ✅ Full set | ✅ Match | — |
| 1.13 | Save Tabs as Speed Dial | Batch save to bookmark folder | Session state save + bookmarks | ⚠️ Partial | 🟢 LOW |
| | **SIDEBAR** | | | | |
| 2.1 | Sidebar Layout | Multi-panel sidebar with customizable panels | ✅ 3-section sidebar: Workspaces, Communication, Utilities. Wide/narrow/hidden modes | ✅ **Tandem exceeds** | — |
| 2.2 | Sidebar Messengers | Webview panels for apps with notifications | ✅ WhatsApp, Discord, Slack, Telegram, Instagram, X, Gmail, Calendar | ✅ **Tandem exceeds** | — |
| | **MESSENGERS** | | | | |
| 3.1 | WhatsApp | Full WhatsApp Web in sidebar | ✅ Sidebar panel | ✅ Match | — |
| 3.2 | Discord | Full Discord in sidebar | ✅ Sidebar panel | ✅ Match | — |
| 3.3 | Slack | Full Slack in sidebar | ✅ Sidebar panel | ✅ Match | — |
| 3.4 | Instagram | Instagram feed/DMs in sidebar | ✅ Sidebar panel | ✅ Match | — |
| 3.5 | X/Twitter | Full X in sidebar | ✅ Sidebar panel + X-Scout agent | ✅ **Tandem exceeds** | — |
| 3.6 | Spotify | Sidebar music player, detachable | Possible via sidebar framework — not preconfigured | ⚠️ Partial | 🟢 LOW |
| 3.7 | Telegram | Telegram in sidebar | ✅ Sidebar panel | ✅ Match | — |
| | **AI** | | | | |
| 4.1 | Opera AI (Aria) | Contextual AI chat, image gen, web search | ✅ AI Wingman with 6-layer security, MCP (231 tools), multi-backend, prompt injection guard, awareness tools | ✅ **Tandem far exceeds** | — |
| | **PRIVACY & SECURITY** | | | | |
| 5.1 | Ad Blocker | EasyList filters, YouTube ads, NoCoin, per-site | NetworkShield blocks threats + trackers, but not consumer ads | ⚠️ Partial | 🔴 HIGH |
| 5.2 | Tracker Blocker | Block tracking scripts/pixels at network level | ✅ Active blocking with blocklists, domain allowlist, request interception | ✅ Match | — |
| 5.3 | VPN | Free browser VPN, AES-256, no-log | None | ❌ Missing | 🟡 MED |
| 5.4 | Paste Protection | Clipboard monitoring for sensitive data | ✅ Clipboard manager with read/write monitoring | ✅ Match | — |
| 5.5 | Private Browsing | Ephemeral window, auto-delete on close | Session partition isolation exists, no incognito UI | ⚠️ Partial | 🔴 HIGH |
| 5.6 | Security Badges | Visual address bar icons | Security APIs, no visual badges | ❌ Missing | 🟡 MED |
| 5.7 | Phishing/Malware | Blacklist checking, warning page | ✅ 6-layer Security Shield + Prompt Injection Guard (40+ patterns, risk scoring) | ✅ **Tandem far exceeds** | — |
| 5.8 | Do Not Track | DNT header | None | ❌ Missing | 🟢 LOW |
| 5.9 | Certificate Management | View/manage TLS certificates | Via Chromium/Electron | ✅ Match | — |
| 5.10 | Clear Data on Exit | Auto-delete per data type on close | None | ❌ Missing | 🟡 MED |
| 5.11 | Delete Browsing Data | Granular per type + time range | `POST /data/wipe` — limited granularity | ⚠️ Partial | 🟡 MED |
| | **MEDIA** | | | | |
| 6.1 | Video Popout (PiP) | Floating always-on-top video player | ✅ PiP mode | ✅ Match | — |
| 6.2 | Video Skip | Jump to end of video | None | ❌ Missing | 🟢 LOW |
| 6.3 | Music Player | Sidebar player, Spotify/Apple Music | Sidebar framework supports it — not preconfigured | ⚠️ Partial | 🟢 LOW |
| | **PRODUCTIVITY** | | | | |
| 7.1 | Snapshot + Annotations | Screenshot with editing tools, PDF export | ✅ Screenshot + draw tools (arrow, rect, circle, line, text, colors) | ✅ Match | — |
| 7.2 | Easy Files | Recent downloads in upload dialogs | None | ❌ Missing | 🟢 LOW |
| 7.3 | Currency Converter | Auto-convert highlighted currencies | None | ❌ Missing | 🟢 LOW |
| 7.4 | Unit Converter | Convert imperial/metric on select | None | ❌ Missing | 🟢 LOW |
| 7.5 | Time Zone Converter | Convert timezone on select | None | ❌ Missing | 🟢 LOW |
| 7.6 | Search Popup | Popup above selected text | Context menu only | ⚠️ Partial | 🟡 MED |
| 7.7 | Opera Translate | 47-language page translation | None | ❌ Missing | 🟡 MED |
| 7.8 | Find on Page | Ctrl+F text search | ✅ Find in Page | ✅ Match | — |
| 7.9 | BABE (Address Bar) | Pop-out panel with frequent sites | Basic URL bar with autocomplete | ⚠️ Partial | 🟢 LOW |
| | **START PAGE** | | | | |
| 8.1 | Speed Dial | Configurable tile grid, folders, thumbnails | Quick links — configurable links planned | ⚠️ Partial | 🟡 MED |
| 8.2 | Personal News | News feed below Speed Dial | ✅ Available as sidebar utility | ✅ Match | — |
| 8.3 | Easy Setup Panel | Quick-config panel | Onboarding flow | ⚠️ Partial | 🟢 LOW |
| | **CUSTOMIZATION** | | | | |
| 9.1 | Dynamic Themes | Animated wallpapers, sound effects | Dark/light/system + Liquid Glass | ⚠️ Partial | 🟡 MED |
| 9.2 | Wallpapers | Custom start page wallpapers | None | ❌ Missing | 🟢 LOW |
| 9.3 | Chrome Extensions | Chrome Web Store compatibility | ✅ CRX install, gallery, Chrome import, update management, conflict detection | ✅ **Tandem exceeds** | — |
| 9.4 | Language Customization | Browser UI localization | None | ❌ Missing | 🟢 LOW |
| 9.5 | Import Bookmarks | Import from Chrome, Firefox, Safari | ✅ Chrome import (profiles, bookmarks, history, cookies, extensions, continuous sync) | ✅ **Tandem exceeds** | — |
| 9.6 | Startup Preferences | Restore session, custom start page | Session state save/load — no "restore on startup" toggle | ⚠️ Partial | 🟡 MED |
| | **SYNC & CROSS-DEVICE** | | | | |
| 10.1 | Opera Sync | Cross-device sync | Chrome bookmark import/sync | ⚠️ Partial | 🟢 LOW |
| 10.2 | My Flow | QR-paired cross-device sharing | None — needs Tandem mobile | ❌ Missing | 🟢 LOW |
| | **PINBOARDS** | | | | |
| 11.1 | Pinboards | Content curation boards, Kanban, sharing | ✅ Full CRUD, link/image/text/quote cards, layouts (default/spacious/dense), themes, emoji | ✅ **Tandem matches** | — |
| | **PERFORMANCE** | | | | |
| 13.1 | Battery Saver | Reduce background activity on battery | None | ❌ Missing | 🟢 LOW |
| 13.2 | Tab Snoozing | Auto-suspend inactive tabs | None | ❌ Missing | 🔴 HIGH |
| | **BOOKMARKS** | | | | |
| 14.1 | Bookmarks Manager | Folders, search, drag-drop, thumbnails, trash | ✅ Full management + Chrome-style URL autocomplete | ✅ Match | — |
| 14.2 | Bookmarks Bar | Persistent bar below address bar | ✅ Bookmarks bar | ✅ Match | — |
| | **CORE BROWSER** | | | | |
| 15.1 | Navigation | Back, forward, reload | ✅ | ✅ Match | — |
| 15.2 | Address & Search Bar | Unified URL/search input | ✅ URL bar with autocomplete | ✅ Match | — |
| 15.3 | Context Menus | Page, link, image context menus | ✅ 50+ context menu items | ✅ **Tandem exceeds** | — |
| 15.4 | Zoom | Per-page zoom, configurable | ✅ | ✅ Match | — |
| 15.5 | Full Screen | Immersive mode | ✅ | ✅ Match | — |
| 15.6 | Downloads | Progress, icon, configurable location | ✅ Download tracking + interception | ✅ Match | — |
| 15.7 | History | Search, bulk delete, recently closed | ✅ | ✅ Match | — |
| 15.8 | Search Engine Mgmt | Multiple engines with keywords | DuckDuckGo only | ❌ Missing | 🟡 MED |

---

## What Tandem Has That Opera Doesn't

| Category | Tandem Feature | Opera Equivalent |
|----------|---------------|-----------------|
| **AI Wingman** | 6-layer AI wingman, MCP server (231 tools), multi-backend, dual mode, emergency stop, task approval | Aria chatbot (single model, no tool use, no autonomy) |
| **Prompt Injection Guard** | 40+ detection patterns, hidden text detection, risk scoring (0-100), user override with double-confirm | None |
| **AI Awareness** | `tandem_awareness_digest` (activity summary) + `tandem_awareness_focus` (current state snapshot) | None |
| **AI Workspaces** | Dedicated agent workspace isolation with full lifecycle management | None |
| **Security Shield** | 6-layer: NetworkShield, OutboundGuard, ContentAnalyzer, BehaviorMonitor, GatekeeperAI, EvolutionEngine | Basic ad blocker + phishing blacklist |
| **Stealth/Anti-Detection** | Electron/automation concealment (webdriver, window.process, UA), OS-level (isTrusted) input injection, Chrome API presence — real hardware fingerprint left intact | None — Opera is fully detectable |
| **Behavioral Learning** | Learn typing rhythm, mouse curves, scroll patterns. Replay as humanized automation | None |
| **Agent Automation** | 231 MCP tools, JS execution with approval gates, accessibility snapshots, Playwright-style locators, headless browsing, workflow engine | None |
| **CLI** | Terminal-based browser control | None |
| **DevTools Bridge** | CDP endpoints: console, network (HAR export), DOM (XPath/CSS), performance, storage via API | Standard DevTools (manual only) |
| **Network Mocking** | Intercept and mock HTTP requests via CDP | None |
| **Device Emulation** | Predefined device profiles via API | None (some via DevTools) |
| **Drawing/Annotation** | 6 tools with snap-for-wingman | Basic screenshot crop only |
| **Voice Input** | Native speech-to-text (Apple Speech API + Whisper fallback), multi-language | Aria voice (less configurable) |
| **Video Recording** | Screen/audio capture with MP4/WebM export | None |
| **ClaroNote** | Voice recording → transcription integration | None |
| **Site Memory** | Per-domain visit tracking, time spent, content change detection | Basic history only |
| **Scheduled Watches** | Monitor URLs for changes on schedule, alert on diff | None |
| **Form Memory** | Remember form inputs per domain | Basic autofill only |
| **Tab Lock Manager** | Exclusive agent access locks on tabs for multi-agent coordination | None |
| **Content Extraction** | Smart page-to-markdown extraction | None |
| **Live Preview** | HTML preview create/update/list/delete system | None |
| **Password Manager** | AES-256-GCM encrypted local vault, per-item salt/IV, zero cloud | Opera uses third-party sync |
| **Extension Management** | Gallery, update management, conflict detection, disk usage tracking | Basic Chrome Web Store support |
| **Chrome Continuous Sync** | Import + continuous sync of profiles, bookmarks, history, cookies | One-time import only |

---

## Recommended Sprint Plan (Next 3 Weeks)

### Week 1: Tab Organization Polish
**Goal:** Close the tab management gap

| Day | Task | Effort |
|-----|------|--------|
| Mon | Tab Islands — auto-grouping logic (track opener chains by origin) | Full day |
| Tue | Tab Islands — shell UI (island handles, collapse/expand, naming) | Full day |
| Wed | Search in Tabs — Cmd+Space popup, real-time filter by title/URL, recently closed | Full day |
| Thu | Split Screen — SplitScreenManager, 2-pane vertical/horizontal layout | Full day |
| Fri | Split Screen — divider resize, active pane focus, exit split. Tab Emojis | Full day |

**Deliverable:** Tab Islands with auto-grouping, tab search popup, 2-pane split screen, tab emojis

### Week 2: Consumer Privacy & Performance
**Goal:** Close the privacy/performance UX gap

| Day | Task | Effort |
|-----|------|--------|
| Mon | Ad Blocker — EasyList/uBlock filter parsing, integrate into NetworkShield | Full day |
| Tue | Ad Blocker — per-site exceptions, YouTube ad blocking, shield badge with blocked count | Full day |
| Wed | Tab Snoozing — auto-suspend after configurable idle time, reactivate on click, memory stats | Full day |
| Thu | Private Browsing — Cmd+Shift+N ephemeral window, auto-delete on close | Half day |
| Thu | Security Badges — HTTPS/blocked/permissions indicators in address bar | Half day |
| Fri | Clear Data on Exit + Granular Delete — per-type + time range + auto-clean toggle | Full day |

**Deliverable:** Consumer ad blocking, tab snoozing, private browsing, security badges

### Week 3: Productivity & Polish
**Goal:** Remaining medium-priority items

| Day | Task | Effort |
|-----|------|--------|
| Mon | Search Engine Management — multiple engines with keywords, custom engines | Full day |
| Tue | Startup Preferences — restore previous session toggle + Speed Dial configurable tiles | Full day |
| Wed | Search Popup — inline popup above selected text with search, copy, conversions | Full day |
| Thu | Duplicate Tab Highlighter + Tab Traces (recency brightness) | Full day |
| Fri | Spotify sidebar panel + Tab Preview on Hover | Full day |

**Deliverable:** Search engines, session restore, inline search popup, tab polish

### Total: ~15 remaining features in 3 weeks

---

## Progress Since Original Analysis

```
Feb 2026 (v0.15.1):  ✅ 19  ⚠️ 17  ❌ 29  (45 gaps)
Apr 2026 (v0.70.0):  ✅ 30  ⚠️ 12  ❌ 19  (31 gaps)
                      ─────────────────────
                      +11 ✅  -5 ⚠️  -10 ❌  (14 gaps closed)
```

The biggest wins: Sidebar (6 chat clients + Gmail/Calendar), Pinboards (full system), Workspaces (visual switching), Tracker Blocking (active), Chrome Import (continuous sync), and the entire AI awareness/workspace/prompt-injection layer that didn't exist before.

---

*Updated 2026-04-11 by Claude for Robin Waslander*
*Source: Tandem v0.70.0 codebase analysis (231 MCP tools, 57 src modules, 19 API route files)*
*Previous: 2026-02-28, Tandem v0.15.1*
