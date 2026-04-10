# Phase 4 — Tab Context Menu: "Add to Pinboard"

> **Feature:** Pinboards
> **Priority:** HIGH — #1 pijnpunt Robin
> **Depends on:** Phase 1 (backend API) ✅ done

---

## Goal

"Add to Pinboard" add about the **tab rechtermuisklik menu** (the custom DOM menu in shell/index.html). Wanneer geklikt → submenu with alle boards → pin aangemaakt for that tab.

---

## Existing code to read

| File | Look for | Why |
|---------|-----------|--------|
| `shell/index.html` | `showTabContextMenu(` | Hier the submenu add |
| `shell/index.html` | `wsWorkspaces` array and "Move to workspace" submenu | Exact hetzelfde pattern use for boards submenu |
| `shell/index.html` | `TOKEN` const | Auth header for fetch |
| `shell/index.html` | `pbCreateBoard`, `pbState` | Begrijpen hoe pinboard state works |

---

## Wat te bouwen

### In `showTabContextMenu()` — new menu item add

Na "Move to Workspace" submenu, vóór "Mute Tab":

```javascript
// Add to Pinboard submenu
{ type: 'separator' },
{
  label: 'Add to Pinboard',
  icon: '📌',
  submenu: async () => {
    // Fetch boards list
    const res = await fetch('http://localhost:8765/pinboards', {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    return (data.boards || []).folder(board => ({
      label: `${board.emoji} ${board.name}`,
      click: async () => {
        const tab = tabs.get(tabId); // tabId from context menu scope
        await fetch(`http://localhost:8765/pinboards/${board.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({
            type: 'link',
            url: tab.url,
            title: tab.title,
          })
        });
        // Visual feedback: brief flash on tab
        const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tabEl) {
          tabEl.classList.add('pin-flash');
          setTimeout(() => tabEl.classList.remove('pin-flash'), 600);
        }
      }
    }));
  }
}
```

### Hoe the tab context menu works (read this goed!)

The menu in `showTabContextMenu()` is a **custom DOM menu** — NOT a native Electron menu. Look at how the "Move to Workspace" submenu is built: it loads workspaces synchronously and builds submenu items as DOM elements.

**Probleem:** The fetch for boards is async but the context menu is sync built. **Oplossing:** Boards ophalen VOORDAT the menu getoond is, then boards meegeven about `showTabContextMenu()`.

### Approach

1. In the `contextmenu` event op `.tab` elementen: fetch boards eerst, then `showTabContextMenu(tabId, x, y, boards)`
2. In `showTabContextMenu()`: parameter `boards` add, submenu direct bouwen without async

### CSS — pin-flash animatie

```css
.tab.pin-flash {
  animation: pinFlash 0.6s ease;
}
@keyframes pinFlash {
  0%   { background: var(--tab-bg); }
  30%  { background: rgba(99, 102, 241, 0.4); } /* indigo flash */
  100% { background: var(--tab-bg); }
}
```

---

## Acceptatiecriteria

```
1. Rechtermuisklik op tab → context menu shows "Add to Pinboard" submenu
2. Submenu shows alle existing boards with emoji
3. Board aanklikken → pin aangemaakt (POST /pinboards/:id/items)
4. Tab flitst kort indigo op if bevestiging
5. If er no boards are: "No boards yet" disabled item tonen
6. npx tsc — zero errors
```

---

## Sessie Protocol

### Bij start:
```
1. Read docs/implementations/pinboards/LEES-MIJ-EERST.md
2. Read this file fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Read shell/index.html → zoek showTabContextMenu() and the workspace submenu implementatie
```

### Bij einde:
```
1. npx tsc — ZERO errors
2. Visual getest: tab rechtermuisklik → "Add to Pinboard" → board kiezen → pin aangemaakt
3. Update CHANGELOG.md
4. git commit -m "feat: add 'Add to Pinboard' to tab context menu"
5. git push
6. Rapport: wat built, hoe getest, problemen
```
