# Opera Browser — Complete Feature Inventory

> Compiled 2026-02-28 from help.opera.com and opera.com/features
> Purpose: Gap analysis reference for Tandem Browser

---

## 1. Tab Management

### 1.1 Tab Islands
**Category:** Tab Organization
**Description:** Automatically arranges tabs into separate, customizable groups by browsing context. Tabs opened from the same origin or session are visually connected into "islands" — color-coded clusters with named handles. Users can collapse islands to save space, drag tabs between islands, and use Shift+click to select and move multiple tabs simultaneously.
**UI Location:** Tab bar (top or browser). Colored handles appear above grouped tabs.
**Visual Design:** Each island has a distinct color tag and optional custom name. Collapsed islands occupy minimal space. Tooltip preview on hover shows grouped tab thumbnails. Visual connections (subtle lines/shading) between grouped tabs.
**Keyboard Shortcut:** Alt+T (new tab in current island)
**Technical Notes:** Auto-creates islands on new browsing sessions. Works alongside Workspaces. Supports multi-tab drag-and-drop operations. Configurable via Settings > Features > User Interface > "Automatically create tab islands."
**Tandem Relevance:** **HIGH** — Core tab organization paradigm. Tandem should evaluate whether island-style grouping fits its UX model.

### 1.2 Workspaces
**Category:** Tab Organization
**Description:** Higher-level tab organization that lets users create up to 5 named workspace "buckets" (e.g., Work, Shopping, Research, Planning). Each workspace has its own set or tabs and tab islands. Switching workspaces instantly shows only that workspace's tabs; Ctrl+Tab cycles only within the current workspace.
**UI Location:** Sidebar top — customizable workspace icons. Three-dot menu at sidebar bottom opens Sidebar setup panel.
**Visual Design:** Customizable icons and names per workspace. Clean single-click switching.
**Keyboard Shortcut:** Custom hotkeys configurable per workspace. Ctrl+Tab cycles within current workspace only.
**Technical Notes:** Workspace tabs are fully isolated — actions (reload all, duplicate highlighting) apply only within current workspace. Right-click tab > "Move tab to workspace" or right-click link > "Open link in workspace."
**Tandem Relevance:** **HIGH** — Workspace isolation is a powerful organizational concept for multi-context browsing.

### 1.3 Split Screen
**Category:** Tab Management / Productivity
**Description:** View 2–4 websites simultaneously within a single tab view. Supports vertical, horizontal, and grid layouts with resizable panes. All split tabs are accessible through one shared address bar.
**UI Location:** Drag a tab downward to initiate, or Shift+select two tabs > right-click > "Create Split Screen." Hover-based close buttons on each panel.
**Visual Design:** Vertically connected tabs with a vertical line separator. Three-dot menu in each frame. Toolbar organizes icons by function — browser-wide icons on right tab toolbar, tab-specific icons appear on hover.
**Keyboard Shortcut:** Shift+click to select multiple tabs for split.
**Technical Notes:** Integrates with Tab Islands. Each panel maintains independent navigation. "Disconnect from Split Screen" via right-click removes a single page.
**Tandem Relevance:** **HIGH** — Multi-pane browsing is a core differentiator for power users.

### 1.4 Tab Emojis
**Category:** Tab Personalization
**Description:** Assign emoji icons to individual tabs for visual identification. Hover over any tab to reveal an emoji selector; click "+" to access the full emoji suite.
**UI Location:** Tab hover tooltip area. Settings > Features > User Interface > "Show emojis in tab tooltip."
**Visual Design:** Emoji appears as a badge on the tab. Interactive popup selector on hover.
**Keyboard Shortcut:** None.
**Technical Notes:** Persists across sessions. Can add/remove freely.
**Tandem Relevance:** **MEDIUM** — Fun personalization feature, low implementation effort.

### 1.5 Tab Traces
**Category:** Tab Visual Feedback
**Description:** Subtly highlights recently used tabs with brightness correlating to recency — most recently visited tabs glow brighter. Helps users identify which tabs they've been actively using.
**UI Location:** Tab strip. Settings > Features > User Interface > "Show traces on most recently used tabs."
**Visual Design:** Highlight brightness correlates with usage recency. Activates automatically with 8+ open tabs.
**Keyboard Shortcut:** None.
**Technical Notes:** Customizable activation threshold (minimum number or tabs before traces appear).
**Tandem Relevance:** **MEDIUM** — Subtle but useful visual cue for heavy tab users.

### 1.6 Search in Tabs
**Category:** Tab Navigation
**Description:** Real-time keyword search across all open tabs by title and URL. Results update dynamically with the most relevant tab on top. Also shows recently closed tabs for quick restoration.
**UI Location:** Magnifying glass icon to the right or the tab bar. Keyboard shortcut Ctrl+Space.
**Visual Design:** Dropdown list with site favicons, page titles, and web addresses. Clear visual hierarchy.
**Keyboard Shortcut:** Ctrl+Space
**Technical Notes:** Arrow keys navigate results, Enter selects. Searches both titles and URLs.
**Tandem Relevance:** **HIGH** — Essential for power users with many tabs open.

### 1.7 Visual Tab Cycler
**Category:** Tab Navigation
**Description:** Thumbnail preview popup for cycling through open tabs. Shows visual previews rather than just text titles.
**UI Location:** Popup overlay triggered by keyboard shortcut.
**Visual Design:** Thumbnail grid/list or open tab previews.
**Keyboard Shortcut:** Hold Ctrl, then press Tab repeatedly to cycle; release Ctrl to switch to selected tab.
**Technical Notes:** Requires Settings > Advanced > Browser > "Show tab previews" to be enabled.
**Tandem Relevance:** **MEDIUM** — Nice-to-have visual tab switching.

### 1.8 Tab Preview on Hover
**Category:** Tab Navigation
**Description:** Hovering over a tab shows a thumbnail preview or the page content.
**UI Location:** Tab bar hover tooltip.
**Visual Design:** Thumbnail preview popup.
**Technical Notes:** Enable via Settings > Advanced > Browser > "Show tab previews."
**Tandem Relevance:** **MEDIUM** — Common browser feature, useful UX enhancement.

