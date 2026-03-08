# Tandem Browser — Complete Feature Inventory

> Generated: 2026-02-28
> Codebase: ~39,500 lines | 81 TS files | 38 src modules | 195+ API endpoints | 124 tests
> Version: v0.15.1 | Electron 40 | TypeScript + Express.js

---

## 1. Core Browser (Navigation, Tabs, History)

### 1.1 Navigation
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| URL navigation | Navigate to any URL with optional tab targeting | `POST /navigate` | URL bar in toolbar | ✅ Complete |
| Back/Forward | Browser history navigation | `GET /back` (via navigate), menu | ← → buttons in toolbar | ✅ Complete |
| Reload | Reload current page | Menu action | ⟳ button in toolbar | ✅ Complete |
| URL bar | Unified search/URL input | — | Toolbar center | ✅ Complete |
| Page content read | Extract page content as text/markdown (with SPA MutationObserver settling) | `GET /page-content` | — (API only) | ✅ Complete |
| Page HTML source | Get full page HTML | `GET /page-html` | Context menu "View Page Source" | ✅ Complete |
| Find in Page | Search text on current page (Cmd+F) | — | Find bar overlay | ✅ Complete |
| Zoom in/out/reset | Page zoom controls (Cmd+=/-/0) | — | View menu, keyboard shortcuts | ✅ Complete |
| Full screen | Toggle full screen mode | — | View menu | ✅ Complete |
| Print | Print current page | — | Context menu only | ⚠️ Partial (no Cmd+P, no PDF export API) |

### 1.2 Webview Engine
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Chromium webview | Full Chromium rendering engine via Electron | — | Main content area | ✅ Complete |
| Persistent sessions | `persist:tandem` partition for cookies/storage | — | — | ✅ Complete |
| JavaScript execution | Run arbitrary JS in active tab (max 1MB) | `POST /execute-js` | — (API only) | ✅ Complete |
| JS with approval gate | Execute JS requiring user confirmation | `POST /execute-js/confirm` | Approval UI in wingman panel | ✅ Complete |
| Cookie management | Get, set, clear cookies by domain | `GET /cookies`, `POST /cookies/clear` | — (API only) | ✅ Complete |
| Wait for elements | Wait for DOM element or page load | `POST /wait` | — (API only) | ✅ Complete |
| Link extraction | Get all links from current page | `GET /links` | — (API only) | ✅ Complete |
| Form extraction | Get all forms and their fields | `GET /forms` | — (API only) | ✅ Complete |

---

## 2. Tab Management

| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Multi-tab browsing | Open unlimited tabs in a single window | `POST /tabs/open`, `POST /tabs/close`, `GET /tabs/list` | Tab bar | ✅ Complete |
| Tab switching | Switch between tabs by ID or index (Cmd+1-9) | `POST /tabs/focus` | Tab bar, keyboard shortcuts | ✅ Complete |
| New tab | Open new tab (Cmd+T) | `POST /tabs/open` | + button in tab bar, File menu | ✅ Complete |
| Close tab | Close tab (Cmd+W) | `POST /tabs/close` | Tab × button, File menu | ✅ Complete |
| Reopen closed tab | Reopen last closed tab (Cmd+Shift+T) | — | File menu | ✅ Complete |
| Tab groups | Create/manage tab groups with colors | `POST /tabs/group` | Tab bar (colored groups) | ✅ Complete |
| Pin tab | Pin/unpin tabs | — | Tab context menu | ✅ Complete |
| Mute tab | Mute/unmute tab audio | — | Tab context menu | ✅ Complete |
| Duplicate tab | Duplicate current tab | — | Tab context menu | ✅ Complete |
| Close other tabs | Close all tabs except current | — | Tab context menu | ✅ Complete |
| Close tabs to right | Close all tabs to the right | — | Tab context menu | ✅ Complete |
| Tab source marking | Mark tab as robin/wingman owned | `POST /tabs/source` | Tab context menu ("Let Wingman handle") | ✅ Complete |
| Tab lock manager | Lock tabs for exclusive agent access | `GET /tab-locks`, `POST /tab-locks/acquire`, `POST /tab-locks/release` | — (API only) | ✅ Complete |
| Zombie cleanup | Remove orphaned webContents | `POST /tabs/cleanup` | — (API only) | ✅ Complete |
| Tab Islands | Grouped tab organization (Opera-style) | — | — | 🚧 Planned only |

---

## 3. Sidebar & Panels (Wingman Panel)

### 3.1 Wingman Panel
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Toggle panel | Show/hide wingman side panel (Cmd+K) | `POST /panel/toggle` | Toggle button on side, Wingman menu | ✅ Complete |
| Panel position | Left or right side (configurable) | `PATCH /config` | Settings → General | ✅ Complete |
| Auto-open panel | Auto-open on app start | `PATCH /config` | Settings → General | ✅ Complete |
| Resizable panel | Drag handle to resize panel width | — | Panel border | ✅ Complete |
| Emergency stop | Stop all AI tasks immediately (Escape) | `POST /emergency-stop` | 🛑 button in panel header | ✅ Complete |

### 3.2 Panel Tabs
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Activity tab | Real-time browsing activity log | `GET /activity-log` | Wingman panel → Activity | ✅ Complete |
| Chat tab | Chat with AI wingman (multiple backends) | `GET /chat`, `POST /chat` | Wingman panel → Chat | ✅ Complete |
| Screenshots tab | Gallery or captured screenshots | `GET /screenshots` | Wingman panel → 📸 | ✅ Complete |
| ClaroNote tab | Voice recording with ClaroNote integration | `POST /claronote/record/start`, etc. | Wingman panel → 🎙️ | ✅ Complete |
| Vault toggle | Quick lock/unlock password vault | `POST /passwords/lock`, `POST /passwords/unlock` | 🔒 in panel header | ✅ Complete |
| Live mode | Show Wingman is watching (👁️) | `POST /live/toggle`, `GET /live/status` | 👁️ button in panel header | ✅ Complete |

---

## 4. Security Shield (Multi-Layer Defense)

### 4.1 Layer 1 — NetworkShield + Guardian
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Network request filtering | Block malicious URLs before they load (811K+ blocklist) | `GET /security/blocklist/stats`, `POST /security/blocklist/check` | — | ✅ Complete |
| Domain reputation tracking | Trust scores per domain with evolution | `GET /security/domains`, `GET /security/domains/:domain` | — | ✅ Complete |
| Manual trust adjustment | Override domain trust score | `POST /security/domains/:domain/trust` | — (API only) | ✅ Complete |
| Guardian mode | Cookie/permission tracking, anomaly detection (strict/balanced/permissive) | `GET /security/guardian/status`, `POST /security/guardian/mode` | — (API only) | ✅ Complete |
| Auto-updating blocklists | 24-hour cycle blocklist refresh | `POST /security/blocklist/update` | — | ✅ Complete |

### 4.2 Layer 2 — OutboundGuard
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Outbound request validation | Monitor/block suspicious outbound data exfiltration | `GET /security/outbound/stats`, `GET /security/outbound/recent` | — | ✅ Complete |
| Domain pair whitelisting | Whitelist known safe domain combinations | `POST /security/outbound/whitelist` | — (API only) | ✅ Complete |

