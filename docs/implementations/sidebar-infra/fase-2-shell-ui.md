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
  justify-content: center;
  gap: 10px;
  padding: 6px;
  border: none;
  background: none;
  color: var(--text-dim, #888);
  cursor: pointer;
  border-radius: 10px;
  margin: 0 6px;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  position: relative;
  width: 36px;
  height: 36px;
}
.sidebar-item:hover {
  background: rgba(255,255,255,0.1);
  color: var(--text, #fff);
}

/* Active indicator: gekleurde afgeronde vierkant (zoals Opera) */
.sidebar-item.active {
  background: rgba(78,204,163,0.25);
  color: var(--accent, #4ecca3);
}

/* Utility item SVG: outline grijs, wit bij hover/active */
.sidebar-item:not(.messenger-item) svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* Messenger item: gekleurde ronde achtergrond met wit brand logo erin */
.sidebar-item.messenger-item {
  padding: 0;
}
.sidebar-item.messenger-item .messenger-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s;
}
.sidebar-item.messenger-item:hover .messenger-icon {
  transform: scale(1.1);
}
.sidebar-item.messenger-item svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.sidebar-item.messenger-item.active {
  background: rgba(255,255,255,0.1);
}

.sidebar-item-label {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
}

/* Messenger separator lijn */
.sidebar-separator {
  height: 1px;
  background: rgba(255,255,255,0.08);
  margin: 6px 10px;
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
  // Icon definities — twee stijlen zoals Opera:
  // - Utility items: Heroicons outline (grijs, wordt wit bij hover/active)
  // - Messenger items: gekleurde brand icons op gekleurde ronde achtergrond
  const ICONS = {
    // === UTILITY ITEMS (Heroicons outline) ===
    workspaces: { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>`, brand: null },
    news:       { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" /></svg>`, brand: null },
    pinboards:  { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25m8.25-8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 0 0-2.25 2.25v6" /></svg>`, brand: null },
    bookmarks:  { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>`, brand: null },
    history:    { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`, brand: null },
    downloads:  { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`, brand: null },

    // === MESSENGER ITEMS (gekleurde brand icons, eigen achtergrond) ===
    // brand: achtergrondkleur voor de icon container
    whatsapp:  { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`, brand: '#25D366' },
    telegram:  { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`, brand: '#2AABEE' },
    discord:   { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.101 18.08.114 18.1.134 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`, brand: '#5865F2' },
    slack:     { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`, brand: '#4A154B' },
    instagram: { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`, brand: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' },
    x:         { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`, brand: '#000000' },
  };

  let config = null;
  const TOKEN = window.__TANDEM_TOKEN__ || '';

  async function loadConfig() {
    const r = await fetch('http://localhost:8765/sidebar/config', { headers: { Authorization: `Bearer ${TOKEN}` } });
    const data = await r.json();
    config = data.config;
    render();
  }

  const MESSENGER_IDS = ['whatsapp','telegram','discord','slack','instagram','x'];

  function renderItemHTML(item) {
    const icon = ICONS[item.id];
    const isActive = config.activeItemId === item.id;
    const isMessenger = MESSENGER_IDS.includes(item.id);

    if (isMessenger && icon?.brand) {
      const bg = icon.brand.startsWith('linear') ? icon.brand : icon.brand;
      return `
        <button class="sidebar-item messenger-item ${isActive ? 'active' : ''}"
          data-id="${item.id}" title="${item.label}">
          <div class="messenger-icon" style="background:${bg}">
            ${icon.svg}
          </div>
        </button>`;
    }
    return `
      <button class="sidebar-item ${isActive ? 'active' : ''}"
        data-id="${item.id}" title="${item.label}">
        ${icon?.svg || ''}
        <span class="sidebar-item-label">${item.label}</span>
      </button>`;
  }

  function render() {
    if (!config) return;
    const sidebar = document.getElementById('sidebar');
    const itemsEl = document.getElementById('sidebar-items');
    sidebar.dataset.state = config.state;

    const sorted = config.items.filter(i => i.enabled).sort((a, b) => a.order - b.order);
    const utility = sorted.filter(i => !MESSENGER_IDS.includes(i.id));
    const messengers = sorted.filter(i => MESSENGER_IDS.includes(i.id));

    // Utility items bovenaan, separator, dan messengers
    itemsEl.innerHTML =
      utility.map(renderItemHTML).join('') +
      (messengers.length ? '<div class="sidebar-separator"></div>' : '') +
      messengers.map(renderItemHTML).join('');

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