### 1.9 Pin Tabs
**Category:** Tab Management
**Description:** Pinned tabs move to the left side or the tab bar, show only the favicon (no title), and persist after browser restart. Prevents accidental closure.
**UI Location:** Right-click tab > "Pin Tab" / "Unpin Tab."
**Visual Design:** Compact favicon-only display, pinned to the left.
**Keyboard Shortcut:** None.
**Tandem Relevance:** **HIGH** — Standard browser feature, should be implemented.

### 1.10 Tab Snoozing
**Category:** Tab Performance
**Description:** Inactive tabs are automatically paused ("snoozed") to free memory. Tabs reactivate on click.
**UI Location:** Settings > User Interface.
**Visual Design:** Inactive tab state (no strong visual indicator described).
**Keyboard Shortcut:** None.
**Technical Notes:** Enabled by default. Toggleable.
**Tandem Relevance:** **HIGH** — Memory management is critical for multi-tab browsers.

### 1.11 Duplicate Tabs Highlighter
**Category:** Tab Management
**Description:** Identifies and highlights duplicate tabs on hover. Bulk closure or all duplicates via right-click context menu.
**UI Location:** Tab hover + right-click > "Close duplicate tabs."
**Visual Design:** Hover-activated highlighting or duplicate tabs.
**Tandem Relevance:** **MEDIUM** — Useful cleanup utility.

### 1.12 Close Tab Variations
**Category:** Tab Management
**Description:** Multiple tab closure options: close single tab (x button), close other tabs, close tabs to the right, close duplicate tabs, reopen last closed tab.
**UI Location:** Right-click context menu on tab.
**Tandem Relevance:** **HIGH** — Standard but important tab management options.

### 1.13 Save Tabs as Speed Dial Folder
**Category:** Tab Management
**Description:** Batch-save all open tabs or a selection or tabs as a Speed Dial folder for later access.
**UI Location:** Right-click tab bar > "Save all tabs as Speed Dial folder" or Ctrl+click multiple tabs > right-click > "Save tabs as Speed Dial folder."
**Tandem Relevance:** **MEDIUM** — Session-saving concept is valuable.

---

## 2. Sidebar

### 2.1 Sidebar Layout & Customization
**Category:** Browser Chrome / UI
**Description:** Left-side panel providing quick access to Workspaces, Messengers, Speed Dials, Flow, bookmarks, personal news, tabs, history, extensions, downloads, and settings. Fully customizable — users can add, remove, reorder, pin, and hide individual panels.
**UI Location:** Left side or browser window. Show/hide via Easy Setup > "Show sidebar." Customize via three-dot icon at sidebar bottom or Settings > Sidebar > Manage sidebar.
**Visual Design:** Narrow mode toggle available. Notification badges on messenger icons. Pinnable panels. Clean, icon-based navigation.
**Keyboard Shortcut:** None dedicated (individual panels may have shortcuts).
**Technical Notes:** Sidebar elements include: Workspaces, Facebook Messenger (SKIP), WhatsApp, Telegram, VK (SKIP), Instagram, Discord, Slack, X/Twitter, Spotify, My Flow, Speed Dial, Bookmarks, Personal News, Tabs, History, Downloads, Extensions, Settings.
**Tandem Relevance:** **HIGH** — Sidebar is a defining Opera UX pattern. Tandem should consider sidebar architecture.

### 2.2 Sidebar Panels — Messenger/App Integration
**Category:** Sidebar
**Description:** Each integrated app (WhatsApp, Discord, Slack, Instagram, X, Spotify) opens as a sidebar panel — essentially a narrow webview pinned to the left side. Users can pin/unpin, mute notifications, and log in/out independently.
**UI Location:** Sidebar icons, each opening a panel overlay.
**Visual Design:** Panel width adjustable. Three-dot menu per panel for mute/hide/logout. Notification badges.
**Tandem Relevance:** **HIGH** — Sidebar webview panels are a core Opera differentiator.

---

## 3. Integrated Messengers & Apps

### 3.1 WhatsApp
**Category:** Integrated Messenger
**Description:** Full WhatsApp Web experience in a sidebar panel. Send/receive text, voice messages, photos, videos, documents. Group chat support. Message status indicators (gray/blue checks). QR code pairing with phone. Desktop notifications. Message formatting (bold, italic). Reply threading. Delete for both parties.
**UI Location:** Sidebar icon. Click to open/hide. Pin icon for split-screen use.
**Visual Design:** Contact list, chat threads, input box at bottom, paper clip for attachments, microphone for voice, three-dot menu.
**Keyboard Shortcut:** None.
**Technical Notes:** Syncs with mobile WhatsApp via QR code authentication. No separate app needed.
**Tandem Relevance:** **HIGH** — WhatsApp is the most popular messenger globally.

### 3.2 Discord
**Category:** Integrated Messenger
**Description:** Full Discord access in sidebar panel. Access all servers, channels, DMs. No separate app download required.
**UI Location:** Sidebar icon. Pin/unpin toggles.
**Visual Design:** Standard Discord web interface adapted to sidebar width.
**Technical Notes:** Standard Discord login. No additional software required.
**Tandem Relevance:** **HIGH** — Discord is essential for gaming/dev/community audiences.

### 3.3 Slack
**Category:** Integrated Messenger
**Description:** Full Slack workspace access in sidebar panel. Access channels, DMs, threads. Pin/unpin conversations.
**UI Location:** Sidebar icon.
**Visual Design:** Collapsible conversation views, quick-access messaging.
**Technical Notes:** Standard Slack login. Works alongside other sidebar messengers.
**Tandem Relevance:** **HIGH** — Slack is essential for professional/team users.

### 3.4 Instagram
**Category:** Integrated Social Media
**Description:** Full Instagram experience in sidebar — browse feed, watch stories, direct message, post photos (upload or drag-and-drop), explore content, like/comment. Desktop-optimized.
**UI Location:** Sidebar icon. Profile button, Messages icon (paper airplane), Post creation (+) icon, Settings gear.
**Visual Design:** Mobile-style design adapted for desktop sidebar width.
**Technical Notes:** Standard Instagram login. Full posting capability from desktop.
**Tandem Relevance:** **MEDIUM** — Social media integration is a differentiator but not core to browser function.

