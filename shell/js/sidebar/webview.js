/**
 * Sidebar webview cache + panel mounting — keeps Electron <webview> sessions alive
 * across panel switches and detaches them safely before innerHTML wipes.
 *
 * Loaded from: shell/js/sidebar/index.js (and shell/js/sidebar/panels/history.js,
 *   which calls hideWebviews + safeSetPanelHTML before rendering)
 * window exports: none
 */

export const COMMUNICATION_IDS = ['calendar','gmail','whatsapp','telegram','discord','slack','instagram','x'];

const WEBVIEW_URLS = {
  calendar: 'https://calendar.google.com',
  gmail: 'https://mail.google.com',
  whatsapp: 'https://web.whatsapp.com',
  telegram: 'https://web.telegram.org',
  discord: 'https://discord.com/app',
  slack: 'https://app.slack.com',
  instagram: 'https://www.instagram.com',
  x: 'https://x.com',
};

// === WEBVIEW MODULE ===
const webviewCache = new Map();

// Google services share the same session partition so one login covers all
const WEBVIEW_PARTITIONS = {
  calendar: 'persist:gmail',  // Calendar + Gmail = same Google account
};

// URL patterns that must open as real popup windows (auth flows)
// Keep these specific to avoid blocking in-app navigation in messengers
const AUTH_URL_PATTERNS = [
  'accounts.google.com',
  'google.com/o/oauth2',
  'google.com/ServiceLogin',
  'google.com/accounts',
  'appleid.apple.com',
  'login.microsoftonline.com',
  'github.com/login/oauth',
];

export function getOrCreateWebview(id) {
  if (webviewCache.has(id)) return webviewCache.get(id);
  const url = WEBVIEW_URLS[id];
  if (!url) return null;
  const wv = document.createElement('webview');
  wv.src = url;
  wv.partition = WEBVIEW_PARTITIONS[id] || `persist:${id}`;
  wv.className = 'sidebar-webview';
  wv.setAttribute('allowpopups', '');
  // Override user agent for apps that need Chrome
  const chromeUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  wv.useragent = chromeUA;
  // Route new-window events: auth URLs → real popup (via setWindowOpenHandler in main.ts)
  //                          everything else → load inside webview
  wv.addEventListener('new-window', (e) => {
    const isAuth = e.url && AUTH_URL_PATTERNS.some(p => e.url.includes(p));
    if (isAuth) return; // don't preventDefault → main.ts setWindowOpenHandler handles it
    e.preventDefault();
    if (e.url && e.url.startsWith('http')) wv.loadURL(e.url);
  });
  webviewCache.set(id, wv);
  return wv;
}

export function loadWebviewInPanel(id) {
  const content = document.getElementById('sidebar-panel-content');

  // Hide all webviews but keep them in the DOM (preserves login state)
  webviewCache.forEach(wv => { wv.style.display = 'none'; });

  const wv = getOrCreateWebview(id);
  if (!wv) return;

  // Mount in panel-content if not already there — never remove after first mount
  if (!content.contains(wv)) {
    content.appendChild(wv);
  }

  wv.style.display = 'flex';
  content.classList.add('webview-mode');
}

export function hideWebviews() {
  webviewCache.forEach(wv => { wv.style.display = 'none'; });
  const content = document.getElementById('sidebar-panel-content');
  if (content) content.classList.remove('webview-mode');
}

// Safe innerHTML setter: moves webviews to a detached fragment first,
// sets innerHTML (which would otherwise destroy them), then re-appends.
// This prevents Electron from killing webview sessions on DOM wipe.
export function safeSetPanelHTML(html) {
  const content = document.getElementById('sidebar-panel-content');
  if (!content) return;
  // Detach webviews before innerHTML wipe
  const detached = [];
  webviewCache.forEach((wv, id) => {
    if (content.contains(wv)) {
      content.removeChild(wv);
      detached.push({ id, wv });
    }
  });
  content.innerHTML = html;
  // Re-attach webviews (hidden) so they stay alive
  detached.forEach(({ wv }) => {
    wv.style.display = 'none';
    content.appendChild(wv);
  });
}

export function getWebview(id) { return webviewCache.get(id); }
export function hasWebview(id) { return webviewCache.has(id); }
