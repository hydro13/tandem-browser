/**
 * Tab context menu — custom DOM menu shown on right-click of a tab.
 *
 * Not a sidebar "panel" (it's a floating menu, not inside #sidebar-panel), so
 * lives at the sidebar/ root alongside drag-drop.js rather than under panels/.
 *
 * Exposes window.__tandemShowTabContextMenu so main.js can trigger the menu
 * in response to webContents context-menu events.
 *
 * Loaded from: shell/js/sidebar/index.js
 * window exports: __tandemShowTabContextMenu
 */

import { getToken, getWorkspaces } from './config.js';
import { getIconSvg, filterTabBar, loadWorkspaces } from './panels/workspaces.js';
import { refreshPinboardIfOpen } from './panels/pinboard.js';

let ctxMenuEl = null;

async function loadQuickLinksConfig() {
  const response = await fetch('http://localhost:8765/config', {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) throw new Error('Failed to load quick links');
  return response.json();
}

function isQuickLinkableUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

function normalizeQuickLinkUrl(url) {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}

async function addQuickLink(url, label) {
  const data = await loadQuickLinksConfig();
  const normalizedUrl = normalizeQuickLinkUrl(url);
  const quickLinks = (data.general?.quickLinks || []).filter((link) => {
    try {
      return normalizeQuickLinkUrl(link?.url) !== normalizedUrl;
    } catch {
      return true;
    }
  });
  quickLinks.push({ label, url: normalizedUrl });
  const response = await fetch('http://localhost:8765/config', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify({ general: { quickLinks } })
  });
  if (!response.ok) throw new Error('Failed to save quick links');
  return response.json();
}

async function removeQuickLink(url) {
  const data = await loadQuickLinksConfig();
  const normalizedUrl = normalizeQuickLinkUrl(url);
  const quickLinks = (data.general?.quickLinks || []).filter((link) => {
    try {
      return normalizeQuickLinkUrl(link?.url) !== normalizedUrl;
    } catch {
      return true;
    }
  });
  const response = await fetch('http://localhost:8765/config', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify({ general: { quickLinks } })
  });
  if (!response.ok) throw new Error('Failed to save quick links');
  return response.json();
}

function getWebContentsIdForTab(domTabId) {
  const wv = document.querySelector(`webview[data-tab-id="${domTabId}"]`);
  return wv && wv.getWebContentsId ? wv.getWebContentsId() : null;
}

function getTabWorkspaceId(domTabId) {
  const wcId = getWebContentsIdForTab(domTabId);
  if (wcId === null) return null;
  const ws = getWorkspaces().find(w => w.tabIds && w.tabIds.includes(wcId));
  return ws ? ws.id : null;
}