### 3.5 X (Twitter)
**Category:** Integrated Social Media
**Description:** Full X/Twitter experience in sidebar panel — post/tweet, explore trends, DMs, notifications, lists, bookmarks, communities, profile. Full feature parity with web app.
**UI Location:** Sidebar icon. Pin option for always-visible access.
**Visual Design:** Full image/GIF/video rendering. Desktop navigation optimized for efficient context switching.
**Technical Notes:** Standard X login. No separate extension needed.
**Tandem Relevance:** **MEDIUM** — Social media integration.

### 3.6 Spotify (Music Player)
**Category:** Integrated Media / Music
**Description:** Spotify streaming directly in sidebar via Opera's Music Player. Play, pause, skip controls. Detachable floating controller. Automatic mute when webpages play audio, auto-resume when done. "Sonic" music-reactive theme syncs browser visuals to playback.
**UI Location:** Sidebar Music Player icon. Detachable — can be moved anywhere, even outside browser or into toolbar.
**Visual Design:** Modular, detachable player. Floating controller. Sonic theme provides reactive visuals ("soft, muted shades to vibrant acids").
**Technical Notes:** Supports Spotify, Apple Music, YouTube Music, Deezer. Auto-pauses during calls/video. Cross-device sync via Opera Sync.
**Tandem Relevance:** **MEDIUM** — Music integration is a lifestyle feature; nice differentiator.

### 3.7 Telegram
**Category:** Integrated Messenger
**Description:** Telegram messaging accessible from sidebar panel. (Referenced in help pages as an available sidebar messenger.)
**UI Location:** Sidebar icon.
**Tandem Relevance:** **MEDIUM** — Popular in certain regions.

### 3.8 Facebook Messenger — **SKIP**
### 3.9 VKontakte — **SKIP**

---

## 4. AI Features

### 4.1 Opera AI (Aria)
**Category:** AI Assistant
**Description:** Built-in AI assistant that understands webpage context. Powered dynamically by Google and OpenAI models. Free, no account required. Capabilities include:
- **Contextual intelligence:** Analyzes active webpage or entire Tab Island collection. Summarizes pages, researches multiple topics, compares products.
- **Image generation:** Creates high-quality visuals from text prompts. Custom wallpapers matching device dimensions. 5 images/day (no account), 100/day (signed in).
- **File & image analysis:** Upload photos, screenshots, documents for interpretation. Extracts info from slides, contracts. Recognizes locations/objects.
- **YouTube integration:** Leverages video transcriptions for summaries and translations without pausing playback.
- **Voice capabilities:** Voice-to-text prompts, text-to-speech responses in multiple languages, hands-free interaction.
- **Web interaction:** Highlight text to trigger "Explore more" or "Translate" options. Inline explanations without tab switching. Hyperlinked keywords and source citations.
- **Math/equations:** Solves math problems, converts text to formatted equations.
- **Live web access:** Provides current information with source links.

**UI Location:** "Ask AI" button in top-right toolbar. Also accessible via sidebar. Ctrl+O (Windows) / Cmd+O (Mac).
**Visual Design:** Right-side panel. "+" button next to chat input for image generation. Smiley face icon for feedback.
**Keyboard Shortcut:** Ctrl+O / Cmd+O
**Technical Notes:** Toggle page context access on/off within chat. Disable entirely via Settings (Alt+P) > Opera AI toggle. Dynamically selects between Google and OpenAI models based on task.
**Tandem Relevance:** **HIGH** — AI assistant integration is a major competitive feature. Tandem should evaluate AI integration strategy.

---

## 5. Privacy & Security

### 5.1 Built-in Ad Blocker
**Category:** Privacy / Performance
**Description:** Blocks ads at the request level before content renders (not post-load hiding). Blocks YouTube ads, video ads, popups. Includes NoCoin cryptocurrency mining protection. Pages load "up to 90% faster" compared to extension-based blockers. Per-site exception lists.
**UI Location:** Shield icon next to address bar. Toggle via Settings > Privacy protection > "Block ads" or Easy Setup menu. Alt+P to access settings.
**Visual Design:** Blue shield badge in address bar showing blocked count. "Turn off for this site" button.
**Keyboard Shortcut:** Alt+P (settings access).
**Technical Notes:** Uses filter lists (EasyList default + NoCoin). Auto-updates. Operates at network request level.
**Tandem Relevance:** **HIGH** — Ad blocking is table stakes for modern browsers.

### 5.2 Tracker Blocker
**Category:** Privacy
**Description:** Blocks online tracking from analytics scripts, tracking pixels, and other data collection methods. Displays count or blocked trackers.
**UI Location:** Ad Blocker popup window toggle. Blue shield badge in address bar. Settings > Basic > Privacy protection.
**Visual Design:** Badge displays blocked tracker count alongside ad count.
**Technical Notes:** Manages exception and blocklist preferences. Works alongside ad blocker.
**Tandem Relevance:** **HIGH** — Tracker blocking is essential for privacy-focused browsers.

### 5.3 Free VPN
**Category:** Privacy / Security
**Description:** Built-in browser VPN — encrypts traffic, masks IP address, changes apparent location. Free, unlimited data, no login required, no-log policy (Deloitte-audited). AES-256 encryption. DNS leak protection. 100+ servers across 3 virtual regions.
**UI Location:** VPN badge on left side or address bar. Click to open control panel with on/off toggle, data transfer stats, current location, virtual IP.
**Visual Design:** Badge with VPN status. Clean control panel showing real-time stats and location toggles.
**Keyboard Shortcut:** None.
**Technical Notes:** Browser-only protection (not device-wide; VPN Pro is paid upgrade for device-wide). Unlimited bandwidth. "Bypass VPN for default search engines" option. 3 general regions (free) vs 48 locations (Pro).
**Tandem Relevance:** **HIGH** — VPN is a major Opera differentiator. Significant technical undertaking to implement.

### 5.4 Paste Protection
**Category:** Security
**Description:** Monitors clipboard for 2 minutes after copying sensitive data (IBANs, credit card numbers). Warns if an external app modifies clipboard data. Displays notification upon paste.
**UI Location:** Paste Protection icon appears in address bar right side after copying sensitive data.
**Visual Design:** Icon with notification upon sensitive data copy. Warning display if clipboard tampered with.
**Technical Notes:** 2-minute monitoring window or until paste occurs.
**Tandem Relevance:** **MEDIUM** — Nice security feature but niche use case.

