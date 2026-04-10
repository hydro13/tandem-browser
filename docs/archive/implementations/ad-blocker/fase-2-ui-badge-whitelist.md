# Phase 2 — UI: Shield Badge + Blocked Count + Whitelist Toggle

> **Feature:** Ad Blocker
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** Phase 1 complete

---

## Goal or this fase

Build the visual ad blocker experience in the shell: a shield badge in the toolbar that shows the number or blocked requests per page, a clickable popup with blocked details, and a per-site whitelist toggle. After this phase Robin can visually see how many ads are blocked and can disable the ad blocker per site.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/adblock/manager.ts` | `class AdBlockManager`, `getBlockedCount()`, `getWhitelist()` | Data ophalen for badge |
| `shell/index.html` | `<div class="toolbar">`, `<div class="status-dot">` | Hier comes the shield badge bij |
| `shell/js/main.js` | Toolbar event handlers, webview navigatie events | Badge update bij page wissel |
| `shell/css/main.css` | `.toolbar`, `.status-dot` | Styling for shield badge |
| `src/ipc/handlers.ts` | `registerIpcHandlers()` | IPC handlers for badge data |

---

## To Build in this fase

### Step 1: Shield badge HTML

**Wat:** A schildje icon in the toolbar with a badge counter that the aantal blocked requests shows.

**File:** `shell/index.html`

**Zoek to:** `<button id="btn-screenshot"` (in the toolbar)

**Voeg toe vóór the screenshot knop:**

```html
<!-- Ad Blocker shield badge -->
<button class="adblock-shield" id="adblock-shield" title="Ad Blocker">
  🛡️
  <span class="adblock-count" id="adblock-count" style="display:none;">0</span>
</button>
```

### Step 2: Shield popup HTML

**Wat:** Popup that appears bij click op the schildje — shows blocked count and whitelist toggle.

**File:** `shell/index.html`

**Voeg toe na the toolbar div:**

```html
<!-- Ad Blocker popup -->
<div class="adblock-popup" id="adblock-popup" style="display:none;">
  <div class="adblock-popup-header">
    <span class="adblock-popup-icon">🛡️</span>
    <span class="adblock-popup-title">Ad Blocker</span>
    <label class="adblock-toggle">
      <input type="checkbox" id="adblock-global-toggle" checked>
      <span class="adblock-toggle-slider"></span>
    </label>
  </div>
  <div class="adblock-popup-stats">
    <div class="adblock-stat">
      <span class="adblock-stat-number" id="adblock-page-blocked">0</span>
      <span class="adblock-stat-label">blocked on this page</span>
    </div>
    <div class="adblock-stat">
      <span class="adblock-stat-number" id="adblock-total-blocked">0</span>
      <span class="adblock-stat-label">total blocked</span>
    </div>
  </div>
  <div class="adblock-popup-whitelist">
    <label>
      <input type="checkbox" id="adblock-site-whitelist">
      <span>Uitschakelen for <strong id="adblock-current-domain">this site</strong></span>
    </label>
  </div>
</div>
```

### Step 3: CSS for shield badge and popup

**Wat:** Styling for the schildje, the badge counter, and the whitelist popup.

**File:** `shell/css/main.css`

**Voeg toe:**

```css
/* Ad Blocker Shield */
.adblock-shield {
  position: relative;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}

.adblock-shield:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.adblock-shield.active {
  color: var(--accent);
}

.adblock-count {
  position: absolute;
  top: -2px;
  right: -4px;
  background: var(--accent);
  color: white;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 8px;
  min-width: 14px;
  text-align: center;
  line-height: 1.2;
}

/* Ad Blocker Popup */
.adblock-popup {
  position: absolute;
  top: calc(var(--toolbar-height, 36px) + var(--tab-bar-height, 36px) + 4px);
  right: 80px;
  background: var(--panel-bg, #1e1e2e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  width: 280px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 1000;
}

.adblock-popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.adblock-popup-title {
  font-weight: 600;
  flex: 1;
}

.adblock-popup-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
}

.adblock-stat-number {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
  display: block;
}

.adblock-stat-label {
  font-size: 10px;
  color: var(--text-dim);
}

.adblock-popup-whitelist {
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
}

.adblock-toggle {
  position: relative;
  width: 36px;
  height: 20px;
}

.adblock-toggle input {
  display: none;
}

.adblock-toggle-slider {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;
}

.adblock-toggle-slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  top: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.adblock-toggle input:checked + .adblock-toggle-slider {
  background: var(--accent);
}

