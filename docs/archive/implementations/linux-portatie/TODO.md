# Tandem Browser - Linux Versie TODO

> Dit document is bedoeld for the Claude Code session op Linux that the macOS-specific code gaat aanpassen.
> The repo staat op: https://github.com/hydro13/tandem-browser (private)

## First stappen op Linux

```bash
git clone https://github.com/hydro13/tandem-browser.git
cd tandem-browser
npm install
npm start   # Zal waarschijnlijk falen vanwege xattr — that is bug #1
```

---

## CRITICAL — App start not without this fixes

### [ ] 1. Start script: `xattr` verwijderen out package.json
**File:** `package.json` regel 10
**Probleem:** `xattr -cr` is a macOS-only command (Gatekeeper quarantine). Exists not op Linux.

**Huidige code:**
```json
"start": "xattr -cr node_modules/electron/dist/Electron.app 2>/dev/null; npm run compile && node scripts/run-electron.js",
```

**Fix:**
```json
"start": "npm run compile && node scripts/run-electron.js",
```
> The xattr is already apart afgehandeld in `run-electron.js` with a `process.platform === 'darwin'` check.

---

### [ ] 2. Port cleanup: `/usr/sbin/lsof` pad fixen
**File:** `scripts/run-electron.js` regel 43
**Probleem:** `/usr/sbin/lsof` exists not op Linux (staat op `/usr/bin/lsof` or must via `fuser`/`ss`)

**Huidige code:**
```javascript
const pids = execSync('/usr/sbin/lsof -ti :8765 2>/dev/null', { encoding: 'utf8' }).trim();
```