### 4.3 Layer 3 — ContentAnalyzer + ScriptGuard
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Script threat detection | JavaScript analysis via CDP for malicious patterns | `GET /security/page/scripts` | — | ✅ Complete |
| Page content analysis | Scan forms, scripts, trackers on page | `GET /security/page/analysis` | — | ✅ Complete |
| Credential form detection | Identify forms that harvest credentials | `GET /security/page/forms` | — | ✅ Complete |
| Tracker inventory | Detect and catalog page trackers | `GET /security/page/trackers` | — | ✅ Complete |

### 4.4 Layer 4 — BehaviorMonitor
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Resource monitoring | CPU/memory usage per tab | `GET /security/monitor/resources` | — | ✅ Complete |
| Permission tracking | Log permission requests (camera, mic, etc.) | `GET /security/monitor/permissions` | — | ✅ Complete |
| Script/worker kill | Kill runaway scripts or workers | `POST /security/monitor/kill` | — (API only) | ✅ Complete |

### 4.5 Layer 5 — GatekeeperWebSocket (AI Agent)
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| AI security agent | WebSocket-connected agent for real-time decisions | `GET /security/gatekeeper/status` | — | ✅ Complete |
| Decision queue | Queue or pending security decisions | `GET /security/gatekeeper/queue`, `POST /security/gatekeeper/decide` | — | ✅ Complete |
| Decision history | History or AI security decisions | `GET /security/gatekeeper/history` | — | ✅ Complete |

### 4.6 Layer 6 — EvolutionEngine + ThreatIntel
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Trust score evolution | Baseline learning and adaptive trust scores | `GET /security/baselines/:domain`, `GET /security/trust/changes` | — | ✅ Complete |
| Anomaly detection | Detect behavioral anomalies per domain | `GET /security/anomalies` | — | ✅ Complete |
| Zero-day candidate tracking | Flag potential zero-day threats | `GET /security/zero-days`, `POST /security/zero-days/:id/resolve` | — | ✅ Complete |
| Cross-domain correlation | Event correlation across domains | `GET /security/scripts/correlations` | — | ✅ Complete |

### 4.7 Security Intelligence Upgrade (v0.9.0)
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Shannon entropy analysis | Detect obfuscated/encoded payloads | — | — | ✅ Complete |
| 25 YARA rules | Pattern matching for known threat signatures | — | — | ✅ Complete |
| AST fingerprinting | Abstract syntax tree analysis for script threats | — | — | ✅ Complete |
| CyberChef pattern detection | Detect encoding/encryption patterns | — | — | ✅ Complete |
| Confidence pipeline | Weighted confidence scoring for threat assessment | — | — | ✅ Complete |
| Plugin architecture | Pluggable analyzer cascade system | `GET /security/analyzers/status` | — | ✅ Complete |

### 4.8 Security Reporting
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Security report | Comprehensive security status report | `GET /security/report` | — (API only) | ✅ Complete |
| Security events | Recent security events log | `GET /security/events` | — (API only) | ✅ Complete |
| Overall status | Combined security status | `GET /security/status` | — (API only) | ✅ Complete |
| Data pruning | Prune old security events | `POST /security/maintenance/prune` | — (API only) | ✅ Complete |

---

## 5. Agent/Wingman Tools

### 5.1 Snapshot & Locators (Accessibility Tree)
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Accessibility tree snapshot | Get full AX tree with stable @ref IDs | `GET /snapshot` | — (API/CLI) | ✅ Complete |
| Click by @ref | Click element using snapshot reference | `POST /snapshot/click` | — (API/CLI) | ✅ Complete |
| Fill by @ref | Fill form field using snapshot reference | `POST /snapshot/fill` | — (API/CLI) | ✅ Complete |
| Get text by @ref | Read text content by snapshot reference | `GET /snapshot/text` | — (API/CLI) | ✅ Complete |
| Playwright-style locators | Find by role, text, placeholder, label, testid | `POST /find`, `POST /find/click`, `POST /find/fill`, `POST /find/all` | — (API only) | ✅ Complete |

### 5.2 Input Simulation
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Humanized click | OS-level click via `sendInputEvent()` (undetectable) | `POST /click` | — (API only) | ✅ Complete |
| Humanized type | Per-character typing with human timing | `POST /type` | — (API only) | ✅ Complete |
| Scroll | Directional scroll with amount/target/selector | `POST /scroll` | — (API only) | ✅ Complete |
| Hover | Hover over element | — | — (API only) | ✅ Complete |

### 5.3 Network Mocking & Inspection
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Network log | Monitor all network requests/responses | `GET /network/log` | — (API only) | ✅ Complete |
| API discovery | Detect APIs used by pages | `GET /network/apis` | — (API only) | ✅ Complete |
| Domain tracking | Track all contacted domains | `GET /network/domains` | — (API only) | ✅ Complete |
| Request mocking | Intercept and mock HTTP requests via CDP | `POST /network/mock`, `POST /network/route` | — (API only) | ✅ Complete |
| Mock management | List/remove/clear mock rules | `GET /network/mocks`, `POST /network/unmock`, `POST /network/mock-clear` | — (API only) | ✅ Complete |

### 5.4 Scripts & Styles Injection
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Persistent scripts | Inject JS scripts that persist across navigations | `GET /scripts`, `POST /scripts/add`, `DELETE /scripts/remove` | — (API only) | ✅ Complete |
| Script enable/disable | Toggle individual scripts | `POST /scripts/enable`, `POST /scripts/disable` | — (API only) | ✅ Complete |
| Persistent styles | Inject CSS styles that persist | `GET /styles`, `POST /styles/add`, `DELETE /styles/remove` | — (API only) | ✅ Complete |
| Style enable/disable | Toggle individual styles | `POST /styles/enable`, `POST /styles/disable` | — (API only) | ✅ Complete |

### 5.5 Device Emulation
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Device profiles | Predefined device profiles (iPhone, iPad, Pixel, etc.) | `GET /device/profiles` | — (API only) | ✅ Complete |
| Device emulation | Emulate device UA + viewport + touch | `POST /device/emulate` | — (API only) | ✅ Complete |
| Emulation status | Check current emulation state | `GET /device/status` | — (API only) | ✅ Complete |
| Reset emulation | Return to default desktop mode | `POST /device/reset` | — (API only) | ✅ Complete |

### 5.6 Task Management & Autonomy
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Task creation | Create multi-step AI tasks with approval workflow | `POST /tasks` | — (API only) | ✅ Complete |
| Task tracking | List/get tasks filtered by status | `GET /tasks`, `GET /tasks/:id` | — (API only) | ✅ Complete |
| Step approval | Approve/reject individual task steps | `POST /tasks/:id/approve`, `POST /tasks/:id/reject` | Approval UI in chat panel | ✅ Complete |
| Risk-based autonomy | Configure auto-approve thresholds (none/low/medium/high) | `GET /autonomy`, `PATCH /autonomy` | Settings → AI Autonomy | ✅ Complete |
| Emergency stop | Kill all running tasks immediately | `POST /emergency-stop` | 🛑 button, Escape key | ✅ Complete |
| Agent activity log | Track all agent actions | `GET /activity-log/agent` | — (API only) | ✅ Complete |
| Approval check | Check if action needs user approval | `GET /tasks/check-approval` | — (API only) | ✅ Complete |