export async function moveTabToWorkspace(domTabId, targetWsId) {
  const wcId = getWebContentsIdForTab(domTabId);
  if (wcId === null) return;
  try {
    await fetch(`http://localhost:8765/workspaces/${targetWsId}/move-tab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ tabId: wcId })
    });
    await loadWorkspaces();
    filterTabBar();
    const ws = getWorkspaces().find(w => w.id === targetWsId);
    console.log(`Tab moved to workspace ${ws ? ws.name : targetWsId}`);
  } catch (e) { console.error('moveTabToWorkspace failed:', e); }
}

function closeCtxMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
}

export async function showTabContextMenu(domTabId, x, y) {
  closeCtxMenu();

  const wv = document.querySelector('webview[data-tab-id="'+domTabId+'"]');
  const isMuted = wv ? wv.audioMuted : false;
  const currentWsId = getTabWorkspaceId(domTabId);
  const targets = getWorkspaces().filter(ws => ws.id !== currentWsId);

  // Pre-fetch pinboards (fast — same-machine API call)
  let pbBoards = [];
  try {
    const pbRes = await fetch('http://localhost:8765/pinboards', { headers: { Authorization: `Bearer ${getToken()}` } });
    const pbData = await pbRes.json();
    pbBoards = pbData.boards || [];
  } catch { /* Tandem not running or no boards */ }

  const menu = document.createElement('div');
  menu.className = 'tandem-ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  function addItem(label, onClick) {
    const item = document.createElement('div');
    item.className = 'tandem-ctx-menu-item';
    item.textContent = label;
    item.addEventListener('click', () => { closeCtxMenu(); onClick(item); });
    menu.appendChild(item);
    return item;
  }

  function addSep() {
    const sep = document.createElement('div');
    sep.className = 'tandem-ctx-separator';
    menu.appendChild(sep);
  }

  // — New Tab
  addItem('New Tab', () => { window.tandem.newTab(); });

  addSep();

  // — Reload
  addItem('Reload', () => { if (wv) wv.reload(); });

  // — Duplicate Tab
  addItem('Duplicate Tab', () => { if (wv) window.tandem.newTab(wv.src); });

  // — Copy Page Address
  addItem('Copy Page Address', (itemEl) => {
    if (wv) {
      navigator.clipboard.writeText(wv.src);
      itemEl.textContent = 'Copied!';
      setTimeout(() => { itemEl.textContent = 'Copy Page Address'; }, 1000);
    }
  });

  if (wv && isQuickLinkableUrl(wv.src)) {
    const quickLinksData = await loadQuickLinksConfig().catch(() => null);
    const currentQuickLinks = quickLinksData?.general?.quickLinks || [];
    const currentUrl = normalizeQuickLinkUrl(wv.src);
    const alreadyQuickLink = currentQuickLinks.some((link) => {
      try {
        return normalizeQuickLinkUrl(link?.url) === currentUrl;
      } catch {
        return false;
      }
    });
    addItem(alreadyQuickLink ? 'Remove from Quick Links' : 'Add to Quick Links', async () => {
      try {
        if (alreadyQuickLink) {
          await removeQuickLink(currentUrl);
        } else {
          await addQuickLink(currentUrl, wv.getTitle() || currentUrl);
        }
      } catch {
        // Ignore save failures for now; the menu just closes.
      }
    });
  }

  addSep();

  // — Move to Workspace (submenu)
  if (targets.length > 0) {
    const wsItem = document.createElement('div');
    wsItem.className = 'tandem-ctx-menu-item';
    wsItem.innerHTML = '<span>Move to Workspace</span><span class="ctx-arrow">▶</span>';

    const sub = document.createElement('div');
    sub.className = 'tandem-ctx-submenu';
    targets.forEach(ws => {
      const si = document.createElement('div');
      si.className = 'tandem-ctx-submenu-item';
      const icon = getIconSvg(ws.icon);
      const iconSpan = document.createElement('span');
      iconSpan.className = 'ws-ctx-icon';
      iconSpan.innerHTML = icon;
      const nameSpan = document.createElement('span');
      nameSpan.textContent = ws.name;
      si.appendChild(iconSpan);
      si.appendChild(nameSpan);
      si.addEventListener('click', () => {
        closeCtxMenu();
        moveTabToWorkspace(domTabId, ws.id);
      });
      sub.appendChild(si);
    });
    wsItem.appendChild(sub);
    menu.appendChild(wsItem);

    addSep();
  }

  // — Add to Pinboard (submenu)
  {
    const pbItem = document.createElement('div');
    pbItem.className = 'tandem-ctx-menu-item';
    pbItem.innerHTML = '<span>📌 Add to Pinboard</span><span class="ctx-arrow">▶</span>';

    const pbSub = document.createElement('div');
    pbSub.className = 'tandem-ctx-submenu';

    if (pbBoards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tandem-ctx-submenu-item';
      empty.style.opacity = '0.5';
      empty.style.cursor = 'default';
      empty.textContent = 'No boards yet';
      pbSub.appendChild(empty);
    } else {
      pbBoards.forEach(board => {
        const si = document.createElement('div');
        si.className = 'tandem-ctx-submenu-item';
        const labelSpan = document.createElement('span');
        labelSpan.textContent = board.emoji + ' ' + board.name;
        si.appendChild(labelSpan);
        si.addEventListener('click', async () => {
          closeCtxMenu();
          const tabUrl = wv ? wv.src : '';
          const tabTitle = wv ? wv.getTitle() : '';
          await fetch('http://localhost:8765/pinboards/' + board.id + '/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify({ type: 'link', url: tabUrl, title: tabTitle })
          });
          // Visual flash feedback on the tab
          const tabEl = document.querySelector('.tab[data-tab-id="' + domTabId + '"]');
          if (tabEl) {
            tabEl.classList.add('pin-flash');
            setTimeout(() => tabEl.classList.remove('pin-flash'), 700);
          }
          // Refresh board if it's currently open (no-op otherwise).
          refreshPinboardIfOpen(board.id);
        });
        pbSub.appendChild(si);
      });
    }

    pbItem.appendChild(pbSub);
    menu.appendChild(pbItem);
    addSep();
  }

  // — Mute / Unmute Tab
  addItem(isMuted ? 'Unmute Tab' : 'Mute Tab', () => {
    if (wv) wv.audioMuted = !isMuted;
  });

  // — Set Emoji (submenu)
  {
    const emojiItem = document.createElement('div');
    emojiItem.className = 'tandem-ctx-menu-item';
    const tabEl = document.querySelector('.tab[data-tab-id="' + domTabId + '"]');
    const tabEmojiSpan = tabEl ? tabEl.querySelector('.tab-emoji') : null;
    const currentEmoji = (tabEmojiSpan && tabEmojiSpan.style.display !== 'none') ? tabEmojiSpan.textContent : '';
    const emojiLabel = document.createElement('span');
    emojiLabel.textContent = currentEmoji ? ('Emoji: ' + currentEmoji) : 'Set Emoji...';
    const emojiArrow = document.createElement('span');
    emojiArrow.className = 'ctx-arrow';
    emojiArrow.textContent = '▶';
    emojiItem.appendChild(emojiLabel);
    emojiItem.appendChild(emojiArrow);

    const emojiSub = document.createElement('div');
    emojiSub.className = 'tandem-ctx-submenu tandem-emoji-grid';

    if (currentEmoji) {
      const removeItem = document.createElement('div');
      removeItem.className = 'tandem-ctx-submenu-item';
      removeItem.textContent = 'Remove Emoji';
      removeItem.addEventListener('click', async () => {
        closeCtxMenu();
        await fetch('http://localhost:8765/tabs/' + encodeURIComponent(domTabId) + '/emoji', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + getToken() }
        });
      });
      emojiSub.appendChild(removeItem);
      const sep = document.createElement('div');
      sep.className = 'tandem-ctx-separator';
      emojiSub.appendChild(sep);
    }

    const emojis = [
      '🔥','⭐','💡','🚀','✅','❌','⚠️','🎯','💬','📌',
      '📚','🧪','🔧','🎨','📊','🔒','👀','💰','🎵','❤️',
      '🏠','📧','🛒','📝','🗂️','🌍','☁️','📸','🎮','🤖',
      '🧠','🔍','📅','🎁','🏷️','⏰','🔔','💻','📱','🎬',
      '🍕','☕','🌟','💎','🦊','🐛','🏗️','📦','🔗','🏆',
    ];
    const grid = document.createElement('div');
    grid.className = 'tandem-emoji-picker';
    emojis.forEach(emoji => {
      const btn = document.createElement('span');
      btn.className = 'tandem-emoji-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', async () => {
        closeCtxMenu();
        await fetch('http://localhost:8765/tabs/' + encodeURIComponent(domTabId) + '/emoji', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
          body: JSON.stringify({ emoji: emoji })
        });
      });
      grid.appendChild(btn);
    });
    emojiSub.appendChild(grid);

    emojiItem.appendChild(emojiSub);
    menu.appendChild(emojiItem);
  }

  addSep();

  // — Close Tab
  addItem('Close Tab', () => { window.tandem.closeTab(domTabId); });

  // — Close Other Tabs
  addItem('Close Other Tabs', () => {
    const allTabs = document.querySelectorAll('#tab-bar .tab[data-tab-id]');
    allTabs.forEach(t => {
      const tid = t.dataset.tabId;
      if (tid && tid !== domTabId) window.tandem.closeTab(tid);
    });
  });

  // — Close Tabs to the Right
  addItem('Close Tabs to the Right', () => {
    const allTabs = Array.from(document.querySelectorAll('#tab-bar .tab[data-tab-id]'));
    const idx = allTabs.findIndex(t => t.dataset.tabId === domTabId);
    if (idx >= 0) {
      for (let i = idx + 1; i < allTabs.length; i++) {
        const tid = allTabs[i].dataset.tabId;
        if (tid) window.tandem.closeTab(tid);
      }
    }
  });

  document.body.appendChild(menu);
  ctxMenuEl = menu;

  // Auto-flip if menu extends beyond viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = Math.max(0, window.innerWidth - rect.width - 8) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = Math.max(0, window.innerHeight - rect.height - 8) + 'px';

  // Flip submenu left if near right edge
  requestAnimationFrame(() => {
    const menuRight = menu.getBoundingClientRect().right;
    if (menuRight + 180 > window.innerWidth) {
      const subs = menu.querySelectorAll('.tandem-ctx-submenu');
      subs.forEach(s => s.classList.add('flip-left'));
    }
  });

  // Close on click outside, Escape, scroll
  const closeHandler = (e) => {
    if (ctxMenuEl && !ctxMenuEl.contains(e.target)) { closeCtxMenu(); cleanup(); }
  };
  const escHandler = (e) => {
    if (e.key === 'Escape') { closeCtxMenu(); cleanup(); }
  };
  const scrollHandler = () => { closeCtxMenu(); cleanup(); };
  function cleanup() {
    document.removeEventListener('mousedown', closeHandler);
    document.removeEventListener('keydown', escHandler);
    window.removeEventListener('scroll', scrollHandler, true);
  }
  setTimeout(() => {
    document.addEventListener('mousedown', closeHandler);
    document.addEventListener('keydown', escHandler);
    window.addEventListener('scroll', scrollHandler, true);
  }, 0);
}

// Expose globally so main.js can call it
window.__tandemShowTabContextMenu = showTabContextMenu;
