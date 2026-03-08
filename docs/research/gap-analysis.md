# Tandem vs Opera — Gap Analysis & Roadmap

> Generated: 2026-02-28
> Tandem v0.15.1 (380+ features) vs Opera Desktop (68 features)
> Purpose: Identify high-value Opera features to build into Tandem

---

## Executive Summary

After comparing all 68 Opera features against Tandem's 380+ feature inventory:

- **19 features** Opera has that Tandem **also has** (✅) — often Tandem exceeds Opera
- **17 features** Opera has that Tandem **partially has** (⚠️) — upgrade path exists
- **29 features** Opera has that Tandem **is missing** (❌) — new builds required
- **5 features** excluded per Robin's preferences (Facebook Messenger, VK, Cashback, Crypto Wallet, Continue Shopping)

### What Stands Out

Tandem **crushes** Opera on: AI integration (6-layer wingman vs Aria chatbot), security (6-layer shield vs basic blocklists), stealth/anti-detection (no Opera equivalent), agent automation (195+ API endpoints, MCP server, CLI), and developer tooling (CDP bridge, network mocking, device emulation).

Opera **crushes** Tandem on: sidebar messenger integration, tab organization UX (Islands, Workspaces UI, Split Screen), consumer privacy features (ad blocking, VPN, private browsing), content curation (Pinboards), and cross-device sync.

**The pattern:** Tandem is a power tool for AI-human symbiosis. Opera is a consumer browser with lifestyle features. The gap is in **consumer UX polish and sidebar productivity** — areas that would make Tandem more pleasant for daily driving.

### Top 10 Recommended Features to Build

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 1 | **Sidebar Chat Clients** | WhatsApp/Discord/Slack/Telegram/Instagram/X — Robin's #1 request | Hard (1-2 weeks) |
| 2 | **Pinboards** | Content curation boards with Kanban — Robin loves these | Hard (1-2 weeks) |
| 3 | **Tab Islands** (upgrade) | Auto-grouping, collapsing, naming — beyond basic tab groups | Medium (3-5 days) |
| 4 | **Split Screen** | Multi-pane browsing in single window — power user essential | Medium (3-5 days) |
| 5 | **Workspaces UI** | Visual workspace switching on top or /sessions | Medium (3-5 days) |
| 6 | **Tab Emojis** | Emoji badges on tabs — Robin likes this | Easy (1-2 days) |
| 7 | **Search in Tabs** | Ctrl+Space tab search popup | Easy (1-2 days) |
| 8 | **Ad Blocker** (consumer) | Block ads, not just malicious URLs — table stakes | Medium (3-5 days) |
| 9 | **Tab Snoozing** | Auto-suspend inactive tabs for memory savings | Medium (3-5 days) |
| 10 | **Private Browsing Window** | Ephemeral window that deletes all data on close | Easy (1-2 days) |

---

## Priority Gaps (Robin's Favorites First)

### 🔴 HIGH Priority — Build These First

These are features Robin explicitly loves or that are critical gaps for daily-driving Tandem.

| # | Feature | Opera Description | Tandem Status | Effort | Priority |
|---|---------|-------------------|---------------|--------|----------|
| 1 | **Sidebar Chat Clients** | WhatsApp, Discord, Slack, Telegram, Instagram, X as sidebar webview panels with notifications, mute, pin | ❌ Missing — Tandem has wingman panel but no messenger sidebar | Hard (1-2 weeks) | 🔴 HIGH |
| 2 | **Pinboards** | Virtual boards for collecting links, images, notes, YouTube embeds. Kanban mode. Shareable via link. Emoji reactions | ❌ Missing — Tandem has page notes (POST /context/note) but no board concept | Hard (1-2 weeks) | 🔴 HIGH |
| 3 | **Tab Islands** | Auto-groups tabs by browsing context. Color-coded clusters with names. Collapsible. Shift+click multi-select. Visual connections between grouped tabs | ⚠️ Partial — Has `POST /tabs/group` with colors but no auto-grouping, collapsing, naming, or visual island UX | Medium (3-5 days) | 🔴 HIGH |
| 4 | **Split Screen** | View 2-4 websites simultaneously in vertical/horizontal/grid layouts. Resizable panes. Independent navigation per pane | ❌ Missing — No multi-pane support | Medium (3-5 days) | 🔴 HIGH |
| 5 | **Workspaces** | Up to 5 named workspace buckets (Work, Shopping, Research). Each has own tabs/islands. Visual sidebar switching. Ctrl+Tab scoped to workspace | ⚠️ Partial — Has /sessions with full partition isolation but no visual workspace switcher UI, no sidebar icons, no quick-switch | Medium (3-5 days) | 🔴 HIGH |
| 6 | **Tab Emojis** | Assign emoji icons to tabs. Hover to reveal emoji selector. Persists across sessions | ❌ Missing | Easy (1-2 days) | 🔴 HIGH |
| 7 | **Search in Tabs** | Ctrl+Space real-time search across all open tabs by title/URL. Shows recently closed tabs. Dynamic filtering | ❌ Missing — Has `GET /tabs/list` API but no search UI | Easy (1-2 days) | 🔴 HIGH |
| 8 | **Ad Blocker** (consumer-grade) | Blocks ads at request level before render. YouTube ads. Popups. NoCoin mining protection. Per-site exceptions. Shield badge with blocked count | ⚠️ Partial — NetworkShield blocks malicious URLs (811K blocklist) but not consumer ads. No EasyList/adblock filter support | Medium (3-5 days) | 🔴 HIGH |
| 9 | **Tab Snoozing** | Auto-suspend inactive tabs to free memory. Tabs reactivate on click | ⚠️ Partial — Has resource monitoring (`GET /security/monitor/resources`) but no automatic suspension | Medium (3-5 days) | 🔴 HIGH |
| 10 | **Private Browsing** | Window that deletes all data (history, cache, cookies) on close. Cmd+Shift+N | ⚠️ Partial — Has session isolation but no ephemeral private window that auto-cleans | Easy (1-2 days) | 🔴 HIGH |

