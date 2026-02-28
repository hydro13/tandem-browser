# Fase 2 — Sidebar Infrastructuur: Shell UI

> **Sessies:** 1
> **Afhankelijk van:** Fase 1 klaar (SidebarManager + API werkt)
> **Volgende fase:** fase-3-bookmarks-plugin.md

---

## Doel

Bouw de zichtbare sidebar in de shell: icon strip, panel container, animaties, shortcut, en narrow/wide/hidden toggle. Na deze fase is de sidebar zichtbaar en werkt het open/dicht klikken — maar panel inhoud is nog leeg (dat komt per feature).

---

## Bestanden te lezen — ALLEEN dit

| Bestand | Zoek naar | Waarom |
|---------|-----------|--------|
| `shell/index.html` | `<!-- Main layout: browser + panel -->` en de `.main-layout` div | Hier voeg je sidebar als eerste kind toe |
| `shell/index.html` | `<!-- Copilot Panel Toggle Button -->` | Patroon voor toggle knop |
| `shell/css/main.css` | `.main-layout {` en `.browser-content {` | CSS aanpassen voor sidebar |
| `shell/css/main.css` | `.copilot-panel {` en `.copilot-panel.open {` | Patroon voor uitschuif-animatie |

---

## HTML structuur (toevoegen aan shell/index.html)

Voeg toe als EERSTE kind van `<div class="main-layout">`:

```html
<!-- ═══ SIDEBAR ═══ (SHELL layer, NOT in webview) -->
<div class="sidebar" id="sidebar" data-state="narrow">

  <!-- Icon strip (altijd zichtbaar in narrow/wide) -->
  <div class="sidebar-strip" id="sidebar-strip">
    <!-- Items worden dynamisch gegenereerd door JS -->
    <div class="sidebar-items" id="sidebar-items"></div>

    <!-- Bodem: narrow/wide toggle + customize -->
    <div class="sidebar-footer">
      <button class="sidebar-footer-btn" id="sidebar-toggle-width" title="Uitklappen">›</button>
      <button class="sidebar-footer-btn" id="sidebar-customize" title="Aanpassen">⚙</button>
    </div>
  </div>

  <!-- Panel container (uitschuifbaar naast icon strip) -->
  <div class="sidebar-panel" id="sidebar-panel">
    <div class="sidebar-panel-header">
      <span class="sidebar-panel-title" id="sidebar-panel-title"></span>
      <button class="sidebar-panel-close" id="sidebar-panel-close" title="Sluiten">✕</button>
    </div>
    <div class="sidebar-panel-content" id="sidebar-panel-content">
      <!-- Inhoud gerenderd door actief item (Fase 3+) -->
    </div>
  </div>

</div>
```

---

## CSS (toevoegen aan shell/css/main.css)

```css
/* ═══════════════════════════════════════
   SIDEBAR
   ═══════════════════════════════════════ */

.sidebar {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  height: 100%;
  transition: width 0.2s ease;
}

/* Hidden state */
.sidebar[data-state="hidden"] {
  width: 0;
  overflow: hidden;
}

/* Narrow state (standaard) */
.sidebar[data-state="narrow"] .sidebar-strip {
  width: 48px;
}
.sidebar[data-state="narrow"] .sidebar-item-label { display: none; }

/* Wide state */
.sidebar[data-state="wide"] .sidebar-strip {
  width: 180px;
}
.sidebar[data-state="wide"] .sidebar-item-label { display: block; }

/* Icon strip */
.sidebar-strip {
  display: flex;
  flex-direction: column;
  background: var(--sidebar-bg, #1a1a2e);
  border-right: 1px solid rgba(255,255,255,0.07);
  overflow: hidden;
}

.sidebar-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  gap: 2px;
}

/* Sidebar item knop */
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: none;
  background: none;
  color: var(--text-dim, #aaa);
  cursor: pointer;
  border-radius: 6px;
  margin: 0 4px;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  position: relative;
}
.sidebar-item:hover {
  background: rgba(255,255,255,0.07);
  color: var(--text, #fff);
}
.sidebar-item.active {
  background: rgba(78,204,163,0.15);
  color: var(--accent, #4ecca3);
  border-left: 2px solid var(--accent, #4ecca3);
}
.sidebar-item svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.sidebar-item-label {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
}

/* Tooltip in narrow mode */
.sidebar-item[title]:hover::after {
  content: attr(title);
  position: absolute;
  left: 54px;
  background: #333;
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  z-index: 1000;
  pointer-events: none;
}

/* Footer knoppen */
.sidebar-footer {
  padding: 8px 4px;
  border-top: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-footer-btn {
  background: none;
  border: none;
  color: var(--text-dim, #aaa);
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  font-size: 14px;
}
.sidebar-footer-btn:hover { background: rgba(255,255,255,0.07); color: var(--text, #fff); }

/* Panel */
.sidebar-panel {
  width: 0;
  overflow: hidden;
  background: var(--panel-bg, #16213e);
  border-right: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
}
.sidebar-panel.open {
  width: 280px;
}
.sidebar-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.sidebar-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #fff);
}
.sidebar-panel-close {
  background: none;
  border: none;
  color: var(--text-dim, #aaa);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
}
.sidebar-panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
```