.adblock-toggle input:checked + .adblock-toggle-slider::before {
  transform: translateX(16px);
}
```

### Step 4: Shell JavaScript — badge logica

**Wat:** Update the badge counter bij navigatie, toggle popup, whitelist management.

**File:** `shell/js/main.js`

**Add about:** Event handlers section

```javascript
// === AD BLOCKER UI ===

// Badge update: poll blocked count na navigatie
async function updateAdBlockBadge() {
  const tabId = getActiveTabId();
  const res = await fetch(`http://localhost:8765/adblock/stats`);
  const data = await res.json();
  const count = data.blockedPerTab?.[tabId] || 0;
  const badge = document.getElementById('adblock-count');
  const shield = document.getElementById('adblock-shield');
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = '';
    shield.classList.add('active');
  } else {
    badge.style.display = 'none';
    shield.classList.remove('active');
  }
}

// Popup toggle
document.getElementById('adblock-shield').addEventListener('click', () => {
  const popup = document.getElementById('adblock-popup');
  popup.style.display = popup.style.display === 'none' ? '' : 'none';
  if (popup.style.display !== 'none') {
    updateAdBlockPopup();
  }
});

// Whitelist toggle
document.getElementById('adblock-site-whitelist').addEventListener('change', async (e) => {
  const domain = getCurrentDomain();
  if (e.target.checked) {
    await fetch('http://localhost:8765/adblock/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
  } else {
    await fetch(`http://localhost:8765/adblock/whitelist/${domain}`, { method: 'DELETE' });
  }
  // Herlaad page zodat whitelist effect has
  getActiveWebview().reload();
});

// Update badge na elke navigatie
// Voeg toe about existing webview 'did-navigate' handler:
// updateAdBlockBadge();
```

### Stap 5: IPC for real-time badge updates

**Wat:** AdBlockManager stuurt IPC event `adblock-count-updated` to shell wanneer a request is blocked, zodat the badge real-time updatet without polling.

**File:** `src/adblock/manager.ts`

**Add about:** `incrementBlockedCount()` methode

```typescript
// Na count update:
if (this.win) {
  this.win.webContents.send('adblock-count-updated', {
    webContentsId,
    count: this.blockedCounts.get(webContentsId) || 0,
    totalBlocked: this.totalBlocked,
  });
}
```

**File:** `shell/js/main.js` — IPC listener:

```javascript
window.electronAPI.on('adblock-count-updated', (event, data) => {
  // Update badge if the for the actieve tab is
  if (data.webContentsId === getActiveWebContentsId()) {
    updateBadgeDisplay(data.count);
  }
});
```

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: Status na page laden
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/adblock/stats
# Verwacht: {"ok":true, "totalBlocked":N, "blockedPerTab":{...}}
```

**UI verificatie:**
- [ ] Shield badge visible in toolbar (🛡️)
- [ ] Badge shows getal na the laden or a ad-heavy site (bv. a nieuwssite)
- [ ] Klik op shield → popup appears with blocked statistics
- [ ] Popup shows "blocked on this page" and "total blocked"
- [ ] Whitelist toggle works: uitvinken → page herlaadt → ads verschijnen
- [ ] Check the whitelist toggle off again → ads are blocked again
- [ ] Globale toggle: ad blocker out → no more requests blocked
- [ ] Badge update is real-time (not only bij navigatie)
- [ ] Popup closes bij click erbuiten

**Compilatie verificatie:**
- [ ] `npx tsc` — zero errors
- [ ] `npx vitest run` — alle existing tests slagen
- [ ] `npm start` — app start without crashes

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-2-ui-badge-whitelist.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Read the files in the "Files to read" table above
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. Alle curl tests out "Acceptatiecriteria" uitvoeren
4. npx vitest run — alle existing tests blijven slagen
5. Update CHANGELOG.md with korte entry
6. git commit -m "🛡️ feat: ad blocker shield badge + whitelist UI"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next: Ad Blocker feature compleet ✅
```

---

## Bekende valkuilen

- [ ] Popup positioning: the popup must correct gepositioneerd are under the shield knop. Usage `getBoundingClientRect()` or the shield element.
- [ ] Popup dismiss: click erbuiten must the popup sluiten — usage document-level click handler
- [ ] Real-time badge: AdBlockManager has a referentie to `win` nodig for IPC — voeg this toe about constructor
- [ ] Current domain extractie: usage `new URL(webview.getURL()).hostname` — not `location.hostname` (that is the shell, not the page)
- [ ] TypeScript strict mode — no `any` buiten catch blocks
- [ ] Whitelist state in popup: bij openen, check or huidige site gewhitelist is and zet checkbox correct
