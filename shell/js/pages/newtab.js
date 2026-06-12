const API = window.tandemApi?.baseUrl() || window.__TANDEM_API_BASE__ || 'http://127.0.0.1:8765';
const searchInput = document.getElementById('search');
const quickLinksContainer = document.getElementById('quick-links');
const editQuickLinksButton = document.getElementById('edit-quick-links');
const fallbackQuickLinks = [
  { label: 'DuckDuckGo', url: 'https://duckduckgo.com' },
  { label: 'Google', url: 'https://google.com' },
  { label: 'GitHub', url: 'https://github.com/hydro13' },
  { label: 'X', url: 'https://x.com/Robin_waslander' },
  { label: 'LinkedIn', url: 'https://linkedin.com/in/robinwaslander' },
  { label: 'YouTube', url: 'https://youtube.com' },
];

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const q = searchInput.value.trim();
    if (!q) return;

    // If it looks like a URL, navigate directly
    if (/^https?:\/\//i.test(q) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(q)) {
      const parsedUrl = parseSafeNavigationUrl(q.startsWith('http') ? q : 'https://' + q);
      if (parsedUrl) {
        window.location.assign(parsedUrl.href);
        return;
      }
    } else {
      // Search with DuckDuckGo
      window.location.assign('https://duckduckgo.com/?q=' + encodeURIComponent(q));
      return;
    }

    window.location.assign('https://duckduckgo.com/?q=' + encodeURIComponent(q));
  }
});

function createQuickLinkFallback(label) {
  const fallback = document.createElement('span');
  fallback.className = 'quick-link-fallback';
  fallback.textContent = (label || '?').trim().slice(0, 2).toUpperCase();
  return fallback;
}

function getFaviconUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return '';
  }
}

function parseSafeNavigationUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl, window.location.href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildEmptyState(className, text) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}

function renderQuickLinks(links) {
  quickLinksContainer.replaceChildren();

  if (!Array.isArray(links) || links.length === 0) {
    quickLinksContainer.appendChild(buildEmptyState('quick-links-empty', 'No quick links configured'));
    return;
  }

  for (const link of links) {
    if (!link || !link.label || !link.url) continue;
    const parsedUrl = parseSafeNavigationUrl(link.url);
    if (!parsedUrl) continue;

    const anchor = document.createElement('a');
    anchor.className = 'quick-link';
    anchor.href = parsedUrl.toString();

    const iconWrap = document.createElement('div');
    iconWrap.className = 'icon';

    const faviconUrl = getFaviconUrl(parsedUrl.toString());
    if (faviconUrl) {
      const img = document.createElement('img');
      img.src = faviconUrl;
      img.alt = link.label;
      img.addEventListener('error', () => {
        iconWrap.replaceChildren(createQuickLinkFallback(link.label));
      }, { once: true });
      iconWrap.appendChild(img);
    } else {
      iconWrap.appendChild(createQuickLinkFallback(link.label));
    }

    const label = document.createElement('span');
    label.textContent = link.label;

    anchor.appendChild(iconWrap);
    anchor.appendChild(label);
    quickLinksContainer.appendChild(anchor);
  }

  if (!quickLinksContainer.children.length) {
    quickLinksContainer.appendChild(buildEmptyState('quick-links-empty', 'No quick links configured'));
  }
}

async function loadQuickLinks() {
  try {
    const res = await fetch(`${API}/config`);
    if (!res.ok) throw new Error('config load failed');
    const config = await res.json();
    renderQuickLinks(config.general?.quickLinks || []);
  } catch {
    renderQuickLinks(fallbackQuickLinks);
  }
}

window.addEventListener('tandem-quick-links-changed', () => {
  void loadQuickLinks();
});

editQuickLinksButton.addEventListener('click', () => {
  window.location.href = window.__tandemInternalUrl ? window.__tandemInternalUrl('settings.html', '#general') : 'settings.html#general';
});

// Load recent tabs from API
async function loadRecentTabs() {
  const container = document.getElementById('recent-tabs');
  try {
    const res = await fetch(`${API}/tabs/list`);
    const data = await res.json();

    container.replaceChildren();

    if (data.tabs && data.tabs.length > 0) {
      const recentTabs = data.tabs
        .filter(t => typeof t?.url === 'string' && !t.url.includes('newtab.html'))
        .slice(0, 5);

      for (const tab of recentTabs) {
        const parsedUrl = parseSafeNavigationUrl(tab.url);
        if (!parsedUrl) continue;

        const anchor = document.createElement('a');
        anchor.className = 'recent-tab';
        anchor.href = parsedUrl.toString();

        const img = document.createElement('img');
        img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsedUrl.hostname)}&sz=32`;
        img.alt = '';

        const title = document.createElement('span');
        title.textContent = tab.title || parsedUrl.toString();

        const hostname = document.createElement('span');
        hostname.className = 'url';
        hostname.textContent = parsedUrl.hostname;

        anchor.appendChild(img);
        anchor.appendChild(title);
        anchor.appendChild(hostname);
        container.appendChild(anchor);
      }

      if (!container.children.length) {
        container.appendChild(buildEmptyState('', 'No recent tabs'));
      }
    } else {
      container.appendChild(buildEmptyState('', 'No recent tabs'));
    }
  } catch {
    container.replaceChildren(buildEmptyState('', 'No recent tabs'));
  }
}

loadQuickLinks();
loadRecentTabs();

// Theme sync is handled by shell/js/theme.js (loaded in <head>).