### 5.5 Private Browsing Window
**Category:** Privacy
**Description:** Browsing mode that deletes all activity data (history, cache, cookies) upon closing all private windows. AI features unavailable in private mode.
**UI Location:** Menu > New Private Window. File > New Private Window (Mac).
**Keyboard Shortcut:** Ctrl+Shift+N (Mac: Cmd+Shift+N).
**Technical Notes:** Manually saved items (passwords, downloads, Speed Dial entries) persist. AI features disabled.
**Tandem Relevance:** **HIGH** — Standard browser feature, must have.

### 5.6 Security Badges
**Category:** Security
**Description:** Visual indicators in address bar showing connection status and active features/permissions. Lock icon = secure HTTPS. Other badges for: compressed connection, ads blocked, camera/mic/location access, extensions, fraud/malware warnings, MIDI access, VPN status.
**UI Location:** Combined address bar (right side for most badges).
**Visual Design:** Icon-based badge system.
**Tandem Relevance:** **HIGH** — Security indicators are essential browser UX.

### 5.7 Phishing & Malware Protection
**Category:** Security
**Description:** Checks pages against blacklists or known phishing and malware sites. Warning page displays if site is blacklisted. Enabled by default, no loading delay.
**UI Location:** Warning page interstitial.
**Tandem Relevance:** **HIGH** — Essential security feature.

### 5.8 Do Not Track (DNT)
**Category:** Privacy
**Description:** Sends DNT header with every request. Voluntary compliance by websites.
**UI Location:** Settings > Advanced > Privacy & security > Cookies and other site data.
**Tandem Relevance:** **LOW** — Largely ineffective standard, but trivial to implement.

### 5.9 Security Certificates Management
**Category:** Security
**Description:** Display and verify HTTPS/TLS certificates. Manage public and local certificate issuers. EV certificate details. Warnings for local issuer certificates.
**UI Location:** Click security badge for certificate details. Settings > Advanced > Privacy & security > Manage certificates.
**Tandem Relevance:** **MEDIUM** — Standard Chromium feature.

### 5.10 Clear Data on Exit
**Category:** Privacy
**Description:** Automated deletion or specified data categories every time Opera closes. Configurable per data type.
**UI Location:** Settings > Privacy and Security > Delete browsing data > "On exit" section.
**Tandem Relevance:** **MEDIUM** — Useful privacy option.

### 5.11 Delete Browsing Data
**Category:** Privacy
**Description:** Manual clearing with granular control over data types (history, downloads, news usage, cookies, cache, passwords, autofill, site settings, hosted app data) and time ranges.
**UI Location:** Settings > Privacy & security > Delete browsing data.
**Tandem Relevance:** **HIGH** — Standard browser feature.

---

## 6. Media

### 6.1 Video Popout (Picture-in-Picture)
**Category:** Media / Productivity
**Description:** Detach online videos into floating, always-on-top windows that persist above other applications. Resizable, draggable. Works with YouTube, Netflix, Twitch, football streaming, video conferencing (Google Meet, Zoom). Player controls at window bottom. Closing popout doesn't stop playback. Supports second screen.
**UI Location:** Button appears at top-center when hovering over video players. Settings > Features > Video pop out.
**Visual Design:** Floating window with adjustable size. Always-on-top. Original video quality maintained. Controls at bottom.
**Keyboard Shortcut:** None.
**Technical Notes:** Works with major video platforms and conferencing services. Closing popout returns to original tab.
**Tandem Relevance:** **HIGH** — Picture-in-picture is a highly valued feature for multitasking.

### 6.2 Video Skip
**Category:** Media
**Description:** Jump to end or video with a single click. Button appears on hover over video player (two arrows icon).
**UI Location:** Video player hover menu. Settings > Advanced > Features.
**Visual Design:** Button with two arrows icon appears on hover.
**Technical Notes:** Works on supported sites. May bypass ad requirements on some sites. Auto-continues or pauses depending on site.
**Tandem Relevance:** **LOW** — Niche feature.

### 6.3 Music Player
**Category:** Media / Lifestyle
**Description:** Integrated sidebar player for streaming from Spotify, Apple Music, YouTube Music, Deezer. Detachable modular interface — can pin to toolbar or float anywhere. Automatic pause when other media plays, resume when done. Playlist creation support. Playback timer.
**UI Location:** Sidebar icon. Three-dot menu > Player. Settings > Features > Player. Detachable to toolbar or floating.
**Visual Design:** Modular, detachable window. Dropdown for service selection. Floating controller.
**Keyboard Shortcut:** None.
**Technical Notes:** "Automatically pause playback when other media start playing" toggle. Cross-device sync.
**Tandem Relevance:** **MEDIUM** — Lifestyle differentiator.

---

## 7. Productivity

### 7.1 Snapshot (Screenshot + Annotations)
**Category:** Productivity / Tools
**Description:** Built-in screenshot tool with editing capabilities. Capture options: partial (drag selection), full screen, or save page as PDF. 8 editing tools: arrow, pencil/drawing, blur, highlight, text insertion, selfie camera overlay, sticker application, emoji annotations. Output: copy to clipboard, save as PNG, export as PDF.
**UI Location:** Camera icon to the right or address bar. Keyboard shortcut activation.
**Keyboard Shortcut:** Ctrl+Shift+5 (Windows/Linux) / Cmd+Shift+2 (Mac)
**Visual Design:** Crop frame adjustment tool. Editing toolbar with 8 tools. Full-page PDF export option.
**Technical Notes:** Saves as .png. "Copy and Close" pastes directly to clipboard. Compatible with integrated messengers for direct sharing. PDF export for full-page capture.
**Tandem Relevance:** **HIGH** — Screenshot with annotation is a frequently requested browser feature.

### 7.2 Easy Files
**Category:** Productivity / File Management
**Description:** Enhances file upload dialogs by showing recently downloaded files and clipboard content as visual thumbnails. No folder navigation required — one-click file selection. Multi-file selection support via Settings toggle.
**UI Location:** Appears during file upload/attachment dialogs. Settings > Features > Easy Files.
**Visual Design:** Thumbnail-based file display. Clipboard visibility. Downloads folder access.
**Technical Notes:** Auto-prioritizes recently used files. Multi-file toggle in settings.
**Tandem Relevance:** **MEDIUM** — Nice UX enhancement for file uploads.

