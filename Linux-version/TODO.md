# Tandem Browser - Linux Versie TODO

> Dit document is bedoeld voor de Claude Code sessie op Linux die de macOS-specifieke code gaat aanpassen.
> De repo staat op: https://github.com/hydro13/tandem-browser (private)

## Eerste stappen op Linux

```bash
git clone https://github.com/hydro13/tandem-browser.git
cd tandem-browser
npm install
npm start   # Zal waarschijnlijk falen vanwege xattr — dat is bug #1
```

---

## CRITICAL — App start niet zonder deze fixes

### [ ] 1. Start script: `xattr` verwijderen uit package.json
**File:** `package.json` regel 10
**Probleem:** `xattr -cr` is een macOS-only command (Gatekeeper quarantine). Bestaat niet op Linux.

**Huidige code:**
```json
"start": "xattr -cr node_modules/electron/dist/Electron.app 2>/dev/null; npm run compile && node scripts/run-electron.js",
```

**Fix:**
```json
"start": "npm run compile && node scripts/run-electron.js",
```
> De xattr wordt al apart afgehandeld in `run-electron.js` met een `process.platform === 'darwin'` check.

---

### [ ] 2. Port cleanup: `/usr/sbin/lsof` pad fixen
**File:** `scripts/run-electron.js` regel 43
**Probleem:** `/usr/sbin/lsof` bestaat niet op Linux (staat op `/usr/bin/lsof` of moet via `fuser`/`ss`)

**Huidige code:**
```javascript
const pids = execSync('/usr/sbin/lsof -ti :8765 2>/dev/null', { encoding: 'utf8' }).trim();
```

**Fix:** Gebruik `lsof` zonder absoluut pad (zodat het op beide OS'en werkt):
```javascript
const pids = execSync('lsof -ti :8765 2>/dev/null', { encoding: 'utf8' }).trim();
```
> `lsof` staat op de meeste Linux distros in `$PATH`. Alternatief: `fuser 8765/tcp 2>/dev/null`.

---

### [ ] 3. Chrome bookmarks pad: platform-detectie toevoegen
**File:** `src/import/chrome-importer.ts` regels 53-59
**Probleem:** Chrome data pad is hardcoded naar macOS `~/Library/Application Support/Google/Chrome`

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

### [ ] 4. Tab bar padding: 80px voor macOS traffic lights
**File:** `shell/index.html` regel 75
**Probleem:** 80px padding-left is ruimte voor de macOS rode/gele/groene knoppen. Die bestaan niet op Linux.

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
Dan in JS: `document.documentElement.style.setProperty('--tab-padding-left', '8px');` op non-macOS.

---

### [ ] 5. Keyboard shortcuts: "Cmd+" labels tonen als "Ctrl+" op Linux
**Files:** `shell/index.html`, `shell/help.html`, `shell/settings.html`
**Probleem:** Alle shortcut-labels zijn hardcoded als "Cmd+". Op Linux druk je Ctrl.

> **Belangrijk:** De Electron menu accelerators gebruiken al `CmdOrCtrl` (die werken dus). Het gaat alleen om de DISPLAY tekst in de UI.

**Aanpak — maak een helper functie:**
```javascript
const isMac = navigator.platform.includes('Mac');
const mod = isMac ? '⌘' : 'Ctrl+';
```

**Alle locaties die gewijzigd moeten worden:**

**shell/index.html** (26 plekken):
| Regel | Huidig | Wordt |
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
| 378-502 | `Cmd+X` in beschrijvende tekst |
| 527 | `Cmd+?` in title attribuut |

**shell/settings.html**:
| Regel | Huidig |
|-------|--------|
| 393 | `Cmd+Shift+B` |

**Beste aanpak:** Voeg bovenaan elke HTML file een script block toe dat na DOMContentLoaded alle `.shortcut` elementen en title attributen update.

---

## MEDIUM — Feature aanpassingen

### [ ] 6. Apple Photos toggle verbergen/hernoemen in settings
**File:** `shell/settings.html` regels 438-442
**Probleem:** "Apple Photos" toggle heeft geen functie op Linux

**Fix:** Verberg op Linux, of hernoem naar "System Photos Integration" en toon alleen op macOS:
```javascript
if (!navigator.platform.includes('Mac')) {
  document.getElementById('cfg-applePhotos')?.closest('.field')?.style.display = 'none';
}
```

### [ ] 7. Config: `applePhotos` property
**File:** `src/config/manager.ts` regel 25, 78
**Status:** Werkt al — staat default op `false`. Kan eventueel hernoemd worden naar `systemPhotosIntegration` maar is niet strikt nodig.

### [ ] 8. Apple Photos import code
**File:** `src/draw/overlay.ts` regels 216-242
**Status:** Al platform-gated met `if (process.platform !== 'darwin') return;` — **geen actie nodig**.

---

## LOW — Cosmetisch / Nice to have

### [ ] 9. Linux window decoratie
**Probleem:** Electron op Linux kan CSD (Client Side Decorations) of SSD (Server Side) gebruiken. Test of `frame: true`/`false` goed werkt op je Linux distro (GNOME, KDE, etc.)

### [ ] 10. Font fallback
**File:** `shell/index.html` regel 58
**Huidige code:**
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```
**Status:** Fallback naar Roboto/sans-serif is prima voor Linux. Eventueel `'Ubuntu'`, `'Cantarell'` toevoegen voor native look.

### [ ] 11. `window-all-closed` event
**File:** `src/main.ts` regels 667-671
**Status:** Al correct — app quit op non-macOS. Geen wijziging nodig.

---

## Samenvatting per prioriteit

| # | Prioriteit | Beschrijving | Geschatte effort |
|---|-----------|--------------|-----------------|
| 1 | CRITICAL | xattr uit package.json | 1 min |
| 2 | CRITICAL | lsof pad fixen | 2 min |
| 3 | CRITICAL | Chrome pad per platform | 5 min |
| 4 | HIGH | Tab bar padding | 5 min |
| 5 | HIGH | Cmd→Ctrl labels (50+ plekken) | 20 min |
| 6 | MEDIUM | Apple Photos UI verbergen | 3 min |
| 7 | MEDIUM | Config property rename | 5 min |
| 8 | MEDIUM | (geen actie) | - |
| 9 | LOW | Window decoratie testen | 10 min |
| 10 | LOW | Font fallback | 2 min |
| 11 | LOW | (geen actie) | - |

**Totaal geschatte effort: ~50 minuten**

## Test Checklist na alle fixes

- [ ] `npm install` succesvol
- [ ] `npm start` start de app zonder errors
- [ ] Tab bar heeft geen 80px lege ruimte links
- [ ] Shortcuts tonen "Ctrl+" in plaats van "Cmd+"
- [ ] Ctrl+T opent nieuwe tab
- [ ] Ctrl+W sluit tab
- [ ] Ctrl+K opent Kees panel
- [ ] Bookmarks bar laadt (als Chrome geinstalleerd is)
- [ ] Chrome bookmark import vindt de juiste database
- [ ] Bookmark dropdown folders en subfolders werken
- [ ] Settings pagina toont geen "Apple Photos" toggle
- [ ] Voice input werkt (Ctrl+Shift+M)
- [ ] Draw mode werkt (Ctrl+Shift+D)
- [ ] Screenshots slaan op in ~/Pictures/Tandem
- [ ] App sluit correct bij sluiten van alle vensters
