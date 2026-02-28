# Fase 3 — Sidebar Infrastructuur: Eerste Plugin (Bookmarks)

> **Sessies:** 1
> **Afhankelijk van:** Fase 1 + 2 klaar (sidebar zichtbaar, API werkt)
> **Na deze fase:** fundament compleet — volgende features bouwen eigen panels

---

## Doel

Bookmarks als eerste echte sidebar plugin — bewijs dat het systeem werkt. Klik op Bookmarks icon → panel toont de bookmarks tree. Dit valideert de architectuur voor alle volgende plugins (Workspaces, Messengers, etc.).

Bookmarks API bestaat al volledig (`/bookmarks`, `/bookmarks/bar`, etc.). Dit is puur UI werk.

---

## Bestanden te lezen — ALLEEN dit

| Bestand | Zoek naar | Waarom |
|---------|-----------|--------|
| `shell/index.html` | `sidebar-panel-content` div (gebouwd in fase 2) | Hier rendert bookmark inhoud |
| `shell/index.html` | `ocSidebar` object (gebouwd in fase 2) | Plugin registratie patroon |
| `src/api/routes/data.ts` | `/bookmarks` GET endpoint | Bestaande API begrijpen |

---

## Te bouwen

### Plugin systeem uitbreiden in `ocSidebar`

Voeg `registerPlugin(id, renderFn)` toe aan het `ocSidebar` object:

```javascript
const plugins = {};

function registerPlugin(id, renderFn) {
  plugins[id] = renderFn;
}

// In render() — als panel opent, roep plugin aan:
async function renderPanel(id) {
  const content = document.getElementById('sidebar-panel-content');
  content.innerHTML = '<div style="color:#aaa;padding:12px;font-size:12px;">Laden...</div>';
  if (plugins[id]) {
    await plugins[id](content);
  } else {
    content.innerHTML = `<div style="color:#aaa;padding:12px;font-size:12px;">${id} — nog niet beschikbaar</div>`;
  }
}
```

### Bookmarks plugin

```javascript
ocSidebar.registerPlugin('bookmarks', async (container) => {
  const TOKEN = window.__TANDEM_TOKEN__ || '';
  
  async function load() {
    const r = await fetch('http://localhost:8765/bookmarks', {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const { bookmarks } = await r.json();
    render(bookmarks);
  }

  function renderItem(item, depth = 0) {
    if (item.type === 'folder') {
      return `
        <div class="bm-folder" style="padding-left:${depth * 12}px">
          <div class="bm-folder-label">📁 ${item.name}</div>
          ${(item.children || []).map(c => renderItem(c, depth + 1)).join('')}
        </div>`;
    }
    return `
      <a class="bm-item" href="#" data-url="${item.url}" style="padding-left:${depth * 12 + 4}px"
        title="${item.url}">
        <img class="bm-favicon" src="https://www.google.com/s2/favicons?domain=${new URL(item.url || 'https://example.com').hostname}&sz=16" width="14" height="14" onerror="this.style.display='none'">
        <span class="bm-title">${item.name || item.url}</span>
      </a>`;
  }

  function render(bookmarks) {
    container.innerHTML = `
      <style>
        .bm-search { width:100%; padding:6px 8px; background:rgba(255,255,255,0.07);
          border:1px solid rgba(255,255,255,0.1); border-radius:6px; color:#fff;
          font-size:12px; margin-bottom:10px; }
        .bm-folder-label { font-size:11px; color:#aaa; padding:4px 0 2px; font-weight:600; }
        .bm-item { display:flex; align-items:center; gap:6px; padding:5px 4px;
          color:#ddd; text-decoration:none; font-size:12px; border-radius:4px; }
        .bm-item:hover { background:rgba(255,255,255,0.07); color:#fff; }
        .bm-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      </style>
      <input class="bm-search" id="bm-search" placeholder="Zoek bookmarks..." type="search">
      <div id="bm-list">${bookmarks.map(b => renderItem(b)).join('')}</div>`;

    // Navigate on click
    container.querySelectorAll('.bm-item').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        window.__TANDEM_IPC__?.navigateTo(a.dataset.url);
      });
    });

    // Search filter
    container.querySelector('#bm-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('.bm-item').forEach(a => {
        a.style.display = a.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  await load();
});
```

> **Note:** `window.__TANDEM_IPC__?.navigateTo(url)` — check of deze IPC bridge beschikbaar is in de shell. Zo niet: gebruik `fetch('http://localhost:8765/navigate', { method:'POST', body: JSON.stringify({url}) })`.

---

## Acceptatiecriteria

- [ ] Klik Bookmarks icon in sidebar → panel opent met bookmark lijst
- [ ] Bookmarks staan als items + mappen getoond
- [ ] Klikken op bookmark → navigeert browser naar die URL
- [ ] Search input filtert bookmarks realtime
- [ ] Lege state (geen bookmarks) toont nette melding

---

## Sessie Protocol

### Bij start:
```
1. Lees LEES-MIJ-EERST.md
2. Lees DIT bestand volledig
3. Verifieer fase 2: npm start → sidebar zichtbaar
4. curl http://localhost:8765/bookmarks → bookmarks data beschikbaar
```

### Bij einde:
```
1. npm start — visuele controle: bookmark panel werkt
2. npx tsc — ZERO errors
3. npx vitest run — bestaande tests slagen
4. CHANGELOG.md bijwerken
5. git commit -m "🗂️ feat: sidebar bookmarks plugin — eerste sidebar panel compleet"
6. git push
7. Update LEES-MIJ-EERST.md: Fase 3 → ✅ + commit hash
8. Rapport: Gebouwd / Getest / Problemen

SIDEBAR INFRASTRUCTUUR KLAAR — meld aan Kees voor volgende feature keuze.
```