---

## 6. Stealth & Anti-Detection

### 6.1 Browser Identity
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| User-Agent spoofing | Chrome 131 macOS UA (no "Electron") | `PATCH /config` | Settings → Stealth | ✅ Complete |
| Custom User-Agent | Override with custom UA string | `PATCH /config` | Settings → Stealth | ✅ Complete |
| navigator.userAgentData | Spoofed Chrome brands, no Electron | — | — | ✅ Complete |
| Sec-CH-UA headers | Match real Chrome header values | — | — | ✅ Complete |
| Accept-Language | Auto or custom accept-language | `PATCH /config` | Settings → Stealth | ✅ Complete |
| Stealth levels | Low/Medium/High stealth profiles | `PATCH /config` | Settings → Stealth | ✅ Complete |
| app.setName('Google Chrome') | OS-level name override | — | — | ✅ Complete |

### 6.2 Fingerprint Protection
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Canvas fingerprint | Seeded noise injection (±2 per channel per session) | — | — | ✅ Complete |
| WebGL fingerprint | GPU vendor/renderer masking | — | — | ✅ Complete |
| Audio fingerprint | AudioContext noise injection | — | — | ✅ Complete |
| Font enumeration | Consistent font list to prevent fingerprinting | — | — | ✅ Complete |
| Timing protection | `performance.now()` precision reduction, `Date.now()` jitter | — | — | ✅ Complete |

### 6.3 Electron Concealment
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| window.process removal | Remove Electron giveaway globals | — | — | ✅ Complete |
| window.require removal | Remove Node.js giveaway globals | — | — | ✅ Complete |
| navigator.webdriver | Set to false (anti-automation detection) | — | — | ✅ Complete |
| navigator.plugins | Spoofed plugin list matching Chrome | — | — | ✅ Complete |
| chrome.runtime mock | Mock Chrome extension runtime API | — | — | ✅ Complete |
| chrome.loadTimes/csi/app | Mock Chrome-specific APIs | — | — | ✅ Complete |

### 6.4 Interaction Stealth
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| OS-level clicks | `sendInputEvent()` instead or `dispatchEvent()` — `Event.isTrusted === true` | — | — | ✅ Complete |
| Per-char typing | Individual key events with human timing | — | — | ✅ Complete |
| Main-process screenshots | `webContents.capturePage()` (no canvas API in webview) | — | — | ✅ Complete |
| Shell-side overlays | Draw/voice/panel in shell, NOT in webview DOM | — | — | ✅ Complete |
| CORS strict | API only responds to localhost/file:// origins | — | — | ✅ Complete |

### 6.5 Not Yet Built (Stealth Backlog)
| Feature | Description | Status |
|---------|-------------|--------|
| Proxy support | SOCKS5/HTTP proxy, per-tab or global | 🚧 Planned |
| Request interception | Header modification/blocking | 🚧 Planned |
| TLS/JA3 fingerprint | Match real Chrome TLS fingerprint | 🚧 Planned |
| Screen resolution spoofing | Fake viewport/screen dimensions | 🚧 Planned |
| Battery API masking | Hide Battery Status API | 🚧 Planned |
| Geolocation spoofing | Fake GPS coordinates | 🚧 Planned |

---

## 7. Media (Video, Audio, Voice, Screenshot)

### 7.1 Screenshots
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Quick screenshot | Capture page (Cmd+Shift+S) | `GET /screenshot` | 📸 button in toolbar, Wingman menu | ✅ Complete |
| Screenshot gallery | View all captured screenshots | `GET /screenshots` | Wingman panel → Screenshots tab | ✅ Complete |
| Annotated screenshot | Screenshot with draw overlay composited | `GET /screenshot/annotated`, `POST /screenshot/annotated` | Draw toolbar → 📸 Snap button | ✅ Complete |
| Clipboard copy | Auto-copy screenshot to clipboard | — | — (always on) | ✅ Complete |
| Local save | Save to ~/Pictures/Tandem/ | `PATCH /config` | Settings → Screenshots | ✅ Complete |
| Element screenshot | Screenshot specific DOM element via CDP | `POST /devtools/screenshot/element` | — (API only) | ✅ Complete |

### 7.2 Drawing & Annotation
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Draw mode | Toggle draw overlay (Cmd+Shift+D) | `POST /draw/toggle` | Wingman menu | ✅ Complete |
| Arrow tool | Draw arrows on page | — | Draw toolbar | ✅ Complete |
| Rectangle tool | Draw rectangles | — | Draw toolbar | ✅ Complete |
| Circle tool | Draw circles/ellipses | — | Draw toolbar | ✅ Complete |
| Free line tool | Freehand drawing | — | Draw toolbar | ✅ Complete |
| Text label tool | Add text labels | — | Draw toolbar | ✅ Complete |
| Color palette | 4 colors: red, yellow, green, blue | — | Draw toolbar | ✅ Complete |
| Clear canvas | Clear all annotations | — | Draw toolbar 🗑 button | ✅ Complete |
| Snap for Wingman | Composite drawing + page → screenshot for AI | — | Draw toolbar 📸 button | ✅ Complete |

### 7.3 Voice Input
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Speech recognition | Web Speech API in shell (Cmd+Shift+M) | `POST /voice/start`, `POST /voice/stop`, `GET /voice/status` | Voice overlay, Wingman menu | ✅ Complete |
| Live transcription | Real-time transcript display | — | Voice overlay | ✅ Complete |
| Multi-language | nl-BE, nl-NL, and-US, and-UK, the, fr | `PATCH /config` | Settings → Voice | ✅ Complete |
| Auto-send on silence | Automatically send transcription after silence | `PATCH /config` | Settings → Voice | ✅ Complete |
| Configurable timeout | Silence timeout 1-5 seconds | `PATCH /config` | Settings → Voice | ✅ Complete |

### 7.4 Audio Recording
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Tab audio capture | Record tab audio output (Cmd+R) | `POST /audio/start`, `POST /audio/stop` | Wingman menu | ✅ Complete |
| Recording status | Check if recording is active | `GET /audio/status` | — | ✅ Complete |
| Recording list | Browse past recordings | `GET /audio/recordings` | — (API only) | ✅ Complete |

### 7.5 Picture-in-Picture
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| PiP mode | Float current tab as always-on-top mini window (Cmd+Shift+P) | `POST /pip/toggle`, `GET /pip/status` | Wingman menu | ✅ Complete |

---

## 8. Extensions System

### 8.1 Extension Management
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| CRX installation | Download/verify/extract from Chrome Web Store | `POST /extensions/install` | Settings → Extensions → Gallery | ✅ Complete |
| Extension loading | Load extensions from local path | `POST /extensions/load` | — (API only) | ✅ Complete |
| Extension uninstall | Remove installed extensions | `DELETE /extensions/uninstall/:id` | Settings → Extensions → Installed | ✅ Complete |
| Extension listing | List loaded + available extensions | `GET /extensions/list` | Settings → Extensions | ✅ Complete |
| Extension toolbar | Show extension icons in browser toolbar | — | Toolbar (right side, with overflow 🧩) | ✅ Complete |
| Curated gallery | 30 pre-vetted extensions with compatibility badges | `GET /extensions/gallery` | Settings → Extensions → Gallery | ✅ Complete |
| Category filtering | Filter gallery by category | — | Settings → Extensions → Gallery | ✅ Complete |