### 7.3 Currency Converter
**Category:** Productivity / Tools
**Description:** Automatically converts highlighted monetary values to preferred currency via search popup. Supports 40+ currencies including symbols ($, €, ¥, £, etc.) and 4 cryptocurrencies (BTC, BCH, ETH, LTC). Uses ECB or NBU reference rates.
**UI Location:** Search popup (appears on text selection). Settings > Advanced > Features > Search pop-up.
**Visual Design:** Copy button revealed on hover over converted value.
**Keyboard Shortcut:** None (triggered by text selection).
**Tandem Relevance:** **MEDIUM** — Useful for international users.

### 7.4 Unit Converter
**Category:** Productivity / Tools
**Description:** Converts imperial/metric measurements and temperature scales on text selection. Supports 15 unit conversion pairs (lb⇄kg, °F⇄°C, mph⇄km/h, ft⇄m, in⇄cm, mi⇄km, oz⇄g, gal⇄L, etc.).
**UI Location:** Search popup tool. Settings > Advanced > Features > Search pop-up.
**Visual Design:** Copy button on hover.
**Keyword:** Requires unit symbol highlighted with number.
**Tandem Relevance:** **MEDIUM** — Useful utility.

### 7.5 Time Zone Converter
**Category:** Productivity / Tools
**Description:** Converts highlighted timezone abbreviations to user's local time. Supports 18 timezone abbreviations. Processes dates if included.
**UI Location:** Search popup. Settings > Advanced > Features > Search pop-up.
**Visual Design:** Copy button on hover.
**Technical Notes:** Uses system location at Opera installation time.
**Tandem Relevance:** **MEDIUM** — Useful for remote/distributed teams.

### 7.6 Search Popup (Highlight Actions)
**Category:** Productivity / Tools
**Description:** Utility that appears when highlighting text on any webpage. Offers: search with default engine, copy to clipboard, share (Mac only), and automatic conversion display for currencies/units/timezones. Single-click opens search in new tab.
**UI Location:** Appears above highlighted text. Settings > Advanced > Features > "Enable the search pop-up when selecting text."
**Visual Design:** Small popup above selected text.
**Tandem Relevance:** **MEDIUM** — Nice productivity enhancer.

### 7.7 Opera Translate
**Category:** Productivity / Tools
**Description:** Instant webpage translation powered by Lingvanex AI. Supports 47 languages. Automatic language detection. Per-site and per-language exclusions. No censorship restrictions. Server-side processing.
**UI Location:** Globe icon on address bar when non-default language detected. Settings > Features > Opera Translate.
**Visual Design:** Globe icon indicates available translations. Popup for language selection.
**Technical Notes:** Powered by Lingvanex AI. Server-side processing maintains browsing privacy.
**Tandem Relevance:** **MEDIUM** — Translation is valuable but can be handled by extensions.

### 7.8 Find on Page
**Category:** Productivity
**Description:** Search text on current page. Found words highlighted green, multiple instances highlighted yellow with count. Arrow navigation between matches.
**UI Location:** Popup search bar.
**Keyboard Shortcut:** Ctrl+F / Cmd+F
**Tandem Relevance:** **HIGH** — Standard browser feature.

### 7.9 Better Address Bar Experience (BABE)
**Category:** Productivity / Navigation
**Description:** Pop-out panel when clicking the address bar showing quick access to frequently visited sites, Speed Dials, recommendations, and bookmarks. Layout size toggle. Item-specific dismissal. Recommendations develop with browsing history.
**UI Location:** Address bar click. Settings > Advanced > Features > "Enhanced address bar."
**Visual Design:** Pop-out panel with site cards. Layout size toggle icons (top-right). Three-dot menu per item.
**Tandem Relevance:** **MEDIUM** — Enhanced address bar suggestions are useful.

---

## 8. Start Page

### 8.1 Speed Dial
**Category:** Start Page
**Description:** Visual grid or thumbnail entries linking to most visited sites or custom pages. Add entries via "+" button. Edit, rearrange (drag-and-drop), remove, create folders (drag one entry onto another). Folder management with editable titles.
**UI Location:** Main area or start page. Grid layout or clickable thumbnails.
**Visual Design:** Grid layout with thumbnail previews. Expandable folder interface.
**Keyboard Shortcut:** None.
**Tandem Relevance:** **HIGH** — Start page with quick access tiles is a core browser feature.

### 8.2 Personal News on Start Page
**Category:** Start Page / Content
**Description:** Popular news articles displayed below Speed Dial. Category and region/language filtering. Multi-language support. Clickable articles open in new tabs.
**UI Location:** Start page below Speed Dial. Settings > Advanced > Features > Personal news > "Show news on start page."
**Visual Design:** News cards/dials. Topic selection tabs. Language/region cogwheel.
**Tandem Relevance:** **LOW** — Content aggregation is tangential to Tandem's core focus.

### 8.3 Easy Setup Panel
**Category:** Start Page / Customization
**Description:** Quick access panel for managing Opera's most prominent features. Change themes/wallpapers, pin sidebar, show bookmarks bar, toggle ad blocker, change download locations, clear browsing data, access full settings.
**UI Location:** Top-right corner or start page.
**Visual Design:** Panel interface with toggle buttons and configuration options.
**Tandem Relevance:** **MEDIUM** — Quick-setup onboarding panel concept is useful.

### 8.4 Continue Shopping / Continue on Booking
**Category:** Start Page / Commerce
**Description:** Shows recently/frequently viewed products from Amazon, AliExpress, Otto or Booking.com hotels on the start page after viewing 3+ items. Browser-local processing — no server transmission.
**UI Location:** Start page sections. Fold/expand arrow. X button for dismissal.
**Visual Design:** Product/hotel cards with dismiss options.
**Technical Notes:** Browser-local processing only. Requires 3+ item views to trigger.
**Tandem Relevance:** **LOW** — Commerce-focused feature.

---

## 9. Customization

