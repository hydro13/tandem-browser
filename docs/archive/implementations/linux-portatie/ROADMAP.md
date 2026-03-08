# Tandem Browser - Linux Portatie Roadmap

## Phase 1: App Opstarten (10 min)

**Goal:** Tandem Browser start op Linux without crashes.

1. Clone repo: `git clone https://github.com/hydro13/tandem-browser.git`
2. `npm install`
3. Fix `package.json` — delete `xattr -cr` out start script
4. Fix `scripts/run-electron.js` — delete absoluut pad or `lsof`
5. `npm start` — app must starten

**Verificatie:** App window opens, new tab page is visible.

---

## Phase 2: Core Functionaliteit (15 min)

**Goal:** Browsen, tabs, and navigatie werken correct.

1. Fix tab bar padding (80px → 8px op Linux)
2. Test: new tab openen, URL invoeren, navigeren
3. Test: multiple tabs, tabs sluiten, tab wisselen
4. Test: terug/vooruit/refresh knoppen
5. Test: zoom in/out

**Verificatie:** Basis browser-functionaliteit works identiek about macOS versie.

---

## Phase 3: Keyboard Shortcuts UI (20 min)

**Goal:** Alle shortcut-labels tonen "Ctrl+" in plaats or "Cmd+".

1. Maak a helper function that platform detecteert
2. Update alle shortcut labels in `shell/index.html` (~26 plekken)
3. Update alle shortcut labels in `shell/help.html` (~26 plekken)
4. Update shortcut referenties in `shell/settings.html`
5. Update onboarding stappen (⌘ → Ctrl)

**Approach:** Voeg a JS function toe that na DOMContentLoaded alle elements with class `.shortcut` and hardcoded `Cmd`/`⌘` text omzet.

**Verificatie:** Open help page (Ctrl+?), alle shortcuts tonen "Ctrl+".

---

## Phase 4: Chrome Import (5 min)

**Goal:** Bookmark import vindt Chrome data op Linux.

1. Fix `src/import/chrome-importer.ts` — voeg Linux pad toe: `~/.config/google-chrome/`
2. Optioneel: voeg Chromium pad toe: `~/.config/chromium/`
3. Test import vanuit Chrome bookmarks

**Verificatie:** Bookmarks bar shows geimporteerde Chrome bookmarks.

---

## Phase 5: Settings & Features (5 min)

**Goal:** Settings page is correct for Linux.

1. Verberg "Apple Photos" toggle op Linux
2. Test screenshot functionaliteit (slaat op in ~/Pictures/Tandem)
3. Test voice input (Ctrl+Shift+M)
4. Test draw mode (Ctrl+Shift+D)

**Verificatie:** Settings page shows only relevante opties, screenshots werken.

---

## Phase 6: Polish & Platform Test (10 min)

**Goal:** Alles works smooth op Linux desktop environment.

1. Test window decoratie (CSD vs SSD) op you distro
2. Test fonts — overweeg `Ubuntu` or `Cantarell` toe te voegen about font stack
3. Test tray icon (if beschikbaar)
4. Test app sluiten and herstarten
5. Test that port 8765 correct opgeruimd is bij afsluiten
6. Volledige doorloop or alle features

**Verificatie:** App voelt native about op Linux, no macOS artefacten visible.

---

## Bestandenlijst per fase

| Phase | Files |
|------|-----------|
| 1 | `package.json`, `scripts/run-electron.js` |
| 2 | `shell/index.html` (CSS) |
| 3 | `shell/index.html`, `shell/help.html`, `shell/settings.html` |
| 4 | `src/import/chrome-importer.ts` |
| 5 | `shell/settings.html`, `src/config/manager.ts` |
| 6 | `shell/index.html` (fonts), eventueel `src/main.ts` |

---

## Wat already cross-platform works (no actie nodig)

- Electron pad in `run-electron.js` (has Linux branch)
- macOS quarantine check (gated achter `process.platform === 'darwin'`)
- Apple Photos import (gated achter `process.platform !== 'darwin'`)
- Menu accelerators (`CmdOrCtrl` pattern)
- `window-all-closed` handler (quit op non-macOS)
- Voice input (Web Speech API, platform-agnostic)
- Bookmark system (folders, subfolders, overflow knop)
- Draw mode overlay
- Kees AI panel
- WebSocket verbinding with OpenClaw
