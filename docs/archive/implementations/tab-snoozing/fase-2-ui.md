# Phase 2 — Tab Snoozing: Shell UI + Right-click Menu

> **Feature:** Tab Snoozing
> **Sessions:** 1
> **Depends on:** Phase 1 complete (SnoozeManager + API works)

---

## Goal or this fase

Voeg UI toe: 💤 visual badge op sleeping tabs, right-click context menu with snooze opties, and a snooze-manager panel to alle snoozed tabs te zien.

---

## Existing Code to Read — ONLY This

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `shell/index.html` | `// === TAB BAR ===`, tab render functies, `// === CONTEXT MENU ===` | Tab badge add + context menu uitbreiden |
| `src/api/routes/tabs.ts` | `registerTabRoutes()` | Phase 1 endpoints ter referentie |

---

## To Build in this fase

### Step 1: 💤 Badge op snoozed tabs (shell/index.html)

Zoek the tab-render function (function that a tab HTML-element aanmaakt) and voeg toe:

```javascript
// In the tab-render function, na the favicon:
if (tab.snoozed) {
  tabEl.classList.add('tab--snoozed');
  tabEl.querySelector('.tab-favicon').textContent = '💤';
  tabEl.title = `Snoozed: ${tab.title} (click to te laden)`;
}
```

CSS add:
```css
.tab--snoozed {
  opacity: 0.5;
  font-style: italic;
}
.tab--snoozed .tab-favicon {
  filter: grayscale(1);
}
```

### Step 2: Right-click context menu snooze opties

Zoek the tab-context-menu builder and voeg toe:

```javascript
// In the tab right-click context menu:
{ label: '💤 Snooze for 1 hour', click: () => snoozeTab(tab.id, 60) },
{ label: '💤 Snooze until tomorrow', click: () => snoozeTabUntilTomorrow(tab.id) },
{ label: '💤 Snooze indefinitely', click: () => snoozeTab(tab.id) },
// If tab already snoozed:
{ label: '▶️ Wake tab', click: () => wakeTab(tab.id) },

async function snoozeTab(tabId, minutes) {
  const until = minutes
    ? new Date(Date.now() + minutes * 60000).toISOString()
    : undefined;
  await fetch(`http://localhost:8765/tabs/${tabId}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
    body: JSON.stringify({ until })
  });
  refreshTabBar(); // herlaad tab bar
}

async function wakeTab(tabId) {
  await fetch(`http://localhost:8765/tabs/${tabId}/wake`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  refreshTabBar();
}
```

### Step 3: Klik op snoozed tab wekt hem op

In the tab-click handler:
```javascript
if (tab.snoozed) {
  await wakeTab(tab.id);
  return; // not switchen, wake doet that
}
```

### Step 4: Snooze Manager mini-panel (optional — if tijd over is)

Klein panel in the wingman panel "Tabs" section that snoozed tabs shows:
```javascript
async function loadSnoozedTabs() {
  const { tabs } = await fetch('/tabs/snoozed', { headers: { Authorization: ... } }).then(r => r.json());
  return tabs.folder(t => `
    <div class="snoozed-tab">
      <span>💤 ${t.title}</span>
      <small>${t.url}</small>
      <button onclick="wakeTab('${t.tabId}')">Wake</button>
    </div>
  `).join('');
}
```

---

## Acceptatiecriteria

- [ ] Gesnoozede tab shows 💤 icon in tab bar and is visual gedimmed
- [ ] Right-click op tab shows snooze opties
- [ ] Right-click op snoozed tab shows "Wake tab"
- [ ] Klikken op snoozed tab wekt hem op and navigeert terug to the URL
- [ ] Snooze "1 hour" stelt correcte tijdstempel in
- [ ] "Snooze until tomorrow" wekt op to 09:00 next ochtend

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file fully
3. Verifieer phase 1: curl http://localhost:8765/tabs/snoozed — must werken
4. npx tsc && git status
```

### Bij einde:
```
1. npm start — visual testen: tab snoozen, badge zien, waken
2. npx tsc — ZERO errors
3. npx vitest run — existing tests slagen
4. Update CHANGELOG.md
5. git commit -m "💤 feat: tab snoozing UI — badge, context menu, wake on click"
6. git push
7. Rapport: Gebouwd / Getest / Problemen
```