### 9.1 Dynamic Themes System
**Category:** Customization / Visual
**Description:** Advanced theming system going beyond light/dark. Includes animated wallpapers, UI color schemes, sound effects. Multiple theme presets:
- **Classic:** Customizable colors (cool-to-warm, calm-to-vibrant scales), custom wallpapers, light/dark/system mode.
- **Aurora:** Dark mode only, two color options (Borealis: red/pink/purple, Australis: blue/green), animated wallpaper with intensity adjustment.
- **Midsommar:** Light mode only, pastel-to-saturated color adjustment, optional keyboard sounds, browser sounds, and background music.
- **Metamorphic:** CG art collaboration, smooth shifting visuals, light/dark modes, browser sounds and music.
- **Ethereal:** Artistic fjord scene, light mode, piano music.
- **Calma & Sossego:** Brazilian-inspired, Bossa Nova music.
- **Twilight:** Dark animated theme, polar nights inspired, minimal distraction.

**UI Location:** Easy Setup > Theme Gallery. Settings > Customization.
**Keyboard Shortcut:** Alt+Shift+T (Windows) / Option+Shift+T (Mac) to cycle between last 10 saved themes.
**Technical Notes:** Browser remembers last 10 configured themes. Last 3 visible in Easy Setup. Audio has 3 categories: browser sounds, keyboard sounds, background music. Themes sync via Opera Sync.
**Tandem Relevance:** **MEDIUM** — Themes are a nice differentiator. Animated/audio themes are unique but heavy to implement.

### 9.2 Wallpapers
**Category:** Customization / Visual
**Description:** Start page and Opera internal pages wallpaper customization. Right-click any web image > "Use Image as Wallpaper." Upload from computer. Browse community designs at addons.opera.com.
**UI Location:** Settings > Customization > Wallpapers. Right-click context menu on images.
**Tandem Relevance:** **LOW** — Cosmetic feature.

### 9.3 Extensions (Chrome Extension Support)
**Category:** Customization / Functionality
**Description:** Opera supports its own extensions plus Chrome extensions (via "Install Chrome extensions" addon from Opera addons store). Management via Extensions page with enable/disable and settings.
**UI Location:** Extensions icon (cube) in sidebar. Menu > Extensions > Extensions.
**Keyboard Shortcut:** Ctrl+Shift+E / Cmd+Shift+E
**Technical Notes:** Chrome Web Store compatibility via addon. Performance impact warning for extensions.
**Tandem Relevance:** **HIGH** — Chrome extension compatibility is critical for any Chromium-based browser.

### 9.4 Language Customization
**Category:** Customization
**Description:** Change browser UI language. Windows/Linux: Settings > Advanced > Browser > Languages. Mac: System Preferences > Language and Region.
**UI Location:** Settings > Advanced > Browser > Languages.
**Tandem Relevance:** **LOW** — Standard i18n.

### 9.5 Import Bookmarks and Settings
**Category:** Customization / Migration
**Description:** Import browsing data (history, bookmarks, cookies) from Chrome, Firefox, Safari, Yandex, or HTML bookmark files.
**UI Location:** Settings > Synchronization > Import bookmarks and settings.
**Tandem Relevance:** **HIGH** — Browser migration/import is essential for user adoption.

### 9.6 Startup Preferences
**Category:** Customization
**Description:** Three options: fresh start page, retain previous session tabs, open specific page(s).
**UI Location:** Settings > Basic > On startup.
**Tandem Relevance:** **HIGH** — Standard browser feature, must have.

---

## 10. Sync & Cross-Device

### 10.1 Opera Sync
**Category:** Sync / Cross-Device
**Description:** Syncs bookmarks, Speed Dial, open tabs, browsing history, and passwords across devices. Selective sync — choose which data types to sync. Passwords encrypted with Opera credentials or custom passphrase.
**UI Location:** Settings > Synchronization. Account button in toolbar (green checkmark when synced).
**Visual Design:** Green checkmark indicates active sync.
**Keyboard Shortcut:** None.
**Technical Notes:** Anonymous identification tokens on Opera servers. Encrypted password storage. Selective sync per data type. Sign out to desync device.
**Tandem Relevance:** **HIGH** — Cross-device sync is essential for modern browsers.

### 10.2 My Flow
**Category:** Sync / Cross-Device / Sharing
**Description:** Encrypted content-sharing space between Opera on desktop, Android, and iOS. Share links, YouTube videos, images, notes, and files (up to 10MB, auto-delete after 24–48 hours). QR code pairing — no login required. Drag-and-drop file upload. Media playback within Flow. Emergency reset function.
**UI Location:** My Flow icon in sidebar. Easy Setup menu. opera://myflow. Share icon to right or address bar for one-click sharing.
**Visual Design:** QR code for device pairing. Notification badge. Device timestamp display. Preview images for shared content.
**Keyboard Shortcut:** None.
**Technical Notes:** End-to-end encryption. No cloud storage consumed. 24-hour auto-delete for files. Supports text highlighting > "Send to My Flow."
**Tandem Relevance:** **HIGH** — Cross-device sharing without accounts is a compelling feature. QR-code pairing is elegant UX.

---

## 11. Pinboards (Deep-Dive)

### 11.1 Pinboards
**Category:** Productivity / Collaboration / Content Curation
**Description:** Virtual magnetic boards / sticky-note spaces for collecting and sharing web content. Supports text, links, images, YouTube video embeds, screenshots, notes, music files, and documents. Kanban board mode available ("To Do / In Progress / Done" columns). Rich emoji reactions. Shareable via link — no login required for viewers.

**Full Capabilities:**
- **Content types:** Images, screenshots, links, music files, notes/text annotations, documents, embedded YouTube videos.
- **Organization:** Drag-and-drop arrangement. Kanban board layout for task management. Custom collections (travel, shopping, design, vision boards).
- **Collaboration:** Share via link (copies to clipboard). No login required for shared boards. Emoji reactions from viewers.
- **Cross-device:** Viewable across devices via Opera Sync.
- **Access:** Right-click context menu for saving content to pinboards.

**UI Location:** Left sidebar icon. Also accessible at opera://pinboards. "New pinboard" button in upper left.
**Visual Design:** Card-based layout. Rich emoji reaction system. Kanban columns. Share button.
**Keyboard Shortcut:** None documented.
**Technical Notes:** No login required for viewing shared boards. Cross-device via sync. Supports embedded YouTube playback.
**Tandem Relevance:** **HIGH** — Pinboards represent a unique content-curation/collaboration concept. The Kanban mode, emoji reactions, and no-login sharing are particularly compelling. Could serve as inspiration for Tandem's note/collection features.