**Fix:** Usage `lsof` without absoluut pad (zodat the op beide OS'and works):
```javascript
const pids = execSync('lsof -ti :8765 2>/dev/null', { encoding: 'utf8' }).trim();
```
> `lsof` staat op the meeste Linux distros in `$PATH`. Alternatief: `fuser 8765/tcp 2>/dev/null`.

---

### [ ] 3. Chrome bookmarks pad: platform-detection add
**File:** `src/import/chrome-importer.ts` rules 53-59
**Probleem:** Chrome data pad is hardcoded to macOS `~/Library/Application Support/Google/Chrome`

**Huidige code:**
```typescript
this.chromeBasePath = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Google',
  'Chrome'
);
```

**Fix:**
```typescript
if (process.platform === 'darwin') {
  this.chromeBasePath = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
} else if (process.platform === 'win32') {
  this.chromeBasePath = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
} else {
  this.chromeBasePath = path.join(os.homedir(), '.config', 'google-chrome');
}
```

---

## HIGH — Core UI issues op Linux

### [ ] 4. Tab bar padding: 80px for macOS traffic lights
**File:** `shell/index.html` regel 75
**Probleem:** 80px padding-left is ruimte for the macOS rode/gele/groene knoppen. That bestaan not op Linux.

**Huidige code:**
```css
.tab-bar {
  padding-left: 80px; /* macOS traffic lights */
}
```

**Fix — Optie A (simpel, via preload):**
In `shell/index.html`, bij initialisatie-JS:
```javascript
if (!navigator.platform.includes('Mac')) {
  document.querySelector('.tab-bar').style.paddingLeft = '8px';
}
```

**Fix — Optie B (via CSS custom property):**
```css
.tab-bar { padding-left: var(--tab-padding-left, 80px); }
```
Then in JS: `document.documentElement.style.setProperty('--tab-padding-left', '8px');` op non-macOS.

---

### [ ] 5. Keyboard shortcuts: "Cmd+" labels tonen if "Ctrl+" op Linux
**Files:** `shell/index.html`, `shell/help.html`, `shell/settings.html`
**Probleem:** Alle shortcut-labels are hardcoded if "Cmd+". Op Linux druk you Ctrl.

> **Belangrijk:** The Electron menu accelerators use already `CmdOrCtrl` (that werken dus). The gaat only to the DISPLAY text in the UI.

**Approach — maak a helper function:**
```javascript
const isMac = navigator.platform.includes('Mac');
const mod = isMac ? '⌘' : 'Ctrl+';
```

**Alle locaties that gewijzigd must be:**

**shell/index.html** (26 plekken):
| Regel | Huidig | Is |
|-------|--------|-------|
| 880 | `Cmd+T` | dynamisch `${mod}T` |
| 889 | `⌘D` | dynamisch |
| 890 | `⌘⇧S` | dynamisch |
| 946 | `⌘K` | dynamisch |
| 955 | `⌘⇧D` | dynamisch |
| 959 | `⌘⇧S` | dynamisch |
| 968 | `⌘⇧M` | dynamisch |
| 975 | `⌘?` | dynamisch |
| 1024 | `Cmd+D` | dynamisch |
| 3388-3464 | Alle `Cmd+X` shortcuts | dynamisch |

**shell/help.html** (26 plekken):
| Regel | Huidig |
|-------|--------|
| 277-370 | Alle `Cmd+X` shortcuts in shortcut tabel |
| 378-502 | `Cmd+X` in beschrijvende text |
| 527 | `Cmd+?` in title attribuut |

**shell/settings.html**:
| Regel | Huidig |
|-------|--------|
| 393 | `Cmd+Shift+B` |

**Beste approach:** Voeg at the top elke HTML file a script block toe that na DOMContentLoaded alle `.shortcut` elementen and title attributen update.

---

## MEDIUM — Feature aanpassingen

### [ ] 6. Apple Photos toggle verbergen/hernoemen in settings
**File:** `shell/settings.html` rules 438-442
**Probleem:** "Apple Photos" toggle has no function op Linux

**Fix:** Verberg op Linux, or hernoem to "System Photos Integration" and toon only op macOS:
```javascript
if (!navigator.platform.includes('Mac')) {
  document.getElementById('cfg-applePhotos')?.closest('.field')?.style.display = 'none';
}
```

### [ ] 7. Config: `applePhotos` property
**File:** `src/config/manager.ts` regel 25, 78
**Status:** Works already — staat default op `false`. Can eventueel hernoemd be to `systemPhotosIntegration` but is not strikt nodig.

### [ ] 8. Apple Photos import code
**File:** `src/draw/overlay.ts` rules 216-242
**Status:** Al platform-gated with `if (process.platform !== 'darwin') return;` — **no actie nodig**.

---

## LOW — Cosmetisch / Nice to have

### [ ] 9. Linux window decoratie
**Probleem:** Electron op Linux can CSD (Client Side Decorations) or SSD (Server Side) use. Test or `frame: true`/`false` goed works op you Linux distro (GNOME, KDE, etc.)

### [ ] 10. Font fallback
**File:** `shell/index.html` regel 58
**Huidige code:**
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```
**Status:** Fallback to Roboto/sans-serif is prima for Linux. Eventueel `'Ubuntu'`, `'Cantarell'` add for native look.

### [ ] 11. `window-all-closed` event
**File:** `src/main.ts` rules 667-671
**Status:** Al correct — app quit op non-macOS. No wijziging nodig.

---

## Samenvatting per prioriteit

| # | Prioriteit | Description | Geschatte effort |
|---|-----------|--------------|-----------------|
| 1 | CRITICAL | xattr out package.json | 1 min |
| 2 | CRITICAL | lsof pad fixen | 2 min |
| 3 | CRITICAL | Chrome pad per platform | 5 min |
| 4 | HIGH | Tab bar padding | 5 min |
| 5 | HIGH | Cmd→Ctrl labels (50+ plekken) | 20 min |
| 6 | MEDIUM | Apple Photos UI verbergen | 3 min |
| 7 | MEDIUM | Config property rename | 5 min |
| 8 | MEDIUM | (no actie) | - |
| 9 | LOW | Window decoratie testen | 10 min |
| 10 | LOW | Font fallback | 2 min |
| 11 | LOW | (no actie) | - |

**Totaal geschatte effort: ~50 minuten**

## Test Checklist na alle fixes

- [ ] `npm install` succesvol
- [ ] `npm start` start the app without errors
- [ ] Tab bar has no 80px lege ruimte links
- [ ] Shortcuts tonen "Ctrl+" in plaats or "Cmd+"
- [ ] Ctrl+T opens new tab
- [ ] Ctrl+W closes tab
- [ ] Ctrl+K opens Kees panel
- [ ] Bookmarks bar loads (if Chrome geinstalleerd is)
- [ ] Chrome bookmark import vindt the juiste database
- [ ] Bookmark dropdown folders and subfolders werken
- [ ] Settings page shows no "Apple Photos" toggle
- [ ] Voice input works (Ctrl+Shift+M)
- [ ] Draw mode works (Ctrl+Shift+D)
- [ ] Screenshots slaan op in ~/Pictures/Tandem
- [ ] App closes correct bij sluiten or alle vensters