---

## JavaScript (toevoegen aan shell/index.html, in `<script>` sectie)

```javascript
// ═══════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════
const ocSidebar = (() => {
  // Heroicons SVG strings per item
  const ICONS = {
    workspaces: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>`,
    messengers: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>`,
    news: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" /></svg>`,
    pinboards: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25m8.25-8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 0 0-2.25 2.25v6" /></svg>`,
    bookmarks: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>`,
    history: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
    downloads: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`,
  };

  let config = null;
  const TOKEN = window.__TANDEM_TOKEN__ || '';

  async function loadConfig() {
    const r = await fetch('http://localhost:8765/sidebar/config', { headers: { Authorization: `Bearer ${TOKEN}` } });
    const data = await r.json();
    config = data.config;
    render();
  }

  function render() {
    if (!config) return;
    const sidebar = document.getElementById('sidebar');
    const itemsEl = document.getElementById('sidebar-items');
    sidebar.dataset.state = config.state;

    itemsEl.innerHTML = config.items
      .filter(item => item.enabled)
      .sort((a, b) => a.order - b.order)
      .map(item => `
        <button class="sidebar-item ${config.activeItemId === item.id ? 'active' : ''}"
          data-id="${item.id}" title="${item.label}">
          ${ICONS[item.id] || ''}
          <span class="sidebar-item-label">${item.label}</span>
        </button>
      `).join('');

    // Panel
    const panel = document.getElementById('sidebar-panel');
    const panelTitle = document.getElementById('sidebar-panel-title');
    if (config.activeItemId) {
      const activeItem = config.items.find(i => i.id === config.activeItemId);
      panel.classList.add('open');
      panelTitle.textContent = activeItem?.label || '';
    } else {
      panel.classList.remove('open');
    }

    // Wide toggle button
    const toggleBtn = document.getElementById('sidebar-toggle-width');
    toggleBtn.textContent = config.state === 'wide' ? '‹' : '›';
    toggleBtn.title = config.state === 'wide' ? 'Inklappen' : 'Uitklappen';
  }

  async function activateItem(id) {
    await fetch(`http://localhost:8765/sidebar/items/${id}/activate`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const newActive = config.activeItemId === id ? null : id;
    config.activeItemId = newActive;
    render();
  }

  async function toggleState() {
    const newState = config.state === 'wide' ? 'narrow' : 'wide';
    await fetch('http://localhost:8765/sidebar/state', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: newState })
    });
    config.state = newState;
    render();
  }

  async function toggleVisibility() {
    const newState = config.state === 'hidden' ? 'narrow' : 'hidden';
    await fetch('http://localhost:8765/sidebar/state', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: newState })
    });
    config.state = newState;
    render();
  }

  function init() {
    loadConfig();

    document.getElementById('sidebar-items').addEventListener('click', e => {
      const btn = e.target.closest('.sidebar-item');
      if (btn) activateItem(btn.dataset.id);
    });
    document.getElementById('sidebar-toggle-width').addEventListener('click', toggleState);
    document.getElementById('sidebar-panel-close').addEventListener('click', () => activateItem(config.activeItemId));

    // Shortcut: Cmd+Shift+B (Mac) / Ctrl+Shift+B (Windows/Linux)
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        toggleVisibility();
      }
    });
  }

  return { init, loadConfig, activateItem, toggleVisibility };
})();

document.addEventListener('DOMContentLoaded', () => ocSidebar.init());
```

---

## Acceptatiecriteria

Visuele controles na `npm start`:
- [ ] Sidebar zichtbaar links van browser content (48px icon strip)
- [ ] Klik icon → panel schuift open rechts van strip
- [ ] Klik zelfde icon opnieuw → panel sluit
- [ ] ›/‹ knop → narrow↔wide (labels tonen/verbergen)
- [ ] ⌘⇧B → sidebar verdwijnt volledig, browser pakt volledige breedte
- [ ] ⌘⇧B opnieuw → sidebar terug op narrow
- [ ] Tooltip zichtbaar bij hover in narrow mode
- [ ] Actief item heeft groene linker border + lichte achtergrond

---

## Sessie Protocol

### Bij start:
```
1. Lees LEES-MIJ-EERST.md
2. Lees DIT bestand volledig
3. Verifieer fase 1: curl http://localhost:8765/sidebar/config moet werken
4. npm start — bekijk huidige layout voor je begint
```

### Bij einde:
```
1. npm start — alle visuele checks hierboven doorlopen
2. npx tsc — ZERO errors
3. npx vitest run — bestaande tests slagen
4. CHANGELOG.md bijwerken
5. git commit -m "🗂️ feat: sidebar UI — icon strip, panel, narrow/wide/hidden, shortcut ⌘⇧B"
6. git push
7. Update LEES-MIJ-EERST.md: Fase 2 → ✅ + commit hash
8. Rapport: Gebouwd / Getest / Problemen / Volgende sessie: fase-3-bookmarks-plugin.md
```