---

## 12. Commerce

### 12.1 Opera Cashback
**Category:** Commerce / Shopping
**Description:** Automatically collect cashback while shopping at 400+ retailers (MediaMarkt, AliExpress, Shein, etc.). Browser notifies when cashback is available. Withdraw money automatically or on demand. 50% boost via Opera Points program. Exclusive deals with 2–3x cashback.
**UI Location:** Integrated into browser; notifications during shopping.
**Visual Design:** Promotional notifications during shopping sessions.
**Technical Notes:** Opera Points integration for bonus rates.
**Tandem Relevance:** **SKIP** — Commerce/cashback is not aligned with Tandem's focus.

### 12.2 Continue Shopping / Continue on Booking
**Category:** Commerce
**Description:** (See Section 8.4 above.)
**Tandem Relevance:** **SKIP** — Commerce feature.

### 12.3 Crypto Wallet
**Category:** Commerce / Crypto
**Description:** Referenced in Opera's ecosystem but not a current prominent desktop feature page. Opera historically had a built-in crypto wallet for Ethereum-based tokens.
**Tandem Relevance:** **SKIP** — Crypto wallet is out or scope.

---

## 13. Performance

### 13.1 Battery Saver
**Category:** Performance / Power Management
**Description:** Extends laptop battery life by reducing background activity: pauses unused plugins, stops background animations, tweaks video playback parameters, reschedules JavaScript timers, reduces background tab activity. Browse "up to an hour longer." Automatic activation when unplugged. Low battery reminder at 20%.
**UI Location:** Battery Saver icon appears to right or address bar when laptop unplugged. Settings (Alt+P) > Advanced > Features > Battery Saver.
**Visual Design:** Icon with on/off switch and time remaining estimate.
**Keyboard Shortcut:** None.
**Technical Notes:** Automatic or manual activation. Toggleable display or Battery Saver icon.
**Tandem Relevance:** **MEDIUM** — Useful for Electron-based apps which tend to be power-hungry.

### 13.2 Tab Snoozing
**Category:** Performance
**Description:** (See Section 1.10 above.) Automatically pauses inactive tabs to free memory.
**Tandem Relevance:** **HIGH** — Memory management is critical.

---

## 14. Bookmarks

### 14.1 Bookmarks Manager
**Category:** Bookmarks / Organization
**Description:** Full bookmark management with multiple view modes (large thumbnails, small thumbnails, list view). Folder and subfolder hierarchy with tree-view structure. Drag-and-drop organization. Search/filter by name across all folders. Import/export HTML format. Trash bin with undo for deleted items. Customizable bookmark images (page preview, solid color + title, or logo).
**UI Location:** Sidebar heart icon. Bookmarks bar (top). Opera Menu > Bookmarks. Settings.
**Visual Design:** Grid or condensed list view toggle. Thumbnail previews with customization options (page preview, color + title, logo).
**Keyboard Shortcut:** None dedicated.
**Technical Notes:** Import/export HTML format. Nested folders. Cross-device sync via Opera Account.
**Tandem Relevance:** **HIGH** — Bookmarks management is a standard browser necessity.

### 14.2 Bookmarks Bar
**Category:** Bookmarks / Quick Access
**Description:** Persistent bar below address bar for frequently accessed bookmarks. Toggleable via Easy Setup panel.
**UI Location:** Below address bar. Toggle via Easy Setup > "Show bookmarks bar."
**Tandem Relevance:** **HIGH** — Standard browser feature.

---

## 15. Navigation & Core Browser

### 15.1 Navigation Buttons
**Category:** Core Browser
**Description:** Back, Forward, Reload, Start Page (Speed Dial) buttons. Click-and-hold back/forward reveals tab browsing history dropdown.
**UI Location:** Left side or address bar.
**Tandem Relevance:** **HIGH** — Fundamental browser navigation.

### 15.2 Combined Address & Search Bar
**Category:** Core Browser
**Description:** Unified input for URLs and search queries. Predictive search suggestions. Alternative search engine tabs in suggestion dropdown (Yahoo!, Amazon, Bing).
**UI Location:** Center top or browser window.
**Tandem Relevance:** **HIGH** — Core browser feature.

### 15.3 Context Menus
**Category:** Core Browser
**Description:** Three types: page context menu (navigation, save, view source, save as PDF), link context menu (open/save linked pages), image context menu (open, copy, save image, "Use Image as Wallpaper").
**UI Location:** Right-click anywhere.
**Tandem Relevance:** **HIGH** — Standard browser feature.

### 15.4 Zoom
**Category:** Core Browser
**Description:** Adjust page zoom. Default zoom configurable. Per-page zoom.
**UI Location:** View menu. Settings > Appearance > "Page zoom."
**Keyboard Shortcut:** Ctrl/Cmd + +/- for zoom in/out. Ctrl/Cmd+0 for reset.
**Tandem Relevance:** **HIGH** — Standard browser feature.

### 15.5 Full Screen Mode
**Category:** Core Browser
**Description:** Immersive browsing with hidden menu bar. Menu accessible via top-screen hover. Exit with Esc.
**UI Location:** View > Enter Full Screen. O Menu > Page > Full Screen.
**Tandem Relevance:** **HIGH** — Standard browser feature.

### 15.6 Download Management
**Category:** Core Browser
**Description:** Progress bar below address bar. Download icon for viewing recent downloads. Configurable save location. Option to prompt for custom save location per download.
**UI Location:** Address bar right side (download icon). View > Downloads. Settings > Advanced > Browser > Downloads.
**Tandem Relevance:** **HIGH** — Standard browser feature.

### 15.7 History Management
**Category:** Core Browser
**Description:** Full browsing history with search filtering. Tab Island grouping for multi-selection. Bulk deletion. Restore up to 20 recently closed pages. Delete by domain. Cross-device sync.
**UI Location:** Sidebar clock icon. Three-dot menu > History.
**Keyboard Shortcut:** Ctrl+H / Cmd+Y
**Tandem Relevance:** **HIGH** — Standard browser feature.

