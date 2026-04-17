/**
 * Bookmarks store — single source of truth for the renderer.
 *
 * All bookmark HTTP I/O lives here. UIs call the mutation methods and
 * subscribe() to re-render on change. No UI should fetch /bookmarks or
 * call mutation endpoints directly — that's how the sidebar + top bar
 * drift out of sync.
 *
 * Loaded from: shell/index.html (as <script type="module">), shell/js/sidebar/panels/bookmarks.js (via import)
 * window exports: window.__TANDEM_BOOKMARKS_STORE__ (for classic-script consumers like browser-tools.js)
 * Ready signal: dispatches 'tandem:bookmarks-store-ready' on window when available.
 */

const API = 'http://localhost:8765';
const token = () => window.__TANDEM_TOKEN__ || '';
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token()}`,
});

let _tree = null;    // root folder node { id, children, ... }
let _bar = [];       // flat array for the top bookmarks bar (first 30 items)
let _loaded = false; // true after the first successful load()
const _subscribers = new Set();

function notify() {
  for (const fn of _subscribers) {
    try { fn(); } catch (err) { console.error('[bookmarks-store] subscriber threw', err); }
  }
}

/**
 * Fetch the bookmark tree + bar from the API and notify subscribers.
 * Mutation methods call this after their HTTP call returns.
 */
export async function load() {
  try {
    // cache: 'no-store' — the Electron renderer HTTP cache would otherwise
    // serve a stale /bookmarks response, causing the top bar to show the
    // pre-mutation list even after a rename (the classic "one rename behind"
    // symptom). Every load() must hit the backend.
    const res = await fetch(`${API}/bookmarks`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = await res.json();
    // The backend returns `bookmarks` as an array of ROOT folders (Bookmarks Bar,
    // Other Bookmarks, etc. — Chrome-import can produce multiple roots). The top
    // bookmarks bar reads `data.bar`, which is the children of the "Bookmarks Bar"
    // folder (see BookmarkManager.getBarItems). To stay in sync, the sidebar must
    // navigate that SAME root — not blindly `bookmarks[0]`, which may be a
    // different root entirely (e.g. "Other Bookmarks") that happens to contain
    // folders with the same names. This caused the same visual path to show
    // different content in the two UIs.
    const roots = data.bookmarks || [];
    const barRoot = roots.find(b => b.name === 'Bookmarks Bar' || b.name === 'Bladwijzerbalk');
    _tree = barRoot || roots[0] || { children: [] };
    _bar = (data.bar || []).slice(0, 30);
    _loaded = true;
    notify();
  } catch { /* ignore — API not ready yet */ }
}

export function getTree() { return _tree; }
export function getBar() { return _bar; }
export function isLoaded() { return _loaded; }

/** Is the given URL already bookmarked? Returns { bookmarked, bookmark }. */
export async function check(url) {
  try {
    const res = await fetch(`${API}/bookmarks/check?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: 'no-store',
    });
    if (!res.ok) return { bookmarked: false, bookmark: null };
    return await res.json();
  } catch {
    return { bookmarked: false, bookmark: null };
  }
}

export async function add({ name, url, parentId }) {
  await fetch(`${API}/bookmarks/add`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, url, parentId }),
  });
  await load();
}

export async function addFolder({ name, parentId }) {
  await fetch(`${API}/bookmarks/add-folder`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, parentId }),
  });
  await load();
}

export async function remove(id) {
  await fetch(`${API}/bookmarks/remove`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ id }),
  });
  await load();
}

/** Update a bookmark or folder. Pass { id, name } for a folder; { id, name, url } for a bookmark. */
export async function update({ id, name, url }) {
  const body = url !== undefined ? { id, name, url } : { id, name };
  await fetch(`${API}/bookmarks/update`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await load();
}

export async function move({ id, parentId }) {
  await fetch(`${API}/bookmarks/move`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ id, parentId }),
  });
  await load();
}

/** Search is read-only — does not mutate the store or notify subscribers. */
export async function search(q) {
  try {
    const res = await fetch(`${API}/bookmarks/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/** Subscribe to change notifications. Returns an unsubscribe function. */
export function subscribe(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

// Bridge for classic-script consumers (browser-tools.js is a classic script,
// so it cannot `import` — it accesses the store via this window global).
// The ready event lets browser-tools defer its subscribe() call until the
// module has loaded (modules defer past classic scripts in the HTML).
window.__TANDEM_BOOKMARKS_STORE__ = {
  load, getTree, getBar, isLoaded, check, add, addFolder, remove, update, move, search, subscribe,
};
window.dispatchEvent(new CustomEvent('tandem:bookmarks-store-ready'));
