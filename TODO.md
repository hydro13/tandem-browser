# Tandem Browser — Roadmap & TODO

> Twee trappen, één fiets. 🚲
> Laatst bijgewerkt: 26 februari 2026

---

## Wat er gebouwd is (v0.1.0 – v0.10.0)

| Versie | Subsysteem | Regels |
|--------|-----------|--------|
| 0.1.0 | Core browser, stealth layer, API (:8765), copilot panel | ~3,000 |
| 0.2.0 | Tabs, bookmarks, history, downloads, find, draw, voice, settings, new tab, ClaroNote, behavioral observer, stealth (canvas/WebGL/font/audio/timing), workflows, audio capture, help page | ~8,000 |
| 0.3.0 | MCP server (15 tools, 4 resources), EventStream (SSE), ContextManager, ChatRouter, DualMode, Agent Autonomie (TaskManager, approval, noodrem), TabLockManager, X-Scout | ~3,500 |
| 0.4.0 | CDP DevTools Bridge (9 endpoints), Context Menu (6 phases), Chat Bridge, Copilot Vision | ~2,500 |
| 0.5.0 | Security Shield — 5-layer defense (811K+ blocklist, Guardian, OutboundGuard, ScriptGuard, Gatekeeper AI, EvolutionEngine) | ~3,500 |
| 0.6.0 | Agent Tools (script injection, semantic locators, device emulation), Electron v28→v40, security fixes | ~2,500 |
| 0.7.0 | Linux support, Liquid Glass Lite, UI vertaling NL→EN | ~700 |
| 0.8.0 | macOS vibrancy, Smart Scroll | ~300 |
| 0.9.0 | Security Upgrade — Shannon entropy, 25 YARA-rules, AST fingerprinting, CyberChef patterns, confidence pipeline, plugin architecture, 51 tests | ~4,800 |
| 0.10.0 | Browser Extensions — CRX downloader, gallery (30 ext), toolbar, native messaging, OAuth polyfill, auto-updates, conflict detection, 73 tests | ~3,000+ |
| — | Agent-Browser Gap features — /snapshot, /network/mock, /sessions, tandem CLI | ~2,000 |

**Totaal: ~39,500 regels code | 81 TS bestanden | 38 src modules | 170+ API endpoints | 124 tests**

---

## Openstaande items

### 🔴 Hoge prioriteit

- [x] **Password Manager** — lokale SQLite + AES-256-GCM database, master password, autofill, generator, `GET /passwords/suggest`, nooit cloud sync
- [ ] **Print / PDF export** — Cmd+P, PDF export API (print() alleen in context menu nu)
- [x] **Behavioral Learning modellen** — profiel compiler, typing bigram model, mouse Bézier curves, scroll/click/dagritme modellen, replay engine, fallback gaussians
- [x] **SPA Rendering bug** — `/page-content` retourneert lege content op dynamische pagina's (zie docs/plans/spa-rendering-bug.md)

### 🟡 Medium prioriteit — Features

- [ ] Voice + screenshot combo — combi-bericht naar Copilot
- [ ] Whisper lokaal — offline speech fallback
- [ ] DOM change detection — meld wat er veranderd is (niet alleen SPA wait)
- [ ] WebSocket /watch/live — live stream
- [ ] Notificatie bij gesloten paneel — als Copilot antwoordt
- [ ] Google Photos upload — config UI bestaat, upload code niet
- [ ] Configureerbare quick links — nu hardcoded in newtab.html
- [ ] Cron integratie watches — "check LinkedIn elke ochtend om 9:00"
- [ ] Configureerbare diff modes — meer dan SHA-256 hash
- [ ] HAR export — network inspector
- [ ] Session recording & replay
- [ ] Scheduled browsing (cron)
- [ ] Clipboard image paste in chat — plan klaar (docs/plans/clipboard-image-paste.md)

### 🟢 Lage prioriteit — Polish & Distributie

- [ ] Multi-profile support (gescheiden browse contexten)
- [ ] Auto-updater (electron-updater) — release/ heeft oud 0.1.0 manifest
- [ ] Productie DMG build (macOS) — up-to-date, correct genaamd
- [ ] AppImage build (Linux)
- [ ] Documentatie site
- [ ] Firefox import

### 🔵 Stealth — Nice-to-have

- [ ] Proxy support (SOCKS5/HTTP, per-tab of globaal)
- [ ] Request interception (headers wijzigen/blokkeren)
- [ ] TLS/JA3 fingerprint matching
- [ ] Screen resolution spoofing
- [ ] Battery API masking
- [ ] Geolocation spoofing

### ❓ Open vragen

- [ ] Agent Tools Phase 4 — wat zou dit zijn? (docs/agent-tools/STATUS.md vermeldt "next to implement")
- [ ] Security Fixes Phase 2 — wat zou dit zijn? (docs/security-fixes/STATUS.md)
- [ ] Audit-rapport items — memory leak + race condition uit docs/archive/AUDIT-REPORT.md: opgelost?

---

## Projectstructuur

```
tandem-browser/
├── src/                          # 81 TypeScript bestanden, 28,751 regels
│   ├── api/server.ts             # Express API (170+ endpoints)
│   ├── main.ts                   # Electron main process
│   ├── security/                 # 5-layer shield + intelligence upgrade
│   ├── extensions/               # Browser extension systeem (12 bestanden)
│   ├── snapshot/                 # Accessibility tree met @refs
│   ├── network/                  # Inspector + mocking
│   ├── sessions/                 # Multi-session isolatie
│   ├── mcp/                      # MCP protocol server
│   ├── agents/                   # TaskManager, X-Scout, TabLockManager
│   ├── devtools/                 # CDP bridge
│   └── ...                       # 28 andere modules
├── shell/                        # Browser UI (10,191 regels HTML/JS)
├── cli/                          # tandem CLI (@hydro13/tandem-cli)
├── docs/
│   ├── implementations/          # Voltooide implementatie-plannen
│   │   ├── ai-integratie/        # MCP, EventStream, ChatRouter, Autonomie
│   │   ├── agent-browser-gaps/   # Snapshot, mock, sessions, CLI
│   │   ├── linux-portatie/       # Linux portatie roadmap
│   │   ├── cdp-devtools/         # DevTools Bridge plannen
│   │   ├── context-menu/         # Context Menu plannen
│   │   ├── copilot-vision/       # Copilot Vision plannen
│   │   └── liquid-glass/         # Liquid Glass Lite docs
│   ├── plans/                    # Niet-geïmplementeerde plannen
│   ├── archive/                  # Historische documenten
│   ├── Browser-extensions/       # Extension systeem (10 phases)
│   ├── agent-tools/              # Agent tools (3 phases + phase 4 TBD)
│   ├── security-fixes/           # Security fixes
│   ├── security-shield/          # Security Shield (5 layers)
│   └── security-upgrade/         # Security Intelligence (9 phases)
├── scripts/                      # Test & launch scripts
├── skill/                        # OpenClaw skill file
├── release/                      # Build artifacts (DMG, ZIP)
├── README.md
├── PROJECT.md
├── CHANGELOG.md
├── AGENTS.md
└── TODO.md                       # ← dit bestand
```

---

*GitHub: `hydro13/tandem-browser` (privé) | Stack: Electron 40 + TypeScript + Express*