### 8.2 Chrome Import
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| List Chrome extensions | Discover extensions from Chrome profiles | `GET /extensions/chrome/list` | Settings → Extensions → From Chrome | ✅ Complete |
| Import Chrome extensions | Import selected Chrome extensions | `POST /extensions/chrome/import` | Settings → Extensions → From Chrome | ✅ Complete |

### 8.3 Extension Features
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Native messaging | Detect/setup native messaging hosts | `GET /extensions/native-messaging/status` | — | ✅ Complete |
| OAuth polyfill | chrome.identity.launchWebAuthFlow polyfill | `POST /extensions/identity/auth` | — | ✅ Complete |
| Auto-update checker | 24-hour cycle update checks | `GET /extensions/updates/check`, `GET /extensions/updates/status` | Settings → Extensions | ✅ Complete |
| Apply updates | Download and apply extension updates | `POST /extensions/updates/apply` | Settings → Extensions | ✅ Complete |
| Conflict detection | Detect manifest conflicts between extensions | `GET /extensions/conflicts` | — (API only) | ✅ Complete |
| Disk usage tracking | Per-extension storage usage | `GET /extensions/disk-usage` | — (API only) | ✅ Complete |

---

## 9. DevTools Bridge (CDP Endpoints)

| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| DevTools status | Check debugger attachment status | `GET /devtools/status` | — (API only) | ✅ Complete |
| Console capture | Get console log entries | `GET /devtools/console`, `GET /devtools/console/errors` | — (API only) | ✅ Complete |
| Console clear | Clear console buffer | `POST /devtools/console/clear` | — (API only) | ✅ Complete |
| Network capture | Get network entries with filtering | `GET /devtools/network`, `GET /devtools/network/:requestId/body` | — (API only) | ✅ Complete |
| Network clear | Clear network log | `POST /devtools/network/clear` | — (API only) | ✅ Complete |
| DOM query (CSS) | Query DOM by CSS selector | `POST /devtools/dom/query` | — (API only) | ✅ Complete |
| DOM query (XPath) | Query DOM by XPath expression | `POST /devtools/dom/xpath` | — (API only) | ✅ Complete |
| Storage access | Get cookies, localStorage, sessionStorage | `GET /devtools/storage` | — (API only) | ✅ Complete |
| Performance metrics | Get performance metrics | `GET /devtools/performance` | — (API only) | ✅ Complete |
| CDP evaluate | Evaluate JS via CDP Runtime domain | `POST /devtools/evaluate` | — (API only) | ✅ Complete |
| Raw CDP commands | Send arbitrary CDP commands | `POST /devtools/cdp` | — (API only) | ✅ Complete |
| Toggle DevTools | Open/close DevTools window | `POST /devtools/toggle` | — (API only) | ✅ Complete |

---

## 10. Context Menu (Right-Click Features)

### 10.1 Page Context Menu
| Feature | Description | UI Location | Status |
|---------|-------------|-------------|--------|
| Back / Forward / Reload | Navigation from context menu | Context menu | ✅ Complete |
| Save As... | Save current page | Context menu | ✅ Complete |
| Print... | Print current page | Context menu | ✅ Complete |
| View Page Source | View HTML source | Context menu | ✅ Complete |
| Inspect Element | Open DevTools on element | Context menu | ✅ Complete |
| Copy (selection) | Copy selected text | Context menu (when text selected) | ✅ Complete |
| Search Google for "..." | Search selected text | Context menu (when text selected) | ✅ Complete |
| Ask Wingman about Selection | Send selected text to AI | Context menu (when text selected) | ✅ Complete |
| Summarize Page with Wingman | AI page summarization | Context menu | ✅ Complete |
| Screenshot this Page | Quick screenshot | Context menu | ✅ Complete |
| Bookmark this Page | Toggle bookmark for current URL | Context menu | ✅ Complete |

### 10.2 Link Context Menu
| Feature | Description | UI Location | Status |
|---------|-------------|-------------|--------|
| Open Link in New Tab | Open link target in new tab | Context menu (on links) | ✅ Complete |
| Copy Link Address | Copy link URL | Context menu (on links) | ✅ Complete |
| Copy Link Text | Copy link text content | Context menu (on links) | ✅ Complete |
| Save Link As... | Download link target | Context menu (on links) | ✅ Complete |
| Bookmark Link | Save link as bookmark | Context menu (on links) | ✅ Complete |

### 10.3 Image Context Menu
| Feature | Description | UI Location | Status |
|---------|-------------|-------------|--------|
| Open Image in New Tab | View full image | Context menu (on images) | ✅ Complete |
| Save Image As... | Download image | Context menu (on images) | ✅ Complete |
| Copy Image | Copy image to clipboard | Context menu (on images) | ✅ Complete |
| Copy Image Address | Copy image URL | Context menu (on images) | ✅ Complete |
| Ask Wingman about this Image | Send image to AI for analysis | Context menu (on images) | ✅ Complete |

### 10.4 Editable Field Context Menu
| Feature | Description | UI Location | Status |
|---------|-------------|-------------|--------|
| Undo / Redo | Edit operations | Context menu (in inputs) | ✅ Complete |
| Cut / Copy / Paste | Clipboard operations | Context menu (in inputs) | ✅ Complete |
| Paste as Plain Text | Strip formatting | Context menu (in inputs) | ✅ Complete |
| Delete / Select All | Text operations | Context menu (in inputs) | ✅ Complete |
| Autofill Password | Fill credentials from vault (submenu) | Context menu (in inputs) | ✅ Complete |
| Generate New Password | Generate random password | Context menu (in inputs) | ✅ Complete |

### 10.5 Media Context Menu
| Feature | Description | UI Location | Status |
|---------|-------------|-------------|--------|
| Open Video/Audio in New Tab | View media in new tab | Context menu (on media) | ✅ Complete |
| Save Video/Audio As... | Download media | Context menu (on media) | ✅ Complete |
| Copy Video/Audio Address | Copy media URL | Context menu (on media) | ✅ Complete |

### 10.6 Tab Context Menu (Tab Bar)
| Feature | Description | UI Location | Status |
|---------|-------------|-------------|--------|
| New Tab | Open new tab | Tab bar context menu | ✅ Complete |
| Reload Tab | Reload specific tab | Tab bar context menu | ✅ Complete |
| Duplicate Tab | Duplicate tab | Tab bar context menu | ✅ Complete |
| Pin/Unpin Tab | Toggle pin state | Tab bar context menu | ✅ Complete |
| Mute/Unmute Tab | Toggle audio mute | Tab bar context menu | ✅ Complete |
| Let Wingman handle / Take back | Toggle tab ownership | Tab bar context menu | ✅ Complete |
| Close Tab | Close specific tab | Tab bar context menu | ✅ Complete |
| Close Other Tabs | Close all except current | Tab bar context menu | ✅ Complete |
| Close Tabs to Right | Close all tabs to right | Tab bar context menu | ✅ Complete |
| Reopen Closed Tab | Restore last closed tab | Tab bar context menu | ✅ Complete |

