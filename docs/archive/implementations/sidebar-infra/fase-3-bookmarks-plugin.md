# Phase 3 — Sidebar Infrastructuur: First Plugin (Bookmarks)

> **Sessions:** 1
> **Depends on:** Phase 1 + 2 complete (sidebar visible, API works)
> **After this phase:** foundation compleet — next features bouwen own panels

---

## Goal

Bookmarks if first echte sidebar plugin — bewijs that the system works. Klik op Bookmarks icon → panel shows the bookmarks tree. Dit valideert the architectuur for alle next plugins (Workspaces, Messengers, etc.).

Bookmarks API exists already fully (`/bookmarks`, `/bookmarks/bar`, etc.). Dit is purely UI werk.

---

## Files to read — ONLY this

| File | Look for | Why |
|---------|-----------|--------|
| `shell/index.html` | `sidebar-panel-content` div (built in phase 2) | Hier rendert bookmark inhoud |
| `shell/index.html` | `ocSidebar` object (built in phase 2) | Plugin registratie pattern |
| `src/api/routes/data.ts` | `/bookmarks` GET endpoint | Existing API begrijpen |

---

## To Build

### Plugin system uitbreiden in `ocSidebar`

Voeg `registerPlugin(id, renderFn)` toe about the `ocSidebar` object:

```javascript
const plugins = {};

function registerPlugin(id, renderFn) {
  plugins[id] = renderFn;
}

// In render() — if panel opens, roep plugin about:
async function renderPanel(id) {
  const content = document.getElementById('sidebar-panel-content');
  content.innerHTML = '<div style="color:#aaa;padding:12px;font-size:12px;">Laden...</div>';
  if (plugins[id]) {
    await plugins[id](content);
  } else {
    content.innerHTML = `<div style="color:#aaa;padding:12px;font-size:12px;">${id} — still not beschikbaar</div>`;
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
          ${(item.children || []).folder(c => renderItem(c, depth + 1)).join('')}
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
      <div id="bm-list">${bookmarks.folder(b => renderItem(b)).join('')}</div>`;

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

> **Note:** `window.__TANDEM_IPC__?.navigateTo(url)` — check or this IPC bridge beschikbaar is in the shell. Zo not: usage `fetch('http://localhost:8765/navigate', { method:'POST', body: JSON.stringify({url}) })`.

---

## Acceptatiecriteria

- [ ] Klik Bookmarks icon in sidebar → panel opens with bookmark list
- [ ] Bookmarks stand if items + folders getoond
- [ ] Klikken op bookmark → navigeert browser to that URL
- [ ] Search input filtert bookmarks realtime
- [ ] Lege state (no bookmarks) shows nette message

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file fully
3. Verifieer phase 2: npm start → sidebar visible
4. curl http://localhost:8765/bookmarks → bookmarks data beschikbaar
```

### Bij einde:
```
1. npm start — visual controle: bookmark panel works
2. npx tsc — ZERO errors
3. npx vitest run — existing tests slagen
4. Update CHANGELOG.md
5. git commit -m "🗂️ feat: sidebar bookmarks plugin — first sidebar panel compleet"
6. git push
7. Update LEES-MIJ-EERST.md: Phase 3 → ✅ + commit hash
8. Rapport: Gebouwd / Getest / Problemen

SIDEBAR INFRASTRUCTURE COMPLETE — report back to Kees for the next feature choice.
```
