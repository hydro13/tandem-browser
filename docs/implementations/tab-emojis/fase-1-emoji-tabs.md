# Phase 1 — Emoji Tabs: Volledige implementatie

> **Feature:** Tab Emojis
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal or this fase

Bouw the full Tab Emojis feature in één session: uitbreiding or the `Tab` data model with a emoji-field, API endpoints to emoji's te zetten and verwijderen, persistentie in `~/.tandem/tab-emojis.json`, and a emoji picker popup in the shell tab bar.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/tabs/manager.ts` | `class TabManager`, `interface Tab`, `openTab()`, `updateTab()`, `constructor()` | Hier comes the emoji-field and persistentie-logica bij |
| `src/api/routes/tabs.ts` | `function registerTabRoutes()` | Hier komen the emoji endpoints bij |
| `shell/index.html` | Tab bar HTML (`#tab-bar`), tab creatie JS (`createTab`), tab element structuur (`.tab` div with kinderen) | Hier comes the emoji badge and picker popup bij |
| `shell/css/main.css` | `.tab`, `.tab-favicon`, `.tab-title`, `.tab-source` | Snap the existing tab-element layout for badge positioning |
| `AGENTS.md` | — (read fully) | Anti-detect rules and code stijl |

---

## To Build in this fase

### Step 1: Tab interface uitbreiden with emoji field

**Wat:** Voeg a optional `emoji` field toe about the `Tab` interface.

**File:** `src/tabs/manager.ts`

**Aanpassen in:** `interface Tab`

```typescript
export interface Tab {
  // ... existing velden ...
  emoji?: string;  // Optioneel emoji-badge for visual identificatie
}
```

### Step 2: Emoji persistentie — laden and save

**Wat:** Voeg methodes toe about `TabManager` to emoji's op te slaan in `~/.tandem/tab-emojis.json` and te laden bij initialisatie. Emoji's be opgeslagen per genormaliseerde URL (hostname + pathname).

**File:** `src/tabs/manager.ts`

**Add about:** `class TabManager`

```typescript
import fs from 'fs';
import path from 'path';
import { tandemDir } from '../utils/paths';

// In class TabManager:
private emojiMap: Folder<string, string> = new Folder(); // normalizedUrl → emoji

constructor(win: BrowserWindow) {
  this.win = win;
  this.loadEmojis();  // ← add about existing constructor
}

private getEmojiFilePath(): string {
  return path.join(tandemDir(), 'tab-emojis.json');
}

private loadEmojis(): void {
  try {
    const filePath = this.getEmojiFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this.emojiMap = new Folder(Object.entries(data));
    }
  } catch (e) {
    // Silently ignore — file doesn't exist yet or is corrupt
  }
}

private saveEmojis(): void {
  try {
    const filePath = this.getEmojiFilePath();
    const data = Object.fromEntries(this.emojiMap);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    // Log but don't crash
    console.warn('Failed to save tab emojis:', e);
  }
}

private normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}
```

### Step 3: setEmoji() and clearEmoji() methodes

**Wat:** Publieke methodes to emoji op a tab te zetten or te verwijderen. Slaat automatisch op and stuurt IPC event to the shell.

**File:** `src/tabs/manager.ts`

**Add about:** `class TabManager`

```typescript
setEmoji(tabId: string, emoji: string): boolean {
  const tab = this.tabs.get(tabId);
  if (!tab) return false;

  tab.emoji = emoji;

  // Persist per URL
  if (tab.url && tab.url !== 'about:blank') {
    const key = this.normalizeUrl(tab.url);
    this.emojiMap.set(key, emoji);
    this.saveEmojis();
  }

  // Notify shell
  this.win.webContents.send('tab-emoji-changed', { tabId, emoji });
  return true;
}

clearEmoji(tabId: string): boolean {
  const tab = this.tabs.get(tabId);
  if (!tab) return false;

  const oldEmoji = tab.emoji;
  tab.emoji = undefined;

  // Remove from persistence
  if (tab.url && tab.url !== 'about:blank') {
    const key = this.normalizeUrl(tab.url);
    this.emojiMap.delete(key);
    this.saveEmojis();
  }

  // Notify shell
  this.win.webContents.send('tab-emoji-changed', { tabId, emoji: null });
  return true;
}

/** Restore emoji from persistence when a tab navigates to a URL */
restoreEmojiForUrl(tabId: string, url: string): void {
  const key = this.normalizeUrl(url);
  const emoji = this.emojiMap.get(key);
  if (emoji) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.emoji = emoji;
      this.win.webContents.send('tab-emoji-changed', { tabId, emoji });
    }
  }
}
```

### Step 4: Emoji herstellen bij navigatie

**Wat:** Wanneer `updateTab()` is aangeroepen with a new URL, check or er a opgeslagen emoji is for that URL.

**File:** `src/tabs/manager.ts`

**Aanpassen in:** `updateTab()` methode

