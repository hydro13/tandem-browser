# Tandem Browser - Linux Portatie Roadmap

## Fase 1: App Opstarten (10 min)

**Doel:** Tandem Browser start op Linux zonder crashes.

1. Clone repo: `git clone https://github.com/hydro13/tandem-browser.git`
2. `npm install`
3. Fix `package.json` — verwijder `xattr -cr` uit start script
4. Fix `scripts/run-electron.js` — verwijder absoluut pad van `lsof`
5. `npm start` — app moet starten

**Verificatie:** App window opent, nieuwe tab pagina is zichtbaar.

---

## Fase 2: Core Functionaliteit (15 min)

**Doel:** Browsen, tabs, en navigatie werken correct.

1. Fix tab bar padding (80px → 8px op Linux)
2. Test: nieuwe tab openen, URL invoeren, navigeren
3. Test: meerdere tabs, tabs sluiten, tab wisselen
4. Test: terug/vooruit/refresh knoppen
5. Test: zoom in/uit

**Verificatie:** Basis browser-functionaliteit werkt identiek aan macOS versie.

---

## Fase 3: Keyboard Shortcuts UI (20 min)

**Doel:** Alle shortcut-labels tonen "Ctrl+" in plaats van "Cmd+".

1. Maak een helper functie die platform detecteert
2. Update alle shortcut labels in `shell/index.html` (~26 plekken)
3. Update alle shortcut labels in `shell/help.html` (~26 plekken)
4. Update shortcut referenties in `shell/settings.html`
5. Update onboarding stappen (⌘ → Ctrl)

**Aanpak:** Voeg een JS functie toe die na DOMContentLoaded alle elements met class `.shortcut` en hardcoded `Cmd`/`⌘` tekst omzet.

**Verificatie:** Open help pagina (Ctrl+?), alle shortcuts tonen "Ctrl+".

---

## Fase 4: Chrome Import (5 min)

**Doel:** Bookmark import vindt Chrome data op Linux.

1. Fix `src/import/chrome-importer.ts` — voeg Linux pad toe: `~/.config/google-chrome/`
2. Optioneel: voeg Chromium pad toe: `~/.config/chromium/`
3. Test import vanuit Chrome bookmarks

**Verificatie:** Bookmarks bar toont geimporteerde Chrome bookmarks.

---

## Fase 5: Settings & Features (5 min)

**Doel:** Settings pagina is correct voor Linux.

1. Verberg "Apple Photos" toggle op Linux
2. Test screenshot functionaliteit (slaat op in ~/Pictures/Tandem)
3. Test voice input (Ctrl+Shift+M)
4. Test draw mode (Ctrl+Shift+D)

**Verificatie:** Settings pagina toont alleen relevante opties, screenshots werken.

---

## Fase 6: Polish & Platform Test (10 min)

**Doel:** Alles werkt smooth op Linux desktop environment.

1. Test window decoratie (CSD vs SSD) op je distro
2. Test fonts — overweeg `Ubuntu` of `Cantarell` toe te voegen aan font stack
3. Test tray icon (als beschikbaar)
4. Test app sluiten en herstarten
5. Test dat port 8765 correct opgeruimd wordt bij afsluiten
6. Volledige doorloop van alle features

**Verificatie:** App voelt native aan op Linux, geen macOS artefacten zichtbaar.

---

## Bestandenlijst per fase

| Fase | Bestanden |
|------|-----------|
| 1 | `package.json`, `scripts/run-electron.js` |
| 2 | `shell/index.html` (CSS) |
| 3 | `shell/index.html`, `shell/help.html`, `shell/settings.html` |
| 4 | `src/import/chrome-importer.ts` |
| 5 | `shell/settings.html`, `src/config/manager.ts` |
| 6 | `shell/index.html` (fonts), eventueel `src/main.ts` |

---

## Wat al cross-platform werkt (geen actie nodig)

- Electron pad in `run-electron.js` (heeft Linux branch)
- macOS quarantine check (gated achter `process.platform === 'darwin'`)
- Apple Photos import (gated achter `process.platform !== 'darwin'`)
- Menu accelerators (`CmdOrCtrl` pattern)
- `window-all-closed` handler (quit op non-macOS)
- Voice input (Web Speech API, platform-agnostic)
- Bookmark system (folders, subfolders, overflow knop)
- Draw mode overlay
- Kees AI panel
- WebSocket verbinding met OpenClaw