### 15.8 Search Engine Management
**Category:** Core Browser / Search
**Description:** Change default search engine (Google, DuckDuckGo, Amazon, Wikipedia, etc.). Create custom search engines with keywords. Right-click any site's search bar > "Create Search Engine" with custom keyword.
**UI Location:** Settings > Search engine. Right-click site search bars.
**Technical Notes:** Type keyword + space + query for custom engine search.
**Tandem Relevance:** **HIGH** — Standard browser feature.

---

## Full Feature Comparison Table

| Feature | Category | Tandem Relevance | Priority |
|---------|----------|-----------------|----------|
| Tab Islands | Tab Management | HIGH | P1 |
| Workspaces | Tab Management | HIGH | P1 |
| Split Screen | Tab Management | HIGH | P1 |
| Tab Emojis | Tab Personalization | MEDIUM | P3 |
| Tab Traces | Tab Visual Feedback | MEDIUM | P3 |
| Search in Tabs | Tab Navigation | HIGH | P1 |
| Visual Tab Cycler | Tab Navigation | MEDIUM | P3 |
| Tab Preview on Hover | Tab Navigation | MEDIUM | P3 |
| Pin Tabs | Tab Management | HIGH | P1 |
| Tab Snoozing | Performance | HIGH | P1 |
| Duplicate Tabs Highlighter | Tab Management | MEDIUM | P3 |
| Close Tab Variations | Tab Management | HIGH | P2 |
| Save Tabs as Speed Dial Folder | Tab Management | MEDIUM | P3 |
| Sidebar Layout & Customization | Browser Chrome | HIGH | P1 |
| Sidebar Messenger Panels | Sidebar | HIGH | P1 |
| WhatsApp Integration | Messenger | HIGH | P1 |
| Discord Integration | Messenger | HIGH | P1 |
| Slack Integration | Messenger | HIGH | P1 |
| Instagram Integration | Social Media | MEDIUM | P3 |
| X/Twitter Integration | Social Media | MEDIUM | P3 |
| Telegram Integration | Messenger | MEDIUM | P3 |
| Spotify / Music Player | Media | MEDIUM | P3 |
| Opera AI (Aria) | AI Assistant | HIGH | P1 |
| Built-in Ad Blocker | Privacy | HIGH | P1 |
| Tracker Blocker | Privacy | HIGH | P1 |
| Free VPN | Privacy/Security | HIGH | P2 |
| Paste Protection | Security | MEDIUM | P3 |
| Private Browsing | Privacy | HIGH | P1 |
| Security Badges | Security | HIGH | P2 |
| Phishing/Malware Protection | Security | HIGH | P2 |
| Do Not Track | Privacy | LOW | P4 |
| Certificate Management | Security | MEDIUM | P3 |
| Clear Data on Exit | Privacy | MEDIUM | P3 |
| Delete Browsing Data | Privacy | HIGH | P2 |
| Video Popout (PiP) | Media | HIGH | P1 |
| Video Skip | Media | LOW | P4 |
| Music Player | Media | MEDIUM | P3 |
| Snapshot (Screenshot + Annotations) | Productivity | HIGH | P1 |
| Easy Files | Productivity | MEDIUM | P3 |
| Currency Converter | Productivity | MEDIUM | P3 |
| Unit Converter | Productivity | MEDIUM | P3 |
| Time Zone Converter | Productivity | MEDIUM | P3 |
| Search Popup | Productivity | MEDIUM | P3 |
| Opera Translate | Productivity | MEDIUM | P3 |
| Find on Page | Productivity | HIGH | P1 |
| BABE (Enhanced Address Bar) | Navigation | MEDIUM | P3 |
| Speed Dial | Start Page | HIGH | P1 |
| Personal News | Start Page | LOW | P4 |
| Easy Setup Panel | Customization | MEDIUM | P3 |
| Continue Shopping/Booking | Commerce | SKIP | — |
| Dynamic Themes | Customization | MEDIUM | P3 |
| Wallpapers | Customization | LOW | P4 |
| Chrome Extension Support | Customization | HIGH | P1 |
| Language Customization | Customization | LOW | P4 |
| Import Bookmarks/Settings | Migration | HIGH | P1 |
| Startup Preferences | Customization | HIGH | P2 |
| Opera Sync | Cross-Device | HIGH | P1 |
| My Flow | Cross-Device | HIGH | P1 |
| Pinboards | Collaboration | HIGH | P1 |
| Opera Cashback | Commerce | SKIP | — |
| Crypto Wallet | Commerce | SKIP | — |
| Battery Saver | Performance | MEDIUM | P2 |
| Bookmarks Manager | Bookmarks | HIGH | P1 |
| Bookmarks Bar | Bookmarks | HIGH | P2 |
| Navigation Buttons | Core | HIGH | P1 |
| Address & Search Bar | Core | HIGH | P1 |
| Context Menus | Core | HIGH | P1 |
| Zoom | Core | HIGH | P1 |
| Full Screen Mode | Core | HIGH | P2 |
| Download Management | Core | HIGH | P2 |
| History Management | Core | HIGH | P1 |
| Search Engine Management | Core | HIGH | P2 |

---

## Summary Statistics

- **Total features catalogued:** 68
- **HIGH relevance for Tandem:** 40
- **MEDIUM relevance:** 22
- **LOW relevance:** 4
- **SKIP (not relevant):** 3

### Top Priority (P1) Features for Tandem Gap Analysis:
1. Tab Islands (grouped tab management)
2. Workspaces (multi-context tab isolation)
3. Split Screen (multi-pane browsing)
4. Search in Tabs (Ctrl+Space tab search)
5. Pin Tabs
6. Tab Snoozing (memory management)
7. Sidebar with customizable panels
8. Sidebar webview panels (messengers/apps)
9. WhatsApp, Discord, Slack integration
10. Opera AI (Aria) — contextual AI assistant
11. Built-in Ad Blocker + Tracker Blocker
12. Private Browsing
13. Video Popout (Picture-in-Picture)
14. Snapshot with annotations
15. Find on Page
16. Speed Dial (start page)
17. Chrome Extension Support
18. Import Bookmarks/Settings
19. Opera Sync (cross-device)
20. My Flow (QR-paired cross-device sharing)
21. Pinboards (content curation + collaboration)
22. Bookmarks Manager
23. Core navigation (back/forward/reload, address bar, context menus, zoom, history)