```typescript
updateTab(tabId: string, updates: Partial<Pick<Tab, 'title' | 'url' | 'favicon'>>): void {
  const tab = this.tabs.get(tabId);
  if (!tab) return;
  if (updates.title !== undefined) tab.title = updates.title;
  if (updates.url !== undefined) {
    tab.url = updates.url;
    // Restore emoji for new URL if one was saved
    this.restoreEmojiForUrl(tabId, updates.url);
  }
  if (updates.favicon !== undefined) tab.favicon = updates.favicon;
}
```

### Stap 5: API endpoints

**Wat:** Twee new endpoints: POST to emoji te zetten, DELETE to te verwijderen.

**File:** `src/api/routes/tabs.ts`

**Add about:** `function registerTabRoutes()`

```typescript
// === TAB EMOJIS ===

router.post('/tabs/:id/emoji', async (req: Request, res: Response) => {
  const { emoji } = req.body;
  if (!emoji) { res.status(400).json({ error: 'emoji required' }); return; }
  try {
    const ok = ctx.tabManager.setEmoji(req.params.id, emoji);
    if (!ok) { res.status(404).json({ error: 'Tab not found' }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/tabs/:id/emoji', async (req: Request, res: Response) => {
  try {
    const ok = ctx.tabManager.clearEmoji(req.params.id);
    if (!ok) { res.status(404).json({ error: 'Tab not found' }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

### Stap 6: Shell — emoji badge in tab element

**Wat:** Voeg a emoji-badge `<span>` toe about elk tab element, vóór the favicon. Luister to the `tab-emoji-changed` IPC event to the badge te updaten.

**File:** `shell/index.html`

**Aanpassen in:** Tab creatie function (zoek to waar `.tab` div is opbuilt with `tab-source`, `group-dot`, `tab-favicon`, etc.)

```javascript
// In the tab creatie function, na tab-source span:
const emojiEl = document.createElement('span');
emojiEl.className = 'tab-emoji';
emojiEl.style.display = 'none';
tabEl.insertBefore(emojiEl, tabEl.querySelector('.tab-favicon'));

// IPC listener for emoji updates:
window.electronAPI.on('tab-emoji-changed', (event, { tabId, emoji }) => {
  const entry = tabs.get(tabId);
  if (!entry) return;
  const emojiEl = entry.tabEl.querySelector('.tab-emoji');
  if (emoji) {
    emojiEl.textContent = emoji;
    emojiEl.style.display = '';
  } else {
    emojiEl.textContent = '';
    emojiEl.style.display = 'none';
  }
});
```

### Stap 7: Shell — emoji picker popup

**Wat:** Voeg a emoji picker toe that appears wanneer the user op a "+" knop hoverd/clicks op a tab. The picker is a simpel grid or populaire emoji's.

**File:** `shell/index.html`

**Add about:** Na the tab bar HTML, a hidden popup element + JS logica

```html
<!-- Emoji Picker Popup -->
<div id="emoji-picker" class="emoji-picker" style="display:none;">
  <div class="emoji-picker-grid">
    <!-- Populaire emoji's — is gevuld door JS -->
  </div>
  <button class="emoji-picker-remove" title="Delete emoji">✕ Delete</button>
</div>
```

```javascript
// === EMOJI PICKER ===
const POPULAR_EMOJIS = [
  '🔥', '⭐', '💡', '🎯', '🚀', '💻', '📚', '🧪',
  '🎨', '🔧', '📝', '🎵', '🌍', '💬', '📊', '🔒',
  '❤️', '✅', '⚡', '🏠', '🎮', '📸', '🛒', '💰',
  '🤖', '🧠', '🔍', '📱', '🎬', '🍕', '☕', '🌟',
];

const pickerEl = document.getElementById('emoji-picker');
const pickerGrid = pickerEl.querySelector('.emoji-picker-grid');
let pickerTargetTabId = null;

// Vul grid
for (const emoji or POPULAR_EMOJIS) {
  const btn = document.createElement('button');
  btn.className = 'emoji-picker-btn';
  btn.textContent = emoji;
  btn.addEventListener('click', () => {
    if (pickerTargetTabId) {
      fetch(`/tabs/${pickerTargetTabId}/emoji`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
    }
    hideEmojiPicker();
  });
  pickerGrid.appendChild(btn);
}

// Delete-knop
pickerEl.querySelector('.emoji-picker-remove').addEventListener('click', () => {
  if (pickerTargetTabId) {
    fetch(`/tabs/${pickerTargetTabId}/emoji`, { method: 'DELETE' });
  }
  hideEmojiPicker();
});

function showEmojiPicker(tabEl, tabId) {
  pickerTargetTabId = tabId;
  const rect = tabEl.getBoundingClientRect();
  pickerEl.style.left = rect.left + 'px';
  pickerEl.style.top = (rect.bottom + 4) + 'px';
  pickerEl.style.display = '';
}

function hideEmojiPicker() {
  pickerEl.style.display = 'none';
  pickerTargetTabId = null;
}

// Closes picker bij click buiten
document.addEventListener('click', (e) => {
  if (!pickerEl.contains(e.target) && !e.target.closest('.tab-emoji-trigger')) {
    hideEmojiPicker();
  }
});
```

### Stap 8: Emoji trigger knop op tab hover

**Wat:** Voeg a kleine "+" knop toe about elk tab element that appears op hover. Klikken opens the emoji picker.

**File:** `shell/index.html`

**Aanpassen in:** Tab creatie function

```javascript
// In the tab creatie function:
const emojiTrigger = document.createElement('button');
emojiTrigger.className = 'tab-emoji-trigger';
emojiTrigger.textContent = '+';
emojiTrigger.title = 'Emoji toewijzen';
emojiTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  showEmojiPicker(tabEl, tabId);
});
tabEl.insertBefore(emojiTrigger, tabEl.querySelector('.tab-close'));
```

### Stap 9: CSS styling

**Wat:** Styling for the emoji badge, trigger knop, and picker popup.

**File:** `shell/css/main.css`

**Add about:** Na the existing `.tab` styling

```css
/* === TAB EMOJIS === */

