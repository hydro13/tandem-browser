# Fase 4 — Tab Context Menu: "Add to Pinboard"

> **Feature:** Pinboards
> **Prioriteit:** HOOG — #1 pijnpunt Robin
> **Afhankelijk van:** Fase 1 (backend API) ✅ klaar

---

## Doel

"Add to Pinboard" toevoegen aan het **tab rechtermuisklik menu** (het custom DOM menu in shell/index.html). Wanneer geklikt → submenu met alle boards → pin aangemaakt voor die tab.

---

## Bestaande code te lezen

| Bestand | Zoek naar | Waarom |
|---------|-----------|--------|
| `shell/index.html` | `showTabContextMenu(` | Hier het submenu toevoegen |
| `shell/index.html` | `wsWorkspaces` array en "Move to workspace" submenu | Exact hetzelfde patroon gebruiken voor boards submenu |
| `shell/index.html` | `TOKEN` const | Auth header voor fetch |
| `shell/index.html` | `pbCreateBoard`, `pbState` | Begrijpen hoe pinboard state werkt |

---

## Wat te bouwen

### In `showTabContextMenu()` — nieuw menu item toevoegen

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
    return (data.boards || []).map(board => ({
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

### Hoe het tab context menu werkt (lees dit goed!)

Het menu in `showTabContextMenu()` is een **custom DOM menu** — GEEN native Electron menu. Kijk hoe "Move to Workspace" submenu gebouwd is: het laadt workspaces synchroon en bouwt submenu items als DOM elementen.

**Probleem:** De fetch voor boards is async maar het context menu wordt sync gebouwd. **Oplossing:** Boards ophalen VOORDAT het menu getoond wordt, dan boards meegeven aan `showTabContextMenu()`.

### Aanpak

1. In het `contextmenu` event op `.tab` elementen: fetch boards eerst, dan `showTabContextMenu(tabId, x, y, boards)`
2. In `showTabContextMenu()`: parameter `boards` toevoegen, submenu direct bouwen zonder async

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
1. Rechtermuisklik op tab → context menu toont "Add to Pinboard" submenu
2. Submenu toont alle bestaande boards met emoji
3. Board aanklikken → pin aangemaakt (POST /pinboards/:id/items)
4. Tab flitst kort indigo op als bevestiging
5. Als er geen boards zijn: "No boards yet" disabled item tonen
6. npx tsc — zero errors
```

---

## Sessie Protocol

### Bij start:
```
1. Lees docs/implementations/pinboards/LEES-MIJ-EERST.md
2. Lees dit bestand volledig
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Lees shell/index.html → zoek showTabContextMenu() en de workspace submenu implementatie
```

### Bij einde:
```
1. npx tsc — ZERO errors
2. Visueel getest: tab rechtermuisklik → "Add to Pinboard" → board kiezen → pin aangemaakt
3. CHANGELOG.md bijwerken
4. git commit -m "feat: add 'Add to Pinboard' to tab context menu"
5. git push
6. Rapport: wat gebouwd, hoe getest, problemen
```