**Total: ~50 distinct context menu items**

---

## 11. Bookmarks & Speed Dial

### 11.1 Bookmarks
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Add bookmark | Star current page (Cmd+D) | `POST /bookmarks/add` | ☆ button in toolbar, context menu | ✅ Complete |
| Remove bookmark | Unstar page | `DELETE /bookmarks/remove` | ☆ button (toggle), context menu | ✅ Complete |
| Edit bookmark | Update name/URL | `PUT /bookmarks/update` | Bookmark manager | ✅ Complete |
| Bookmark folders | Organize bookmarks in folders | `POST /bookmarks/add-folder`, `POST /bookmarks/move` | Bookmark manager sidebar | ✅ Complete |
| Bookmark search | Search by name or URL | `GET /bookmarks/search` | Bookmark manager search box | ✅ Complete |
| Check if bookmarked | Check if URL is in bookmarks | `GET /bookmarks/check` | — (API only) | ✅ Complete |
| Bookmarks bar | Horizontal bar below toolbar | — | Below toolbar (toggleable Cmd+Shift+B) | ✅ Complete |
| Bookmark manager | Full page bookmark management | — | tandem://bookmarks | ✅ Complete |
| Chrome bookmark import | Import from Chrome profiles | `POST /import/chrome/bookmarks` | Bookmark manager, Settings → Sync | ✅ Complete |
| Chrome bookmark sync | Live sync with Chrome bookmarks | `POST /import/chrome/sync/start`, etc. | Settings → Sync | ✅ Complete |

### 11.2 Speed Dial / Quick Links
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Quick links grid | 8 preset quick links (DuckDuckGo, GitHub, LinkedIn, Gmail, YouTube, Reddit, ClaroNote, X) | — | New Tab page | ✅ Complete |
| Recent tabs | Recently visited tabs with favicons | — | New Tab page | ✅ Complete |
| Configurable quick links | User-customizable quick links | — | — | 🚧 Planned (currently hardcoded) |

---

## 12. History & Downloads

### 12.1 History
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Browsing history | Full URL history with timestamps | `GET /history` | Cmd+Y, File menu | ✅ Complete |
| History search | Full-text search through history | `GET /history/search` | History page | ✅ Complete |
| Clear history | Delete browsing history | `DELETE /history/clear` | — (API only) | ✅ Complete |
| Chrome history import | Import from Chrome profiles | `POST /import/chrome/history` | Settings → Sync | ✅ Complete |

### 12.2 Downloads
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Download tracking | Track all downloads with metadata | `GET /downloads` | — | ✅ Complete |
| Active downloads | View in-progress downloads | `GET /downloads/active` | — | ✅ Complete |
| Download interception | Intercept/handle download requests | — | — | ✅ Complete |

---

## 13. Password Manager

| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Encrypted vault | SQLite + AES-256-GCM encrypted storage | — | — | ✅ Complete |
| Master password | PBKDF2-derived key, required to unlock | `POST /passwords/unlock`, `POST /passwords/lock` | Vault overlay, 🔒 in panel | ✅ Complete |
| Vault status | Check lock/unlock state | `GET /passwords/status` | — | ✅ Complete |
| Save credentials | Store domain + username + password | `POST /passwords/save` | — (API only, autofill prompt) | ✅ Complete |
| Autofill | Fill credentials for current domain | `GET /passwords/suggest` | Context menu → Autofill Password | ✅ Complete |
| Password generator | Generate secure random passwords | `GET /passwords/generate` | Context menu → Generate New Password | ✅ Complete |
| Per-item encryption | Fresh salt/IV per credential entry | — | — | ✅ Complete |
| No cloud sync | 100% local storage, never leaves device | — | — | ✅ Complete (by design) |

---

## 14. MCP Server (Model Context Protocol)

### 14.1 MCP Tools (25 tools)
| Tool Name | Description | Status |
|-----------|-------------|--------|
| `tandem_navigate` | Navigate active tab to URL | ✅ Complete |
| `tandem_go_back` | Go back in history | ✅ Complete |
| `tandem_go_forward` | Go forward in history | ✅ Complete |
| `tandem_reload` | Reload current page | ✅ Complete |
| `tandem_read_page` | Read page content as markdown (max 2000 words) | ✅ Complete |
| `tandem_screenshot` | Take screenshot or active tab | ✅ Complete |
| `tandem_get_links` | Get all links on page | ✅ Complete |
| `tandem_wait_for_load` | Wait for page to finish loading | ✅ Complete |
| `tandem_click` | Click element by CSS selector | ✅ Complete |
| `tandem_type` | Type text into input field | ✅ Complete |
| `tandem_scroll` | Scroll page up/down | ✅ Complete |
| `tandem_execute_js` | Execute JavaScript in active tab | ✅ Complete |
| `tandem_list_tabs` | List all open tabs | ✅ Complete |
| `tandem_open_tab` | Open new tab | ✅ Complete |
| `tandem_close_tab` | Close tab by ID | ✅ Complete |
| `tandem_focus_tab` | Switch to specific tab | ✅ Complete |
| `tandem_send_message` | Send message to Wingman chat | ✅ Complete |
| `tandem_get_chat_history` | Get recent chat messages | ✅ Complete |
| `tandem_search_bookmarks` | Search bookmarks by keyword | ✅ Complete |
| `tandem_search_history` | Search history by keyword | ✅ Complete |
| `tandem_get_context` | Get full browser state overview | ✅ Complete |
| `tandem_research` | Autonomous multi-tab research | ✅ Complete |
| `tandem_create_task` | Create trackable AI task with steps | ✅ Complete |
| `tandem_emergency_stop` | Emergency stop all agent tasks | ✅ Complete |
| `tandem_fill_form` | Fill form fields | ✅ Complete |

### 14.2 MCP Resources (4 resources)
| Resource URI | Description | Status |
|-------------|-------------|--------|
| `tandem://page/current` | Current page content (title, URL, text) | ✅ Complete |
| `tandem://tabs/list` | All open browser tabs | ✅ Complete |
| `tandem://chat/history` | Recent chat messages | ✅ Complete |
| `tandem://context` | Live browser context (active tab, tabs, events, voice) | ✅ Complete |

---

## 15. Chat Bridge (Tandem ↔ Wingman)

| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| WebSocket chat | Direct WS connection to OpenClaw gateway (ws://127.0.0.1:18789) | — | Wingman panel → Chat tab | ✅ Complete |
| Streaming responses | Real-time token streaming (delta → final) | — | Chat tab | ✅ Complete |
| Auto-reconnect | Automatic reconnection on disconnect | — | — | ✅ Complete |
| Chat history | Load previous messages on connect | `GET /chat` | Chat tab | ✅ Complete |
| Send messages | Send text to wingman | `POST /chat` | Chat tab input | ✅ Complete |
| Backend selector | Switch between OpenClaw, Claude, or Both | — | Chat tab dropdown | ✅ Complete |
| Dual mode | Route to both backends simultaneously | — | Chat tab (🐙🤖 Beide) | ✅ Complete |
| Typing indicator | Show when wingman is typing | `POST /chat/typing` | Chat tab | ✅ Complete |
| Image support | Send/receive images in chat | `GET /chat/image/:filename` | Chat tab | ✅ Complete |
| Wingman alert | Modal alert from wingman to user | `POST /wingman-alert` | Overlay modal | ✅ Complete |
| Webhook test | Test webhook connectivity | `POST /chat/webhook/test` | — (API only) | ✅ Complete |
| Connection status | WebSocket connection indicator | — | Status dot in toolbar | ✅ Complete |

---

## 16. Behavioral Learning

| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Passive observation | Track mouse/keyboard/scroll/navigation via main process | — | — (always running if enabled) | ✅ Complete |
| Raw event logging | JSONL append-only to ~/.tandem/behavior/raw/{date}.jsonl | — | — | ✅ Complete |
| Typing rhythm | Keyboard timing intervals (bigram model) | — | — | ✅ Complete |
| Mouse patterns | Movement paths, click delays, hover duration | — | — | ✅ Complete |
| Scroll patterns | Speed, pauses, read time | — | — | ✅ Complete |
| Profile compiler | Compile raw data into statistical distributions | — | — | ✅ Complete |
| Typing speed metrics | Mean WPM and variance extraction | — | — | ✅ Complete |
| Mouse curve analysis | Bézier curve bias and speed analysis | — | — | ✅ Complete |
| Behavior replay | Generate human-like actions from learned profiles | — | — | ✅ Complete |
| Gaussian typing delays | Variable delays based on WPM + noise | — | — | ✅ Complete |
| Bézier mouse trajectories | Smooth curved mouse movements with easing | — | — | ✅ Complete |
| Fallback profiles | Default 60 WPM / ease-in-out when no data | — | — | ✅ Complete |
| Behavior stats | View statistics dashboard | `GET /behavior/stats` | Settings → Behavioral Learning | ✅ Complete |
| Clear data | Reset all behavioral data | `POST /behavior/clear` | Settings → Behavioral Learning | ✅ Complete |
| Enable/disable | Toggle behavioral tracking | `PATCH /config` | Settings → Behavioral Learning | ✅ Complete |

---

## 17. New Tab Page

| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Tandem branding | Logo, title "Tandem", subtitle "Co-Pilot Browser" | — | New tab page | ✅ Complete |
| Search box | Unified search input | — | New tab page (center) | ✅ Complete |
| Quick links | 8 preset sites (DuckDuckGo, GitHub, LinkedIn, Gmail, YouTube, Reddit, ClaroNote, X) | — | New tab page (grid) | ✅ Complete |
| Recent tabs | Recently visited tabs with favicon, title, hostname | `GET /tabs/list` | New tab page (below quick links) | ✅ Complete |
| Custom start page | Choose start page: Wingman, DuckDuckGo, or custom URL | `PATCH /config` | Settings → General | ✅ Complete |

---

## 18. Settings & Configuration

### 18.1 Settings Sections
| Section | Features | UI Location | Status |
|---------|----------|-------------|--------|
| General | Start page, language, panel position, auto-open, bookmarks bar | Settings → ⚙️ | ✅ Complete |
| Screenshots | Clipboard, local folder, Apple Photos import | Settings → 📸 | ✅ Complete |
| Voice | Input language, auto-send, silence timeout | Settings → 🎙️ | ✅ Complete |
| Appearance | Color scheme (dark/light/system), Liquid Glass effects (blur, refraction) | Settings → 🎨 | ✅ Complete |
| Stealth | User-Agent, stealth level, Accept-Language | Settings → 🛡️ | ✅ Complete |
| Sync | Chrome bookmarks sync, profile selection | Settings → 🔄 | ✅ Complete |
| Behavioral Learning | Enable/disable, clear data, stats dashboard | Settings → 🧬 | ✅ Complete |
| AI Autonomy | Per-action approval settings, trusted sites | Settings → 🤖 | ✅ Complete |
| Data | Export, import, clear all data | Settings → 💾 | ✅ Complete |
| Extensions | Installed, Chrome import, Gallery tabs | Settings → 🧩 | ✅ Complete |

### 18.2 Configuration API
| Feature | Description | API Endpoint(s) | Status |
|---------|-------------|-----------------|--------|
| Get config | Read all settings | `GET /config` | ✅ Complete |
| Update config | Partial config update | `PATCH /config` | ✅ Complete |
| OpenClaw token | Get gateway auth token | `GET /config/openclaw-token` | ✅ Complete |
| Data export | Export all data as JSON | `GET /data/export` | ✅ Complete |
| Data import | Restore from JSON export | `POST /data/import` | ✅ Complete |
| Data wipe | Wipe chat, config, behavior data | `POST /data/wipe` | ✅ Complete |

### 18.3 Appearance / Theming
| Feature | Description | UI Location | Status |
|---------|-------------|-------------|--------|
| Dark theme | Default dark color scheme | Settings → Appearance | ✅ Complete |
| Light theme | Light color scheme | Settings → Appearance | ✅ Complete |
| System theme | Follow OS dark/light preference | Settings → Appearance | ✅ Complete |
| Liquid Glass Lite | CSS blur/glass effects on tab bar, toolbar, panel | Settings → Appearance | ✅ Complete |
| macOS vibrancy | Native vibrancy effect (macOS only) | — (auto-detected) | ✅ Complete |
| Gel press effects | Interactive press effects on buttons | — | ✅ Complete |

---

## 19. CLI (Tandem CLI Commands)

**Package:** `@hydro13/tandem-cli` | **Binary:** `tandem`

| Command | Description | API Endpoint Used | Status |
|---------|-------------|-------------------|--------|
| `tandem open <url>` | Navigate to URL | `POST /navigate` | ✅ Complete |
| `tandem click <target>` | Click by @ref or CSS selector | `POST /snapshot/click` or `POST /click` | ✅ Complete |
| `tandem fill <target> <text>` | Fill text by @ref or CSS selector | `POST /snapshot/fill` or `POST /type` | ✅ Complete |
| `tandem eval <javascript>` | Execute JavaScript in active tab | `POST /execute-js` | ✅ Complete |
| `tandem screenshot [path]` | Take screenshot (optional save path) | `GET /screenshot` | ✅ Complete |
| `tandem snapshot [options]` | Get accessibility tree (--interactive, --compact, --selector, --depth) | `GET /snapshot` | ✅ Complete |
| `tandem cookies list` | List all cookies | `GET /cookies` | ✅ Complete |
| `tandem cookies set <name> <value>` | Set a cookie | `POST /cookies/set` | ✅ Complete |
| `tandem session list` | List browser sessions | `GET /sessions/list` | ✅ Complete |
| `tandem session create <name>` | Create new session | `POST /sessions/create` | ✅ Complete |
| `tandem session switch <name>` | Switch active session | `POST /sessions/switch` | ✅ Complete |
| `tandem session destroy <name>` | Destroy session | `POST /sessions/destroy` | ✅ Complete |

**Global option:** `--session <name>` — target a named session for any command.

---

## 20. Multi-Session (Session Isolation)

| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Session creation | Create isolated browser sessions with separate partitions | `POST /sessions/create` | — (API/CLI) | ✅ Complete |
| Session listing | List all active sessions | `GET /sessions/list` | — (API/CLI) | ✅ Complete |
| Session switching | Switch between sessions | `POST /sessions/switch` | — (API/CLI) | ✅ Complete |
| Session destruction | Destroy session and close its tabs | `POST /sessions/destroy` | — (API/CLI) | ✅ Complete |
| State save | Persist session state (tabs, URLs) to disk | `POST /sessions/state/save` | — (API only) | ✅ Complete |
| State load | Restore saved session state | `POST /sessions/state/load` | — (API only) | ✅ Complete |
| Saved states list | Browse saved session snapshots | `GET /sessions/state/list` | — (API only) | ✅ Complete |
| Cookie isolation | Each session has separate cookie partition | — | — | ✅ Complete |

---

## 21. Additional Features

### 21.1 Site Memory
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Per-domain tracking | Visit count, time spent, content per domain | `GET /memory/sites`, `GET /memory/site/:domain` | — (API only) | ✅ Complete |
| Change detection | SHA-256 diff or title, headings, forms, links | `GET /memory/site/:domain/diff` | — (API only) | ✅ Complete |
| Memory search | Full-text search across all site memories | `GET /memory/search` | — (API only) | ✅ Complete |

### 21.2 Scheduled Watches
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Page watch | Monitor URL for changes on schedule | `POST /watch/add`, `GET /watch/list` | — (API only) | ✅ Complete |
| Force check | Manually trigger watch check | `POST /watch/check` | — (API only) | ✅ Complete |
| Change alerts | Wingman alert on detected changes | — | Wingman alert overlay | ✅ Complete |
| Watch removal | Remove watches | `DELETE /watch/remove` | — (API only) | ✅ Complete |

### 21.3 Headless Mode
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Background browsing | Hidden BrowserWindow for AI autonomous browsing | `POST /headless/open`, `GET /headless/content` | — (API only) | ✅ Complete |
| Captcha detection | Auto-detect reCAPTCHA/hCaptcha/Cloudflare and show to user | — | Auto-shows window | ✅ Complete |
| Login redirect detection | Detect auth redirects and alert user | — | Wingman alert | ✅ Complete |
| Show/hide/close | Manual visibility control | `POST /headless/show`, `POST /headless/hide`, `POST /headless/close` | — (API only) | ✅ Complete |
| Status | Check headless browser state | `GET /headless/status` | — (API only) | ✅ Complete |

### 21.4 Form Memory
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Form field recall | Remember form inputs per domain | `GET /forms/memory`, `GET /forms/memory/:domain` | — | ✅ Complete |
| Auto-fill data | Get fill suggestions for domain | `POST /forms/fill` | — (API only) | ✅ Complete |
| Clear form memory | Delete per-domain form data | `DELETE /forms/memory/:domain` | — (API only) | ✅ Complete |

### 21.5 Content Extraction
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Smart extraction | Convert page to structured markdown | `POST /content/extract` | — (API only) | ✅ Complete |
| URL extraction | Extract from specific URL (not active tab) | `POST /content/extract/url` | — (API only) | ✅ Complete |

### 21.6 Context Bridge
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Recent pages | Get recently visited pages with metadata | `GET /context/recent` | — (API only) | ✅ Complete |
| Context search | Full-text search across context | `GET /context/search` | — (API only) | ✅ Complete |
| Page context | Detailed context for specific page | `GET /context/page` | — (API only) | ✅ Complete |
| Context summary | Compact ~500 token summary for AI | `GET /context/summary` | — (API only) | ✅ Complete |
| Page notes | Add notes to any page | `POST /context/note` | — (API only) | ✅ Complete |

### 21.7 Workflow Engine
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Multi-step workflows | Define/execute browser automation sequences | `POST /workflows`, `POST /workflow/run` | — (API only) | ✅ Complete |
| Step types | navigate, wait, click, type, extract, screenshot, scroll, condition | — | — | ✅ Complete |
| Conditional logic | Goto, skip, abort based on conditions | — | — | ✅ Complete |
| Retry with backoff | Exponential retry on step failure | — | — | ✅ Complete |
| Variable storage | Cross-step variable manipulation | — | — | ✅ Complete |
| Workflow management | List, delete, stop workflows | `GET /workflows`, `DELETE /workflows/:id`, `POST /workflow/stop` | — (API only) | ✅ Complete |
| Execution tracking | Monitor running workflow status | `GET /workflow/status/:executionId`, `GET /workflow/running` | — (API only) | ✅ Complete |

### 21.8 Login Manager
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Login state tracking | Track auth state per domain | `GET /auth/states`, `GET /auth/state/:domain` | — (API only) | ✅ Complete |
| Login page detection | Detect if current page is a login page | `GET /auth/is-login-page` | — (API only) | ✅ Complete |
| Auth check | Check current page's login state | `POST /auth/check` | — (API only) | ✅ Complete |
| State update | Manually update login state | `POST /auth/update` | — (API only) | ✅ Complete |

### 21.9 ClaroNote Integration
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| ClaroNote login | Authenticate with ClaroNote API | `POST /claronote/login`, `POST /claronote/logout` | Wingman panel → ClaroNote tab | ✅ Complete |
| Voice recording | Record audio for transcription | `POST /claronote/record/start`, `POST /claronote/record/stop` | ClaroNote tab (🎙️ button) | ✅ Complete |
| Waveform visualization | Real-time audio waveform during recording | — | ClaroNote tab | ✅ Complete |
| Notes list | Browse transcribed notes | `GET /claronote/notes`, `GET /claronote/notes/:id` | ClaroNote tab | ✅ Complete |
| Audio upload | Upload recordings for transcription | `POST /claronote/upload` | — | ✅ Complete |

### 21.10 Event Streaming
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| SSE event stream | Server-Sent Events for real-time updates | `GET /events/stream` | — (for MCP/external tools) | ✅ Complete |
| Recent events | Get buffered recent events | `GET /events/recent` | — (API only) | ✅ Complete |
| Live mode stream | Filtered SSE stream (live mode only) | `GET /live/stream` | — (API only) | ✅ Complete |
| Wingman stream | Toggle activity streaming to wingman | `POST /wingman-stream/toggle`, `GET /wingman-stream/status` | — | ✅ Complete |

### 21.11 Chrome Import
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Chrome profiles | List available Chrome profiles | `GET /import/chrome/profiles` | Settings → Sync | ✅ Complete |
| Bookmark import | Import Chrome bookmarks | `POST /import/chrome/bookmarks` | Bookmark manager, Settings | ✅ Complete |
| History import | Import Chrome browsing history | `POST /import/chrome/history` | Settings | ✅ Complete |
| Cookie import | Import Chrome cookies | `POST /import/chrome/cookies` | Settings | ✅ Complete |
| Live sync | Continuous Chrome bookmark sync | `POST /import/chrome/sync/start`, etc. | Settings → Sync | ✅ Complete |
| Import status | Check import progress | `GET /import/chrome/status` | Settings | ✅ Complete |

### 21.12 X-Scout
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| X/Twitter scout | Dedicated agent for X platform browsing | — | — (internal) | ✅ Complete |

### 21.13 Request Dispatcher
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Central request hooks | Priority-based webRequest handler management | — | — (internal) | ✅ Complete |
| Header modification | Modify request/response headers | — | — (internal) | ✅ Complete |

### 21.14 Onboarding
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Welcome flow | 4-step interactive onboarding | — | Overlay on first launch | ✅ Complete |
| Show onboarding | Re-trigger from Help menu | — | Help menu → Show Onboarding | ✅ Complete |

### 21.15 Help & Documentation
| Feature | Description | API Endpoint(s) | UI Location | Status |
|---------|-------------|-----------------|-------------|--------|
| Help page | 9-section help documentation | — | tandem://help | ✅ Complete |
| Keyboard shortcuts overlay | Searchable shortcuts reference (Cmd+Shift+/) | — | Overlay | ✅ Complete |
| About page | Version, credits, links | — | App menu → About | ✅ Complete |

### 21.16 Application Menu
| Feature | Description | UI Location | Status |
|---------|-------------|-------------|--------|
| File menu | New tab, close, reopen, bookmarks, find, history | Menu bar | ✅ Complete |
| Edit menu | Undo, redo, cut, copy, paste, select all | Menu bar | ✅ Complete |
| View menu | Zoom in/out/reset, fullscreen | Menu bar | ✅ Complete |
| Wingman menu | Panel, voice, PiP, draw, screenshot, record, ClaroNote | Menu bar | ✅ Complete |
| Window menu | Minimize, zoom, bring to front | Menu bar | ✅ Complete |
| Help menu | Keyboard shortcuts, onboarding | Menu bar | ✅ Complete |

---

## 22. OpenClaw Skill Package

| Feature | Description | Status |
|---------|-------------|--------|
| Skill definition | SKILL.md defining Tandem as an OpenClaw skill | ✅ Complete |
| Tool descriptions | Documented tools for OpenClaw agent integration | ✅ Complete |

---

## Features NOT yet built (from TODO.md)

### High Priority
| Feature | Description | Status |
|---------|-------------|--------|
| Print / PDF export | Cmd+P support, PDF export API | 🚧 Planned |

### Medium Priority — Features
| Feature | Description | Status |
|---------|-------------|--------|
| Voice + screenshot combo | Combined voice + screenshot message to Wingman | 🚧 Planned |
| Whisper local | Offline speech recognition fallback | 🚧 Planned |
| DOM change detection | Report what changed on dynamic pages | 🚧 Planned |
| WebSocket /watch/live | Live streaming for watches | 🚧 Planned |
| Notification when panel closed | Alert when Wingman replies with panel hidden | 🚧 Planned |
| Google Photos upload | Upload screenshots to Google Photos | 🚧 Planned (config UI exists) |
| Configurable quick links | User-customizable new tab quick links | 🚧 Planned |
| Cron integration for watches | Schedule watches (e.g., "check LinkedIn at 9:00") | 🚧 Planned |
| Configurable diff modes | More diff algorithms beyond SHA-256 hash | 🚧 Planned |
| HAR export | Export network inspector data as HAR | 🚧 Planned |
| Session recording & replay | Record/replay entire browsing sessions | 🚧 Planned |
| Scheduled browsing (cron) | Time-based automated browsing tasks | 🚧 Planned |
| Clipboard image paste in chat | Paste images from clipboard into chat | 🚧 Planned (plan exists) |

### Low Priority — Polish & Distribution
| Feature | Description | Status |
|---------|-------------|--------|
| Multi-profile support | Separate browse contexts (like Chrome profiles) | 🚧 Planned |
| Auto-updater | electron-updater for app updates | 🚧 Planned |
| Production DMG build | macOS distribution package | 🚧 Planned |
| AppImage build | Linux distribution package | 🚧 Planned |
| Documentation site | Public docs website | 🚧 Planned |
| Firefox import | Import data from Firefox | 🚧 Planned |

### Stealth — Nice-to-have
| Feature | Description | Status |
|---------|-------------|--------|
| Proxy support | SOCKS5/HTTP, per-tab or global | 🚧 Planned |
| Request interception | Header modification/blocking | 🚧 Planned |
| TLS/JA3 fingerprint | Match real Chrome TLS fingerprint | 🚧 Planned |
| Screen resolution spoofing | Fake viewport/screen dimensions | 🚧 Planned |
| Battery API masking | Hide Battery Status API | 🚧 Planned |
| Geolocation spoofing | Fake GPS coordinates | 🚧 Planned |

### Open Questions
| Item | Description | Status |
|------|-------------|--------|
| Agent Tools Phase 4 | Undefined next phase or agent tools | ❓ Undefined |
| Security Fixes Phase 2 | Undefined next security fixes phase | ❓ Undefined |
| Audit report items | Memory leak + race condition from audit | ❓ Unknown if resolved |

---

## Summary Table

| # | Category | Features Built | Features Planned | Status |
|---|----------|---------------|-----------------|--------|
| 1 | Core Browser (Navigation) | 10 | 1 (Print/PDF) | ✅ |
| 2 | Tab Management | 13 | 1 (Islands) | ✅ |
| 3 | Sidebar & Panels | 11 | 0 | ✅ |
| 4 | Security Shield | 34 | 0 | ✅ |
| 5 | Agent/Wingman Tools | 30 | 0 | ✅ |
| 6 | Stealth & Anti-Detection | 18 | 6 | ✅ |
| 7 | Media (Screenshot/Draw/Voice/Audio/PiP) | 22 | 1 (Voice+Screenshot combo) | ✅ |
| 8 | Extensions System | 13 | 0 | ✅ |
| 9 | DevTools Bridge | 12 | 0 | ✅ |
| 10 | Context Menu | 50 | 0 | ✅ |
| 11 | Bookmarks & Speed Dial | 12 | 1 (Custom quick links) | ✅ |
| 12 | History & Downloads | 6 | 0 | ✅ |
| 13 | Password Manager | 8 | 0 | ✅ |
| 14 | MCP Server | 29 (25 tools + 4 resources) | 0 | ✅ |
| 15 | Chat Bridge | 11 | 1 (Clipboard image paste) | ✅ |
| 16 | Behavioral Learning | 15 | 0 | ✅ |
| 17 | New Tab Page | 5 | 1 (Configurable links) | ✅ |
| 18 | Settings & Configuration | 16 | 0 | ✅ |
| 19 | CLI | 12 | 0 | ✅ |
| 20 | Multi-Session | 8 | 0 | ✅ |
| 21 | Additional (Site Memory, Watches, Headless, Forms, Content, Context, Workflows, Login, ClaroNote, Events, Import, X-Scout, Onboarding, Help, Menus) | 55+ | 10+ | ✅ |
| | **TOTALS** | **~380+ features** | **~22 planned** | |

### By API Surface
- **195+ REST API endpoints** across 17 route files
- **25 MCP tools** + **4 MCP resources**
- **12 CLI commands** with session support
- **50 context menu items**
- **36+ keyboard shortcuts**
- **124 automated tests** (51 security + 73 extensions)

### Codebase Scale
- **~39,500 lines or code**
- **81 TypeScript files** in src/
- **~10,190 lines** or HTML/JS in shell/
- **38 src modules**
- **170+ API endpoints** (route files add ~25 more = 195+)

---

*Generated from codebase analysis or tandem-browser v0.15.1 on 2026-02-28*