### 🟡 MEDIUM Priority — Build After Highs

| # | Feature | Opera Description | Tandem Status | Effort | Priority |
|---|---------|-------------------|---------------|--------|----------|
| 11 | **Tracker Blocker** (active) | Block tracking scripts/pixels at network level. Badge count | ⚠️ Partial — Detects trackers (`GET /security/page/trackers`) but doesn't block them | Easy (1-2 days) | 🟡 MED |
| 12 | **Security Badges** | Visual icons in address bar showing HTTPS, blocked ads, active permissions, VPN status | ⚠️ Partial — Has security APIs but no visual address bar badges | Easy (1-2 days) | 🟡 MED |
| 13 | **Tab Traces** | Highlight recently used tabs with brightness correlating to recency | ❌ Missing | Easy (1-2 days) | 🟡 MED |
| 14 | **Duplicate Tabs Highlighter** | Highlight and bulk-close duplicate tabs | ❌ Missing | Easy (1-2 days) | 🟡 MED |
| 15 | **Tab Preview on Hover** | Thumbnail preview when hovering over tabs | ❌ Missing | Medium (3-5 days) | 🟡 MED |
| 16 | **Delete Browsing Data** (granular) | Granular control: history, cookies, cache, passwords, autofill, site settings separately. Time ranges | ⚠️ Partial — Has `POST /data/wipe` but limited granularity | Easy (1-2 days) | 🟡 MED |
| 17 | **Clear Data on Exit** | Auto-delete selected data types on browser close | ❌ Missing | Easy (1-2 days) | 🟡 MED |
| 18 | **Speed Dial** (configurable) | User-customizable tile grid on start page with folders, drag-and-drop, thumbnails | ⚠️ Partial — Has 8 hardcoded quick links, configurable links is planned | Medium (3-5 days) | 🟡 MED |
| 19 | **Startup Preferences** | Restore previous session tabs on startup. Or open specific pages | ⚠️ Partial — Has custom start page config but no "restore previous session" option | Easy (1-2 days) | 🟡 MED |
| 20 | **Search Engine Management** | Multiple search engines with keywords. Create custom engines from any site's search bar | ⚠️ Partial — Uses DuckDuckGo, no engine management | Medium (3-5 days) | 🟡 MED |
| 21 | **Paste Protection** | Monitor clipboard for 2 min after copying sensitive data (IBAN, credit cards). Warn if clipboard tampered | ❌ Missing | Easy (1-2 days) | 🟡 MED |
| 22 | **Search Popup** (highlight actions) | Popup above selected text with search, copy, currency/unit/timezone conversion | ⚠️ Partial — Has "Search Google for..." in context menu but no inline popup | Medium (3-5 days) | 🟡 MED |
| 23 | **Opera Translate** | Page translation with auto-detect, 47 languages | ❌ Missing — Can use extensions | Medium (3-5 days) | 🟡 MED |
| 24 | **Battery Saver** | Reduce background activity when unplugged: pause plugins, stop animations, throttle timers | ❌ Missing | Medium (3-5 days) | 🟡 MED |
| 25 | **Spotify/Music Player** | Sidebar music player for Spotify/Apple Music/YouTube Music. Detachable. Auto-pause when other media plays | ❌ Missing | Medium (3-5 days) | 🟡 MED |
| 26 | **My Flow** | Encrypted cross-device sharing via QR code. Share links, files, notes between desktop and mobile | ❌ Missing — Would need Tandem mobile app | Hard (1-2 weeks) | 🟡 MED |
| 27 | **Dynamic Themes** | Animated wallpapers, sound effects, music-reactive themes | ⚠️ Partial — Has dark/light/system + Liquid Glass. No animated themes | Medium (3-5 days) | 🟡 MED |

### 🟢 LOW Priority — Nice to Have

| # | Feature | Opera Description | Tandem Status | Effort | Priority |
|---|---------|-------------------|---------------|--------|----------|
| 28 | **Visual Tab Cycler** | Thumbnail preview popup when Ctrl+Tab cycling | ❌ Missing | Medium (3-5 days) | 🟢 LOW |
| 29 | **Easy Files** | Show recent downloads/clipboard in file upload dialogs | ❌ Missing | Medium (3-5 days) | 🟢 LOW |
| 30 | **Currency Converter** | Auto-convert highlighted monetary values to preferred currency | ❌ Missing | Easy (1-2 days) | 🟢 LOW |
| 31 | **Unit Converter** | Convert imperial/metric on text selection | ❌ Missing | Easy (1-2 days) | 🟢 LOW |
| 32 | **Time Zone Converter** | Convert timezone abbreviations to local time | ❌ Missing | Easy (1-2 days) | 🟢 LOW |
| 33 | **BABE (Enhanced Address Bar)** | Pop-out panel with frequent sites, bookmarks, recommendations on address bar click | ⚠️ Partial — Basic URL bar | Medium (3-5 days) | 🟢 LOW |
| 34 | **Do Not Track** | Send DNT header with every request | ❌ Missing | Easy (< 1 day) | 🟢 LOW |
| 35 | **Video Skip** | Jump to end or video with one click | ❌ Missing | Easy (1-2 days) | 🟢 LOW |
| 36 | **Personal News** | News feed on start page | ❌ Missing | Medium (3-5 days) | 🟢 LOW |
| 37 | **Wallpapers** | Custom start page wallpapers | ❌ Missing | Easy (1-2 days) | 🟢 LOW |
| 38 | **Language Customization** | Browser UI localization | ❌ Missing | Medium (3-5 days) | 🟢 LOW |
| 39 | **Opera Sync** | Cross-device sync or bookmarks, tabs, history, passwords | ❌ Missing — Has Chrome bookmark sync only | Hard (1-2 weeks) | 🟢 LOW |
| 40 | **Save Tabs as Speed Dial Folder** | Batch-save tabs as bookmark folder | ⚠️ Partial — Has session state save | Easy (1-2 days) | 🟢 LOW |
| 41 | **Easy Setup Panel** | Quick-setup panel for key features | ⚠️ Partial — Has onboarding | Easy (1-2 days) | 🟢 LOW |