.tab-emoji {
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}

.tab-emoji-trigger {
  opacity: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: var(--text-dim);
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s;
  margin-left: auto;
}

.tab:hover .tab-emoji-trigger {
  opacity: 0.6;
}

.tab-emoji-trigger:hover {
  opacity: 1 !important;
  background: rgba(255, 255, 255, 0.2);
}

/* Emoji Picker Popup */
.emoji-picker {
  position: fixed;
  z-index: 10000;
  background: var(--bg-secondary, #1e1e2e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.emoji-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}

.emoji-picker-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  border-radius: 4px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s;
}

.emoji-picker-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.emoji-picker-remove {
  width: 100%;
  margin-top: 4px;
  padding: 4px;
  border: none;
  background: rgba(233, 69, 96, 0.1);
  color: var(--accent, #e94560);
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}

.emoji-picker-remove:hover {
  background: rgba(233, 69, 96, 0.2);
}
```

---

## Acceptatiecriteria — this must werken na the session

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Test 1: Open a tab
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/open \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com"}'
# Verwacht: {"ok":true, "tab": {"id": "tab-2", ...}}

# Test 2: Zet emoji op tab
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/tab-2/emoji \
  -H "Content-Type: application/json" \
  -d '{"emoji": "🔥"}'
# Verwacht: {"ok":true}

# Test 3: Verifieer emoji in tab list
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/tabs/list
# Verwacht: tab-2 has "emoji": "🔥"

# Test 4: Delete emoji
curl -H "Authorization: Bearer $TOKEN" \
  -X DELETE http://localhost:8765/tabs/tab-2/emoji
# Verwacht: {"ok":true}

# Test 5: Emoji op not-existing tab
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/fake-id/emoji \
  -H "Content-Type: application/json" \
  -d '{"emoji": "⭐"}'
# Verwacht: 404 {"error": "Tab not found"}

# Test 6: Persistentie check
cat ~/.tandem/tab-emojis.json
# Verwacht: JSON object with URL → emoji mappings
```

**UI verificatie:**
- [ ] Emoji badge visible vóór the favicon in the tab
- [ ] Hover op tab → "+" knop appears
- [ ] Klik op "+" → emoji picker popup opens under the tab
- [ ] Klik op emoji → badge appears, picker closes
- [ ] "Delete" knop in picker → emoji disappears
- [ ] Na app herstart → emoji's are terug (persistentie works)

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-1-emoji-tabs.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Read the files in the "Files to read" table above
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. Alle curl tests out "Acceptatiecriteria" uitvoeren
4. Visual verificatie: neem screenshots or emoji badges op tabs
5. npx vitest run — alle existing tests blijven slagen
6. Update CHANGELOG.md with korte entry
7. git commit -m "😀 feat: tab emojis — badge, picker, persistence"
8. git push
9. Rapport:
   ## Gebouwd
   ## Getest (plak curl output + screenshots)
   ## Problemen
   ## Feature compleet ✅
```

---

## Bekende valkuilen

- [ ] TypeScript: `fs` and `path` imports must at the top `manager.ts` stand — check or ze already geïmporteerd are (waarschijnlijk not, want the huidige manager uses no filesystem)
- [ ] `tandemDir()` function importeren out `../utils/paths` — check that this pad klopt vanuit `src/tabs/manager.ts`
- [ ] Emoji picker positionering: if the tab helemaal rechts staat, can the picker buiten the scherm vallen — voeg bounds-checking toe
- [ ] `Tab` interface wijzigt (new field `emoji?`) — existing code that `Tab` objecten aanmaakt (bv. `registerInitialTab()`) must no errors krijgen (the field is optional, dus this is veilig)
- [ ] `saveEmojis()` bij elk setEmoji/clearEmoji can veel disk I/O are bij snel clicking — overweeg debouncing, but for v1 is sync write acceptabel