---

## Feature-by-Feature Comparison Table

| # | Feature | Opera | Tandem | Gap | Priority |
|---|---------|-------|--------|-----|----------|
| | **TAB MANAGEMENT** | | | | |
| 1.1 | Tab Islands | Auto-grouping, collapsible, named, colored clusters | Basic tab groups with colors (`POST /tabs/group`) | ⚠️ Partial | 🔴 HIGH |
| 1.2 | Workspaces | 5 named buckets, visual sidebar switching | /sessions with partition isolation, no UI | ⚠️ Partial | 🔴 HIGH |
| 1.3 | Split Screen | 2-4 panes, resizable, independent navigation | None | ❌ Missing | 🔴 HIGH |
| 1.4 | Tab Emojis | Emoji badges on tabs, hover selector | None | ❌ Missing | 🔴 HIGH |
| 1.5 | Tab Traces | Recency-based brightness highlighting | None | ❌ Missing | 🟡 MED |
| 1.6 | Search in Tabs | Ctrl+Space search by title/URL | API only (`GET /tabs/list`) | ❌ Missing | 🔴 HIGH |
| 1.7 | Visual Tab Cycler | Thumbnail Ctrl+Tab preview | None | ❌ Missing | 🟢 LOW |
| 1.8 | Tab Preview on Hover | Thumbnail on tab hover | None | ❌ Missing | 🟡 MED |
| 1.9 | Pin Tabs | Favicon-only, persist across restart | ✅ Tab context menu pin/unpin | ✅ Match | — |
| 1.10 | Tab Snoozing | Auto-suspend inactive tabs | Resource monitoring only | ⚠️ Partial | 🔴 HIGH |
| 1.11 | Duplicate Tabs Highlighter | Highlight + bulk close dupes | None | ❌ Missing | 🟡 MED |
| 1.12 | Close Tab Variations | Close other, close right, close dupes, reopen | Close other, close right, reopen ✅ | ✅ Match | — |
| 1.13 | Save Tabs as Speed Dial | Batch save to bookmark folder | Session state save only | ⚠️ Partial | 🟢 LOW |
| | **SIDEBAR** | | | | |
| 2.1 | Sidebar Layout | Multi-panel sidebar with customizable panels | Single wingman panel (left/right) | ⚠️ Partial | 🔴 HIGH |
| 2.2 | Sidebar Messengers | Webview panels for apps with notifications | None | ❌ Missing | 🔴 HIGH |
| | **MESSENGERS** | | | | |
| 3.1 | WhatsApp | Full WhatsApp Web in sidebar | None | ❌ Missing | 🔴 HIGH |
| 3.2 | Discord | Full Discord in sidebar | None | ❌ Missing | 🔴 HIGH |
| 3.3 | Slack | Full Slack in sidebar | None | ❌ Missing | 🔴 HIGH |
| 3.4 | Instagram | Instagram feed/DMs in sidebar | None | ❌ Missing | 🟡 MED |
| 3.5 | X/Twitter | Full X in sidebar | X-Scout agent (internal), no sidebar UI | ❌ Missing | 🟡 MED |
| 3.6 | Spotify | Sidebar music player, detachable | None | ❌ Missing | 🟡 MED |
| 3.7 | Telegram | Telegram in sidebar | None | ❌ Missing | 🟡 MED |
| | **AI** | | | | |
| 4.1 | Opera AI (Aria) | Contextual AI chat, image gen, web search | AI Wingman with 6-layer security, MCP, 25 tools, CLI, multi-backend | ✅ **Tandem far exceeds** | — |
| | **PRIVACY & SECURITY** | | | | |
| 5.1 | Ad Blocker | EasyList filters, YouTube ads, NoCoin, per-site | NetworkShield (malicious URLs only) | ⚠️ Partial | 🔴 HIGH |
| 5.2 | Tracker Blocker | Block tracking scripts/pixels | Detect only, no blocking | ⚠️ Partial | 🟡 MED |
| 5.3 | VPN | Free browser VPN, AES-256, no-log | None (proxy support planned) | ❌ Missing | 🟡 MED |
| 5.4 | Paste Protection | Clipboard monitoring for sensitive data | None | ❌ Missing | 🟡 MED |
| 5.5 | Private Browsing | Ephemeral window, auto-delete on close | Session isolation (manual) | ⚠️ Partial | 🔴 HIGH |
| 5.6 | Security Badges | Visual address bar icons | Security APIs, no visual badges | ⚠️ Partial | 🟡 MED |
| 5.7 | Phishing/Malware | Blacklist checking, warning page | 6-layer Security Shield, 811K blocklist, YARA rules | ✅ **Tandem far exceeds** | — |
| 5.8 | Do Not Track | DNT header | None | ❌ Missing | 🟢 LOW |
| 5.9 | Certificate Management | View/manage TLS certificates | Via Chromium/Electron | ✅ Match | — |
| 5.10 | Clear Data on Exit | Auto-delete per data type on close | None | ❌ Missing | 🟡 MED |
| 5.11 | Delete Browsing Data | Granular per type + time range | `POST /data/wipe` (limited) | ⚠️ Partial | 🟡 MED |
| | **MEDIA** | | | | |
| 6.1 | Video Popout (PiP) | Floating always-on-top video player | PiP mode (Cmd+Shift+P) ✅ | ✅ Match | — |
| 6.2 | Video Skip | Jump to end or video | None | ❌ Missing | 🟢 LOW |
| 6.3 | Music Player | Sidebar player, Spotify/Apple Music | None | ❌ Missing | 🟡 MED |
| | **PRODUCTIVITY** | | | | |
| 7.1 | Snapshot + Annotations | Screenshot with 8 editing tools, PDF export | Screenshot + 6 draw tools (arrow, rect, circle, line, text, colors) | ✅ Match | — |
| 7.2 | Easy Files | Recent downloads in upload dialogs | None | ❌ Missing | 🟢 LOW |
| 7.3 | Currency Converter | Auto-convert highlighted currencies | None | ❌ Missing | 🟢 LOW |
| 7.4 | Unit Converter | Convert imperial/metric on select | None | ❌ Missing | 🟢 LOW |
| 7.5 | Time Zone Converter | Convert timezone on select | None | ❌ Missing | 🟢 LOW |
| 7.6 | Search Popup | Popup above selected text | "Search Google for..." in context menu | ⚠️ Partial | 🟡 MED |
| 7.7 | Opera Translate | 47-language page translation | None (use extensions) | ❌ Missing | 🟡 MED |
| 7.8 | Find on Page | Ctrl+F text search | Find in Page (Cmd+F) ✅ | ✅ Match | — |
| 7.9 | BABE (Address Bar) | Pop-out panel with frequent sites | Basic URL bar | ⚠️ Partial | 🟢 LOW |
| | **START PAGE** | | | | |
| 8.1 | Speed Dial | Configurable tile grid, folders, thumbnails | 8 hardcoded quick links | ⚠️ Partial | 🟡 MED |
| 8.2 | Personal News | News feed below Speed Dial | None | ❌ Missing | 🟢 LOW |
| 8.3 | Easy Setup Panel | Quick-config panel for key features | Onboarding flow | ⚠️ Partial | 🟢 LOW |
| | **CUSTOMIZATION** | | | | |
| 9.1 | Dynamic Themes | Animated wallpapers, sound effects, music themes | Dark/light/system + Liquid Glass | ⚠️ Partial | 🟡 MED |
| 9.2 | Wallpapers | Custom start page wallpapers | None | ❌ Missing | 🟢 LOW |
| 9.3 | Chrome Extensions | Chrome Web Store compatibility | CRX install, 30-item gallery, Chrome import ✅ | ✅ Match | — |
| 9.4 | Language Customization | Browser UI localization | None | ❌ Missing | 🟢 LOW |
| 9.5 | Import Bookmarks | Import from Chrome, Firefox, Safari | Chrome import (bookmarks, history, cookies, extensions) ✅ | ✅ Match | — |
| 9.6 | Startup Preferences | Restore session, custom start page | Custom start page only | ⚠️ Partial | 🟡 MED |
| | **SYNC & CROSS-DEVICE** | | | | |
| 10.1 | Opera Sync | Cross-device sync or everything | Chrome bookmark sync only | ❌ Missing | 🟢 LOW |
| 10.2 | My Flow | QR-paired cross-device sharing | None | ❌ Missing | 🟡 MED |
| | **PINBOARDS** | | | | |
| 11.1 | Pinboards | Content curation boards, Kanban, sharing | Page notes only (`POST /context/note`) | ❌ Missing | 🔴 HIGH |
| | **PERFORMANCE** | | | | |
| 13.1 | Battery Saver | Reduce background activity on battery | None | ❌ Missing | 🟡 MED |
| 13.2 | Tab Snoozing | Auto-suspend inactive tabs | (Same as 1.10) | ⚠️ Partial | 🔴 HIGH |
| | **BOOKMARKS** | | | | |
| 14.1 | Bookmarks Manager | Folders, search, drag-drop, thumbnails, trash | Folders, search, manager (tandem://bookmarks) ✅ | ✅ Match | — |
| 14.2 | Bookmarks Bar | Persistent bar below address bar | Bookmarks bar (Cmd+Shift+B) ✅ | ✅ Match | — |
| | **CORE BROWSER** | | | | |
| 15.1 | Navigation | Back, forward, reload | Back, forward, reload ✅ | ✅ Match | — |
| 15.2 | Address & Search Bar | Unified URL/search input | URL bar ✅ | ✅ Match | — |
| 15.3 | Context Menus | Page, link, image context menus | 50+ context menu items ✅ | ✅ **Tandem exceeds** | — |
| 15.4 | Zoom | Per-page zoom, default configurable | Zoom in/out/reset + per-tab levels ✅ | ✅ Match | — |
| 15.5 | Full Screen | Immersive mode | Full screen toggle ✅ | ✅ Match | — |
| 15.6 | Downloads | Progress bar, download icon, configurable location | Download tracking, interception ✅ | ✅ Match | — |
| 15.7 | History | Search, bulk delete, recently closed | History with search, import ✅ | ✅ Match | — |
| 15.8 | Search Engine Mgmt | Multiple engines with keywords, custom engines | DuckDuckGo only | ⚠️ Partial | 🟡 MED |

---

## Deep Dives

### Pinboards — Full Spec

#### What Opera Offers
Opera Pinboards are virtual "magnetic boards" — canvas-style spaces for collecting and organizing web content:

**Content types supported:**
- Text notes / annotations
- Web links (with preview cards)
- Images (drag-and-drop or right-click save)
- Screenshots
- YouTube video embeds (playback within board)
- Music files
- Documents

**Organization:**
- Free-form drag-and-drop arrangement on a canvas
- **Kanban board mode** — "To Do / In Progress / Done" columns
- Multiple boards (travel planning, shopping, design, vision boards)
- Each board is a separate named space

**Collaboration:**
- Share any board via link (copies shareable URL to clipboard)
- No login required for viewers — anyone with the link can view
- Emoji reactions from viewers (collaborative feedback)
- Cross-device sync via Opera account

**Access points:**
- Sidebar icon
- opera://pinboards
- Right-click any content → "Save to Pinboard"
- "New pinboard" button

#### What Tandem Currently Has
- `POST /context/note` — Add text notes to any page (per-URL)
- Bookmarks with folders — basic content collection
- Session state save — save/restore tab groups
- No visual board/canvas, no card layout, no Kanban

#### Implementation Plan for Tandem

**Architecture:**
```
src/pinboard-manager.ts          — Core pinboard data model + persistence
src/routes/pinboard-routes.ts    — REST API endpoints
shell/pinboard.html              — Pinboard UI (tandem://pinboards)
shell/pinboard-card.html         — Card component
```

**Data Model:**
```typescript
interface Pinboard {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layout: 'freeform' | 'kanban';
  kanbanColumns?: string[];  // e.g., ["To Do", "In Progress", "Done"]
  cards: PinboardCard[];
}

interface PinboardCard {
  id: string;
  type: 'note' | 'link' | 'image' | 'screenshot' | 'video';
  title?: string;
  content: string;          // text, URL, or image path
  thumbnail?: string;       // preview image
  position: { x: number; y: number };  // freeform layout
  column?: string;          // kanban column
  color?: string;
  createdAt: string;
}
```

**API Endpoints:**
- `GET /pinboards` — list all pinboards
- `POST /pinboards` — create new pinboard
- `GET /pinboards/:id` — get pinboard with cards
- `PUT /pinboards/:id` — update pinboard (name, layout)
- `DELETE /pinboards/:id` — delete pinboard
- `POST /pinboards/:id/cards` — add card
- `PUT /pinboards/:id/cards/:cardId` — update card (move, edit)
- `DELETE /pinboards/:id/cards/:cardId` — remove card

**UI Features:**
- Canvas with drag-and-drop cards (use CSS grid for Kanban, absolute positioning for freeform)
- Right-click context menu integration: "Save to Pinboard" for links, images, selections
- Sidebar panel option (new tab in wingman panel, or dedicated sidebar icon)
- Card preview with favicon, title, thumbnail for links
- Keyboard shortcut (Cmd+Shift+P could conflict with PiP — use Cmd+Shift+I or similar)

**Storage:** SQLite (extend existing database) or JSON file in `~/.tandem/pinboards/`

**Effort:** Hard — 1-2 weeks. The canvas UI (especially freeform drag-and-drop) is the most complex part. Kanban is easier with CSS grid. V1 could ship Kanban-only and add freeform later.

**V1 scope (1 week):** Kanban boards with note/link/image cards, context menu integration, sidebar access
**V2 scope (+1 week):** Freeform canvas, YouTube embeds, share via link, screenshot cards

---

### Sidebar Chat Clients — Full Spec

#### What Opera Offers
Each messenger (WhatsApp, Discord, Slack, Telegram, Instagram, X) runs as a **sidebar webview panel** — essentially a narrow BrowserView pinned to the left side or the window, independent or the main tab content.

**Per-panel features:**
- Pin/unpin (always visible vs toggle)
- Mute notifications per panel
- Log in/out independently
- Notification badges on sidebar icons
- Panel width adjustable
- Three-dot menu per panel (mute/hide/logout)

**Sidebar architecture:**
- Vertical icon strip on the left edge
- Click icon → panel slides out from left
- Multiple panels can exist but only one visible at a time
- Each panel has its own session/cookies (isolated from main browsing)

#### Implementation Path in Electron/Tandem

**Architecture:**
```
src/sidebar-manager.ts           — Manages sidebar panels, state, notifications
src/routes/sidebar-routes.ts     — API for sidebar panel management
shell/sidebar.html               — Sidebar icon strip + panel container
```

**Core concept:** Each chat client is a `BrowserView` (or `WebContentsView` in modern Electron) with a fixed URL:

| Service | URL | Notes |
|---------|-----|-------|
| WhatsApp | `https://web.whatsapp.com` | QR code login, works in webview |
| Discord | `https://discord.com/app` | Standard login, full web app |
| Slack | `https://app.slack.com` | Workspace login, full web app |
| Telegram | `https://web.telegram.org` | QR code or phone login |
| Instagram | `https://www.instagram.com` | Standard login, full web app |
| X/Twitter | `https://x.com` | Standard login, full web app |

**Implementation steps:**

1. **Sidebar icon strip** — Vertical strip or icons on the left edge or the shell window (separate from the wingman panel which is on the right). Each icon represents a configured chat client.

2. **Panel management** — When an icon is clicked, create or show a `BrowserView` attached to the left side or the window, between the icon strip and the main content area. Width adjustable (default ~400px).

3. **Session isolation** — Each sidebar panel uses its own Electron `partition` (e.g., `persist:sidebar-whatsapp`) so login state is independent from main browsing and from other panels.

4. **Notification badges** — Use `webContents` event listeners to detect notifications:
   - Monitor `page-title-updated` for unread count changes (WhatsApp uses "({count}) WhatsApp")
   - Use `page-favicon-updated` for notification indicator changes
   - Inject JS to observe notification badges in the DOM where needed

5. **Panel state persistence** — Save which panels are configured, their widths, and mute states to `~/.tandem/sidebar-config.json`

6. **User-Agent considerations** — Some services (WhatsApp Web) require a specific User-Agent. The sidebar webviews should use a standard Chrome UA, not the Tandem stealth UA.

**API Endpoints:**
- `GET /sidebar/panels` — list configured panels
- `POST /sidebar/panels` — add new panel (service, position)
- `DELETE /sidebar/panels/:id` — remove panel
- `POST /sidebar/panels/:id/toggle` — show/hide panel
- `POST /sidebar/panels/:id/mute` — toggle notification mute
- `GET /sidebar/panels/:id/status` — get panel status (notifications, logged in)

**Key technical challenges:**
- **WhatsApp Web** requires specific conditions: must present as Chrome desktop browser, needs persistent localStorage for encryption keys. Works well in Electron BrowserView with `persist:` partition.
- **Discord** may show CAPTCHAs on first login from a new "browser." Consider using Tandem's stealth mode for the sidebar webview.
- **Slack** workspace switching within the sidebar panel works natively.
- **Panel width vs content** — Most web apps have responsive layouts, but some (Discord) have minimum widths. Default to 420px, allow resize.

**Effort:** Hard — 1-2 weeks for the full system. But a V1 with just the sidebar framework + WhatsApp/Discord could ship in 3-5 days.

**V1 (3-5 days):** Sidebar icon strip, panel framework, WhatsApp + Discord + Slack
**V2 (+3-5 days):** Telegram, Instagram, X, notification badges, mute, panel reordering

---

### Tab Islands — Implementation Plan

#### Current State in Tandem
Tandem has `POST /tabs/group` which creates Chromium tab groups with colors. This uses Electron's `tabs.group()` API. Tab groups appear as colored labels in the tab bar.

#### Gap: What Opera Islands Add Beyond Basic Groups
1. **Auto-creation** — When you open tabs from a link (same origin), they automatically form an island. No manual grouping needed.
2. **Visual design** — Color-coded handles above grouped tabs with subtle connecting lines/shading, not just a label
3. **Collapsible** — Click an island handle to collapse all its tabs into a single tab-width indicator
4. **Named handles** — Each island can have a custom name displayed on the handle
5. **Multi-tab selection** — Shift+click to select multiple tabs, then drag to form or merge islands
6. **Hover preview** — Tooltip showing thumbnails or all tabs in a collapsed island

#### Specific Code Changes Needed

**1. Auto-grouping logic** (`src/tab-manager.ts`):
```typescript
// Track tab opener chains
// When tab B is opened from tab A (via window.open or link click),
// auto-add tab B to tab A's group
// Use webContents 'new-window' event and 'did-create-window'
// to detect parent-child tab relationships

interface TabIsland {
  id: string;
  name?: string;
  color: string;
  collapsed: boolean;
  tabIds: number[];
  originDomain?: string;  // auto-group by origin
}
```

**2. Shell-side island UI** (`shell/index.html` tab bar):
- Replace simple group label with island handle element
- Add collapse/expand click handler
- Add name editing (double-click handle)
- Add visual connections between tabs in same island
- Handle drag-and-drop between islands

**3. Collapse behavior** (`shell/index.html`):
- When collapsed: show only the island handle with a count badge
- When expanded: show all tabs normally with island color styling
- Store collapse state in tab manager

**4. New API endpoints** (`src/routes/tab-routes.ts`):
- `POST /tabs/island/create` — create island from selected tabs
- `POST /tabs/island/:id/collapse` — toggle collapse
- `POST /tabs/island/:id/rename` — rename island
- `GET /tabs/islands` — list all islands with their tabs

**5. Settings** (`src/config-manager.ts`):
- `autoCreateIslands: boolean` — auto-group tabs opened from same origin
- `islandAutoGroupThreshold: number` — minimum tabs from same origin to auto-create island (default: 2)

**Effort:** Medium — 3-5 days. The auto-grouping logic is straightforward (track opener chains). The main effort is the shell-side UI for island handles, collapse animation, and drag-and-drop.

---

### Split Screen — Implementation Plan

#### Does Tandem Have This?
No. Tandem currently shows one webview at a time in the main content area. There is no multi-pane support.

#### How to Build in Electron

**Approach:** Use multiple `BrowserView` (or `WebContentsView`) instances arranged in a grid layout within the main window area.

**Architecture:**
```
src/split-screen-manager.ts      — Manages split layouts and pane webviews
src/routes/split-routes.ts       — API endpoints
shell/split-controls.html        — Split screen toolbar/controls
```

**Layout modes:**
```
┌─────────┐   ┌────┬────┐   ┌─────────┐   ┌────┬────┐
│         │   │    │    │   │         │   │    │    │
│  Single │   │ V1 │ V2 │   ├─────────┤   ├────┼────┤
│         │   │    │    │   │         │   │    │    │
└─────────┘   └────┴────┘   └─────────┘   └────┴────┘
  1 pane      2 vertical    2 horizontal   4 grid (2x2)
```

**Implementation:**

1. **SplitScreenManager** tracks active split state:
```typescript
interface SplitLayout {
  mode: 'single' | 'vertical-2' | 'horizontal-2' | 'grid-4';
  panes: SplitPane[];
}

interface SplitPane {
  tabId: number;
  bounds: { x: number; y: number; width: number; height: number };
}
```

2. **Entering split screen:**
   - Drag a tab downward (in shell tab bar) → split current + dragged tab
   - Shift+click two tabs → right-click → "Split Screen"
   - API: `POST /split/create` with tab IDs

3. **Pane management:**
   - Each pane is a separate `BrowserView` with its own webContents
   - Resizable dividers between panes (track mouse position for resize)
   - Each pane has independent navigation (address bar shows active pane's URL)

4. **Divider resize** — CSS + JS mouse event handling in shell. Track mousedown on divider, mousemove updates `BrowserView.setBounds()` for adjacent panes.

5. **Active pane focus** — Click on a pane to make it "active." The toolbar (URL bar, back/forward) controls the active pane. Visual indicator (blue border) on active pane.

6. **Exiting split screen:**
   - Close a pane → remaining tab becomes single
   - Right-click → "Exit Split Screen"
   - API: `POST /split/close`

**API Endpoints:**
- `POST /split/create` — enter split screen with specified tabs
- `GET /split/status` — current split layout
- `POST /split/layout` — change layout mode
- `POST /split/close` — exit split screen
- `POST /split/focus/:paneIndex` — focus specific pane

**Key challenge:** The main Tandem content area currently uses a single `<webview>` tag in the shell HTML. Split screen requires switching to multiple managed `BrowserView` instances OR multiple `<webview>` tags with CSS layout. The `BrowserView` approach is more robust but requires changes to how Tandem manages its main content area.

**Effort:** Medium — 3-5 days for 2-pane split. Grid (4-pane) adds 1-2 more days. The main risk is refactoring the single-webview assumption in the shell.

---

### Workspaces — /sessions vs Opera Workspaces Comparison

#### Tandem /sessions
- **Full partition isolation** — each session has separate cookies, localStorage, cache
- **API-driven** — `POST /sessions/create`, `POST /sessions/switch`, `POST /sessions/destroy`
- **CLI support** — `tandem session create/switch/list/destroy`
- **State persistence** — save/load session state (tabs, URLs) to disk
- **No UI** — no visual workspace switcher, no sidebar icons, no keyboard shortcuts for switching
- **Unlimited sessions** — no cap on number

#### Opera Workspaces
- **Visual switching** — sidebar icons for each workspace, one-click switch
- **Shared session** — all workspaces share cookies/login state (just tab organization)
- **Tab scoping** — Ctrl+Tab only cycles within current workspace
- **Named + iconified** — custom name and icon per workspace
- **5 workspace limit**
- **Tab context menu** — "Move tab to workspace" option
- **Link context menu** — "Open link in workspace"

#### Key Difference
Tandem sessions are **deeper** (full cookie isolation) while Opera workspaces are **shallower** (just tab organization). These serve different purposes:
- **Sessions** = different identities (logged into different accounts)
- **Workspaces** = different contexts (same identity, organized by task)

#### What Tandem Needs
Tandem should keep /sessions for identity isolation AND add a Workspaces layer for tab organization:

```typescript
interface Workspace {
  id: string;
  name: string;
  icon: string;        // emoji or icon name
  color: string;
  tabIds: number[];    // tabs belonging to this workspace
  isActive: boolean;
}
```

**Implementation:**
1. Add workspace data model to tab-manager.ts
2. Add workspace icons to sidebar (or new workspace strip)
3. When switching workspace: hide all non-workspace tabs, show workspace tabs
4. Add "Move tab to workspace" in tab context menu
5. Scope Cmd+Tab (or Ctrl+Tab) to current workspace

**Effort:** Medium — 3-5 days. The tab-hiding/showing logic is the core challenge. Workspace state persistence needs to survive browser restart.

**Relationship to Sessions:** Workspaces and Sessions are orthogonal. A workspace organizes tabs within a session. Users could have Session "Personal" with Workspaces "Shopping" and "Research," and Session "Work" with Workspaces "Project A" and "Email."

---

## Recommended Sprint Plan (Next 4 Weeks)

### Week 1: Sidebar Chat Clients + Tab Emojis
**Goal:** Get WhatsApp, Discord, and Slack running in sidebar panels

| Day | Task | Effort |
|-----|------|--------|
| Mon | Build `SidebarManager` — icon strip, panel framework, BrowserView management | Full day |
| Tue | Implement WhatsApp panel (partition, UA, QR login flow) | Full day |
| Wed | Implement Discord + Slack panels. Notification badge detection | Full day |
| Thu | Panel persistence, mute toggle, panel resize. Add Telegram/Instagram/X | Full day |
| Fri | Tab Emojis — emoji selector on tab hover, persistence. Polish sidebar | Full day |

**Deliverable:** 6 sidebar chat clients + tab emojis

### Week 2: Tab Islands + Search in Tabs + Split Screen
**Goal:** Upgrade tab organization to Opera-level

| Day | Task | Effort |
|-----|------|--------|
| Mon | Tab Islands — auto-grouping logic (track opener chains), island data model | Full day |
| Tue | Tab Islands — shell UI (island handles, colors, naming, collapse/expand) | Full day |
| Wed | Search in Tabs — Cmd+Space popup, real-time search by title/URL, recently closed | Full day |
| Thu | Split Screen — SplitScreenManager, 2-pane vertical/horizontal layout | Full day |
| Fri | Split Screen — divider resize, active pane focus, exit split. Polish | Full day |

**Deliverable:** Tab Islands, tab search, 2-pane split screen

### Week 3: Pinboards + Workspaces UI
**Goal:** Content curation + workspace organization

| Day | Task | Effort |
|-----|------|--------|
| Mon | Pinboards — data model, SQLite storage, API endpoints | Full day |
| Tue | Pinboards — Kanban UI (tandem://pinboards), card types (note, link, image) | Full day |
| Wed | Pinboards — context menu integration ("Save to Pinboard"), screenshot cards | Full day |
| Thu | Workspaces — data model, workspace strip UI, tab scoping, switching | Full day |
| Fri | Workspaces — "Move tab to workspace" context menu, Cmd+Tab scoping, persistence | Full day |

**Deliverable:** Pinboards (Kanban mode) + Visual Workspaces

### Week 4: Privacy Features + Polish
**Goal:** Close the privacy/performance gap

| Day | Task | Effort |
|-----|------|--------|
| Mon | Ad Blocker — integrate EasyList filter parsing, request-level blocking in NetworkShield | Full day |
| Tue | Ad Blocker — per-site exceptions, shield badge with blocked count in URL bar | Full day |
| Wed | Tab Snoozing — auto-suspend after configurable idle time, reactivate on click | Full day |
| Thu | Private Browsing Window — Cmd+Shift+N, ephemeral partition, auto-delete on close | Half day |
| Thu | Tracker Blocker — upgrade from detect to block in SecurityShield | Half day |
| Fri | Polish: Tab Traces, Duplicate Tab Highlighter, DNT header, restore-session-on-startup | Full day |

**Deliverable:** Consumer ad blocking, tab snoozing, private browsing, tracker blocking

### Total: ~20 features in 4 weeks

---

## What Tandem Has That Opera Doesn't

These are Tandem's unique advantages — capabilities Opera simply doesn't offer:

| Category | Tandem Feature | Opera Equivalent |
|----------|---------------|-----------------|
| **AI Wingman** | 6-layer AI wingman with MCP server, 25 tools, multi-backend (OpenClaw + Claude), dual mode, emergency stop, task approval workflow | Aria chatbot (single model, no tool use, no agent autonomy) |
| **Security Shield** | 6-layer defense: NetworkShield, OutboundGuard, ContentAnalyzer, BehaviorMonitor, GatekeeperAI, EvolutionEngine. YARA rules, AST fingerprinting, Shannon entropy, zero-day tracking | Basic ad blocker + phishing blacklist |
| **Stealth/Anti-Detection** | Canvas/WebGL/Audio/Font fingerprint protection. Electron concealment. OS-level click injection. Per-character human typing. Chrome API mocking. Full UA spoofing | None — Opera is fully detectable |
| **Behavioral Learning** | Learn user's typing rhythm, mouse curves, scroll patterns. Replay as humanized automation | None |
| **Agent Automation** | 195+ REST API endpoints. JavaScript execution with approval gates. Accessibility tree snapshots. Playwright-style locators. Headless browsing. Workflow engine | None — no programmatic control |
| **CLI** | 12 commands for terminal-based browser control (`tandem open`, `tandem click`, `tandem snapshot`) | None |
| **MCP Server** | Full Model Context Protocol integration — any MCP client can control the browser | None |
| **DevTools Bridge** | CDP endpoints for console, network, DOM, performance, storage access via API | Standard DevTools only (manual) |
| **Network Mocking** | Intercept and mock HTTP requests via CDP for testing | None |
| **Device Emulation** | Predefined device profiles (iPhone, iPad, Pixel) via API | None (some via DevTools) |
| **Drawing/Annotation** | 6 tools (arrow, rect, circle, free line, text, colors) with snap-for-wingman | Basic screenshot crop only |
| **Voice Input** | Speech-to-text with multi-language support, auto-send on silence | Aria has voice input, but less configurable |
| **ClaroNote** | Voice recording → transcription integration | None |
| **Site Memory** | Per-domain visit tracking, time spent, content change detection | Basic history only |
| **Scheduled Watches** | Monitor URLs for changes on schedule, alert on diff | None |
| **Form Memory** | Remember form inputs per domain | Basic autofill only |
| **Tab Source Marking** | Mark tabs as robin-owned vs wingman-owned | None |
| **Tab Lock Manager** | Exclusive agent access locks on tabs | None |
| **Content Extraction** | Smart page-to-markdown extraction | None |
| **X-Scout** | Dedicated X/Twitter intelligence agent | None |
| **Password Manager** | AES-256-GCM encrypted local vault, per-item salt/IV, zero cloud | Opera uses third-party sync |

**Bottom line:** Tandem is vastly more powerful than Opera for AI-augmented browsing, security, automation, and developer workflows. The gap is primarily in **consumer UX features** — sidebar messengers, tab organization polish, and lifestyle features that make a browser pleasant for daily use. Closing these gaps makes Tandem competitive as a daily driver while retaining its unique superpowers.

---

*Generated 2026-02-28 by Claude for Robin Waslander*
*Source: tandem-feature-inventory.md (380+ features) + opera-complete-inventory.md (68 features)*
