(() => {
    const renderer = window.__tandemRenderer;
    if (!renderer) {
      console.error('[browser-tools] Missing renderer bridge');
      return;
    }

    const escapeHtml = renderer.escapeHtml;
    const urlBar = renderer.urlBar;

    function getTabs() {
      return renderer.getTabs();
    }

    function getActiveTabId() {
      return renderer.getActiveTabId();
    }

    function getActiveEntry() {
      return getTabs().get(getActiveTabId());
    }

    function getUpdateTabMeta() {
      return renderer.getUpdateTabMeta();
    }

    function setUpdateTabMeta(next) {
      renderer.setUpdateTabMeta(next);
    }

    // ═══════════════════════════════════════════════
    // Voice Input (Web Speech API — runs in SHELL, NOT webview!)
    // ═══════════════════════════════════════════════

    let speechRecognition = null;
    let voiceActive = false;

    function startVoiceRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn('Web Speech API not available');
        return;
      }

      speechRecognition = new SpeechRecognition();
      speechRecognition.lang = 'nl-BE';
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;

      speechRecognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        const liveEl = document.getElementById('voice-live-text');
        if (liveEl) liveEl.textContent = interimText || finalText;

        if (window.tandem) {
          if (finalText) {
            window.tandem.sendVoiceTranscript(finalText, true);
            if (liveEl) liveEl.textContent = '';
            if (window.chatRouter && window.chatRouter.router) {
              window.chatRouter.sendMessage(finalText);
            }
          } else if (interimText) {
            window.tandem.sendVoiceTranscript(interimText, false);
          }
        }
      };

      speechRecognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          stopVoiceRecognition();
        }
      };

      speechRecognition.onend = () => {
        if (voiceActive && speechRecognition) {
          try { speechRecognition.start(); } catch { }
        }
      };

      try {
        speechRecognition.start();
        voiceActive = true;
        document.getElementById('voice-indicator').classList.add('active');
        document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-panel-tab="chat"]').classList.add('active');
        document.getElementById('panel-activity').style.display = 'none';
        document.getElementById('panel-chat').style.display = 'flex';
        document.getElementById('panel-screenshots').style.display = 'none';
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
      }
    }

    function stopVoiceRecognition() {
      voiceActive = false;
      if (speechRecognition) {
        try { speechRecognition.stop(); } catch { }
        speechRecognition = null;
      }
      document.getElementById('voice-indicator').classList.remove('active');
      document.getElementById('voice-live-text').textContent = '';
      if (window.tandem) window.tandem.sendVoiceStatus(false);
    }

    if (window.tandem) {
      window.tandem.onVoiceToggle((data) => {
        if (data.listening) {
          startVoiceRecognition();
        } else {
          stopVoiceRecognition();
        }
      });

      window.tandem.onVoiceTranscript(() => {
        // Already handled via onChatMessage for final messages
      });

      window.tandem.onAutoSnapshotRequest(() => {
        window.tandem.snapForWingman();
      });
    }

    // ═══════════════════════════════════════════════
    // Settings — open in active tab
    // ═══════════════════════════════════════════════

    function openSettings() {
      const shellPath = window.location.href.replace(/\/[^/]*$/, '');
      const settingsUrl = shellPath + '/settings.html';
      const entry = getActiveEntry();
      if (entry) {
        entry.webview.loadURL(settingsUrl);
      }
    }

    urlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = urlBar.value.trim();
        if (val === 'tandem://settings') {
          e.preventDefault();
          e.stopImmediatePropagation();
          openSettings();
        }
      }
    }, true);

    // ═══════════════════════════════════════════════
    // New tab page navigation messages
    // ═══════════════════════════════════════════════

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'tandem-newtab-navigate' && e.data.url) {
        const entry = getActiveEntry();
        if (entry) entry.webview.loadURL(e.data.url);
      }
    });

    // ═══════════════════════════════════════════════
    // Bookmarks bar + star
    // ═══════════════════════════════════════════════

    const bookmarkStar = document.getElementById('btn-bookmark');
    const bookmarksBar = document.getElementById('bookmarks-bar');
    let bookmarksBarVisible = true;

    const bmToken = () => window.__TANDEM_TOKEN__ || '';

    async function updateBookmarkStar() {
      const entry = getActiveEntry();
      if (!entry) return;
      try {
        const url = entry.webview.getURL();
        if (!url || url.startsWith('file://') || url === 'about:blank') {
          bookmarkStar.textContent = '☆';
          bookmarkStar.classList.remove('bookmarked');
          return;
        }
        const resp = await fetch(`http://localhost:8765/bookmarks/check?url=${encodeURIComponent(url)}`, {
          headers: { Authorization: `Bearer ${bmToken()}` }
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.bookmarked) {
            bookmarkStar.textContent = '★';
            bookmarkStar.classList.add('bookmarked');
          } else {
            bookmarkStar.textContent = '☆';
            bookmarkStar.classList.remove('bookmarked');
          }
        }
      } catch { /* API not ready */ }
    }

    const bmPopup = document.getElementById('bookmark-popup');
    const bmPopupName = document.getElementById('bookmark-popup-name');
    const bmPopupFolder = document.getElementById('bookmark-popup-folder');
    const bmPopupDelete = document.getElementById('bookmark-popup-delete');
    const bmPopupSave = document.getElementById('bookmark-popup-save');
    const bmPopupCancel = document.getElementById('bookmark-popup-cancel');
    let bmPopupState = { open: false, bookmarkId: null, url: null };

    async function loadFolderOptions() {
      try {
        const res = await fetch('http://localhost:8765/bookmarks', {
          headers: { Authorization: `Bearer ${bmToken()}` }
        });
        const data = await res.json();
        const root = data.bookmarks?.[0];
        bmPopupFolder.innerHTML = '';
        const rootOpt = document.createElement('option');
        rootOpt.value = root?.id || '';
        rootOpt.textContent = 'Bookmarks Bar';
        bmPopupFolder.appendChild(rootOpt);

        function addFolders(children, depth) {
          if (!children) return;
          for (const item of children) {
            if (item.type === 'folder') {
              const opt = document.createElement('option');
              opt.value = item.id;
              opt.textContent = '\u00A0\u00A0'.repeat(depth) + item.name;
              bmPopupFolder.appendChild(opt);
              addFolders(item.children, depth + 1);
            }
          }
        }

        addFolders(root?.children, 1);
      } catch { /* ignore */ }
    }

    function positionPopup() {
      const starRect = bookmarkStar.getBoundingClientRect();
      bmPopup.style.top = (starRect.bottom + 6) + 'px';
      bmPopup.style.right = 'auto';
      bmPopup.style.left = Math.max(8, starRect.left - 120) + 'px';
    }

    async function openBookmarkPopup() {
      const entry = getActiveEntry();
      if (!entry) return;
      const url = entry.webview.getURL();
      const title = entry.webview.getTitle() || url;
      if (!url || url.startsWith('file://') || url === 'about:blank') return;

      await loadFolderOptions();

      let existingBookmark = null;
      try {
        const resp = await fetch(`http://localhost:8765/bookmarks/check?url=${encodeURIComponent(url)}`, {
          headers: { Authorization: `Bearer ${bmToken()}` }
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.bookmarked && data.bookmark) existingBookmark = data.bookmark;
        }
      } catch { /* ignore */ }

      bmPopupName.value = existingBookmark ? existingBookmark.name : title;
      bmPopupState.bookmarkId = existingBookmark?.id || null;
      bmPopupState.url = url;

      if (existingBookmark?.parentId) {
        bmPopupFolder.value = existingBookmark.parentId;
      } else {
        bmPopupFolder.selectedIndex = 0;
      }

      bmPopupDelete.style.display = existingBookmark ? '' : 'none';
      positionPopup();
      bmPopup.style.display = 'flex';
      bmPopupState.open = true;
      bmPopupName.focus();
      bmPopupName.select();
    }

    function closeBookmarkPopup() {
      bmPopup.style.display = 'none';
      bmPopupState.open = false;
    }

    bmPopupSave.addEventListener('click', async () => {
      const name = bmPopupName.value.trim();
      const parentId = bmPopupFolder.value;
      if (!name) return;
      try {
        if (bmPopupState.bookmarkId) {
          await fetch('http://localhost:8765/bookmarks/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bmToken()}` },
            body: JSON.stringify({ id: bmPopupState.bookmarkId, name, url: bmPopupState.url }),
          });
          await fetch('http://localhost:8765/bookmarks/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bmToken()}` },
            body: JSON.stringify({ id: bmPopupState.bookmarkId, parentId }),
          });
        } else {
          await fetch('http://localhost:8765/bookmarks/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bmToken()}` },
            body: JSON.stringify({ name, url: bmPopupState.url, parentId }),
          });
        }
        closeBookmarkPopup();
        updateBookmarkStar();
        loadBookmarksBar();
      } catch { /* ignore */ }
    });

    bmPopupDelete.addEventListener('click', async () => {
      if (!bmPopupState.bookmarkId) return;
      try {
        await fetch('http://localhost:8765/bookmarks/remove', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bmToken()}` },
          body: JSON.stringify({ id: bmPopupState.bookmarkId }),
        });
        closeBookmarkPopup();
        updateBookmarkStar();
        loadBookmarksBar();
      } catch { /* ignore */ }
    });

    bmPopupCancel.addEventListener('click', closeBookmarkPopup);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && bmPopupState.open) closeBookmarkPopup();
    });
    document.addEventListener('mousedown', (e) => {
      if (bmPopupState.open && !bmPopup.contains(e.target) && e.target !== bookmarkStar) {
        closeBookmarkPopup();
      }
    });

    bookmarkStar.addEventListener('click', openBookmarkPopup);

    function toggleBookmarksBar() {
      bookmarksBarVisible = !bookmarksBarVisible;
      if (bookmarksBarVisible) {
        loadBookmarksBar();
      } else {
        bookmarksBar.classList.remove('visible');
      }
      fetch('http://localhost:8765/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ general: { showBookmarksBar: bookmarksBarVisible } }),
      }).catch(() => { });
    }

    const bmOverlay = document.createElement('div');
    bmOverlay.id = 'bm-click-overlay';
    bmOverlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;z-index:499;';
    document.body.appendChild(bmOverlay);

    function closeAllBookmarkDropdowns() {
      document.querySelectorAll('.bm-dropdown.open').forEach(d => d.classList.remove('open'));
      bmOverlay.style.display = 'none';
    }

    bmOverlay.addEventListener('click', closeAllBookmarkDropdowns);

    function openBookmarkDropdown(dropdown) {
      document.querySelectorAll('.bm-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.style.left = '';
        d.style.right = '';
      });
      dropdown.classList.add('open');
      const rect = dropdown.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        dropdown.style.left = 'auto';
        dropdown.style.right = '0';
      }
      bmOverlay.style.display = 'block';
    }

    function createBookmarkLink(item) {
      const a = document.createElement('a');
      let hostname = '';
      try { hostname = new URL(item.url).hostname; } catch { }
      const shortName = (item.name || hostname).substring(0, 40);
      a.innerHTML = `<img src="https://www.google.com/s2/favicons?domain=${hostname}&sz=32" onerror="this.style.display='none'"> ${escapeHtml(shortName)}`;
      a.title = item.url;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllBookmarkDropdowns();
        const entry = getActiveEntry();
        if (entry) entry.webview.loadURL(item.url);
      });
      return a;
    }

    function createFolderDropdown(items) {
      const dropdown = document.createElement('div');
      dropdown.className = 'bm-dropdown';

      for (const child of items) {
        if (child.type === 'url' && child.url) {
          dropdown.appendChild(createBookmarkLink(child));
        } else if (child.type === 'folder' && child.children) {
          const subfolder = document.createElement('div');
          subfolder.className = 'bm-subfolder';
          const label = document.createElement('span');
          label.textContent = (child.name || 'Folder').substring(0, 35);
          const icon = document.createElement('span');
          icon.className = 'bm-folder-icon';
          icon.textContent = '📁';
          subfolder.appendChild(icon);
          subfolder.appendChild(label);

          const subDropdown = createFolderDropdown(child.children);
          subfolder.appendChild(subDropdown);

          subfolder.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const parent = subfolder.parentElement;
            if (parent) {
              parent.querySelectorAll('.bm-subfolder > .bm-dropdown.open').forEach(d => {
                if (d !== subDropdown) { d.classList.remove('open', 'flip-left', 'flip-top'); }
              });
            }
            subDropdown.classList.toggle('open');
            if (subDropdown.classList.contains('open')) {
              subDropdown.classList.remove('flip-left', 'flip-top');
              const rect = subDropdown.getBoundingClientRect();
              if (rect.right > window.innerWidth) subDropdown.classList.add('flip-left');
              if (rect.bottom > window.innerHeight) subDropdown.classList.add('flip-top');
            }
          });

          dropdown.appendChild(subfolder);
        }
      }

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding: 6px 12px; font-size: 11px; color: #555;';
        empty.textContent = '(empty)';
        dropdown.appendChild(empty);
      }

      return dropdown;
    }

    function createBarElement(item) {
      if (item.type === 'url' && item.url) {
        return createBookmarkLink(item);
      } else if (item.type === 'folder' && item.children) {
        const folder = document.createElement('div');
        folder.className = 'bm-folder';
        folder.innerHTML = `<span class="bm-folder-icon">📁</span> ${escapeHtml((item.name || 'Folder').substring(0, 25))}`;
        const dropdown = createFolderDropdown(item.children);
        folder.appendChild(dropdown);
        folder.addEventListener('click', (e) => {
          e.stopPropagation();
          if (dropdown.classList.contains('open')) {
            closeAllBookmarkDropdowns();
          } else {
            openBookmarkDropdown(dropdown);
          }
        });
        return folder;
      }
      return null;
    }

    let barItems = [];

    function layoutBookmarksBar() {
      if (!bookmarksBarVisible || barItems.length === 0) return;

      bookmarksBar.innerHTML = '';
      bookmarksBar.classList.add('visible');

      const elements = [];
      for (const item of barItems) {
        const el = createBarElement(item);
        if (el) {
          bookmarksBar.appendChild(el);
          elements.push({ el, item });
        }
      }

      const barRight = bookmarksBar.getBoundingClientRect().right - 12;
      let overflowIndex = -1;
      const reserveWidth = 40;

      for (let i = 0; i < elements.length; i++) {
        const elRect = elements[i].el.getBoundingClientRect();
        if (elRect.right > barRight - reserveWidth) {
          overflowIndex = i;
          break;
        }
      }

      if (overflowIndex < 0) return;

      const overflowItems = [];
      for (let i = overflowIndex; i < elements.length; i++) {
        bookmarksBar.removeChild(elements[i].el);
        overflowItems.push(elements[i].item);
      }

      const chevron = document.createElement('div');
      chevron.className = 'bm-overflow';
      chevron.textContent = '»';

      const overflowDropdown = document.createElement('div');
      overflowDropdown.className = 'bm-dropdown';
      for (const item of overflowItems) {
        if (item.type === 'url' && item.url) {
          overflowDropdown.appendChild(createBookmarkLink(item));
        } else if (item.type === 'folder' && item.children) {
          const subfolder = document.createElement('div');
          subfolder.className = 'bm-subfolder';
          const icon = document.createElement('span');
          icon.className = 'bm-folder-icon';
          icon.textContent = '📁';
          const label = document.createElement('span');
          label.textContent = (item.name || 'Folder').substring(0, 35);
          subfolder.appendChild(icon);
          subfolder.appendChild(label);
          const subDropdown = createFolderDropdown(item.children);
          subfolder.appendChild(subDropdown);
          subfolder.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            overflowDropdown.querySelectorAll('.bm-subfolder > .bm-dropdown.open').forEach(d => {
              if (d !== subDropdown) d.classList.remove('open', 'flip-left', 'flip-top');
            });
            subDropdown.classList.toggle('open');
            if (subDropdown.classList.contains('open')) {
              subDropdown.classList.remove('flip-left', 'flip-top');
              const rect = subDropdown.getBoundingClientRect();
              if (rect.right > window.innerWidth) subDropdown.classList.add('flip-left');
              if (rect.bottom > window.innerHeight) subDropdown.classList.add('flip-top');
            }
          });
          overflowDropdown.appendChild(subfolder);
        }
      }

      chevron.appendChild(overflowDropdown);
      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        if (overflowDropdown.classList.contains('open')) {
          closeAllBookmarkDropdowns();
        } else {
          openBookmarkDropdown(overflowDropdown);
        }
      });

      bookmarksBar.appendChild(chevron);
    }

    window.addEventListener('resize', () => {
      if (bookmarksBarVisible && barItems.length > 0) layoutBookmarksBar();
    });

    async function loadBookmarksBar() {
      if (!bookmarksBarVisible) return;

      let retries = 3;
      while (retries > 0) {
        try {
          const resp = await fetch('http://localhost:8765/bookmarks', {
            headers: { Authorization: `Bearer ${bmToken()}` }
          });
          if (!resp.ok) {
            retries--;
            if (retries > 0) { await new Promise(r => setTimeout(r, 1000)); continue; }
            return;
          }
          const data = await resp.json();
          barItems = (data.bar || []).slice(0, 30);
          if (barItems.length === 0) {
            bookmarksBar.classList.remove('visible');
            return;
          }
          layoutBookmarksBar();
          break;
        } catch {
          retries--;
          if (retries > 0) { await new Promise(r => setTimeout(r, 1000)); }
        }
      }
    }

    setTimeout(async () => {
      try {
        const res = await fetch('http://localhost:8765/config');
        if (res.ok) {
          const cfg = await res.json();
          if (cfg.general && cfg.general.showBookmarksBar === false) {
            bookmarksBarVisible = false;
            bookmarksBar.classList.remove('visible');
            return;
          }
        }
      } catch { /* API not ready, show bar by default */ }
      loadBookmarksBar();
    }, 1500);

    const updateTabMetaForBookmarks = getUpdateTabMeta();
    setUpdateTabMeta(function (tabId, data) {
      updateTabMetaForBookmarks(tabId, data);
      if (data.url && tabId === getActiveTabId()) {
        setTimeout(updateBookmarkStar, 200);
      }
    });

    // ═══════════════════════════════════════════════
    // Find in page
    // ═══════════════════════════════════════════════

    const findBar = document.getElementById('find-bar');
    const findInput = document.getElementById('find-input');
    const findCount = document.getElementById('find-count');
    let findActive = false;

    function toggleFindBar(show) {
      if (show === undefined) show = !findActive;
      findActive = show;
      if (show) {
        findBar.classList.add('visible');
        findInput.focus();
        findInput.select();
      } else {
        findBar.classList.remove('visible');
        findInput.value = '';
        findCount.textContent = '';
        const entry = getActiveEntry();
        if (entry) entry.webview.stopFindInPage('clearSelection');
      }
    }

    function doFind(forward) {
      const text = findInput.value;
      if (!text) {
        findCount.textContent = '';
        return;
      }
      const entry = getActiveEntry();
      if (!entry) return;
      entry.webview.findInPage(text, { forward: forward !== false });
    }

    findInput.addEventListener('input', () => doFind(true));
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        doFind(!e.shiftKey);
      } else if (e.key === 'Escape') {
        toggleFindBar(false);
      }
    });
    document.getElementById('find-next').addEventListener('click', () => doFind(true));
    document.getElementById('find-prev').addEventListener('click', () => doFind(false));
    document.getElementById('find-close').addEventListener('click', () => toggleFindBar(false));

    function wireFindEvents(wv) {
      wv.addEventListener('found-in-page', (e) => {
        if (e.result) {
          findCount.textContent = `${e.result.activeMatchOrdinal}/${e.result.matches}`;
        }
      });
    }

    const createTabWithFind = window.__tandemTabs.createTab;
    window.__tandemTabs.createTab = function (tabId, url, partition) {
      const result = createTabWithFind.call(window.__tandemTabs, tabId, url, partition);
      const entry = getTabs().get(tabId);
      if (entry && entry.webview) wireFindEvents(entry.webview);
      return result;
    };

    (() => {
      const entry = getActiveEntry();
      if (entry && entry.webview) wireFindEvents(entry.webview);
    })();

    // ═══════════════════════════════════════════════
    // History page
    // ═══════════════════════════════════════════════

    function openHistoryPage() {
      const shellPath = window.location.href.replace(/\/[^/]*$/, '');
      const historyUrl = shellPath + '/history.html';
      const entry = getActiveEntry();
      if (entry) entry.webview.loadURL(historyUrl);
    }

    function isNewtabUrl(url) {
      return url && (url.includes('newtab.html') || url.startsWith('file://') && url.endsWith('newtab.html'));
    }

    const updateTabMetaForNewtab = getUpdateTabMeta();
    setUpdateTabMeta(function (tabId, data) {
      updateTabMetaForNewtab(tabId, data);
      if (data.url && tabId === getActiveTabId() && isNewtabUrl(data.url)) {
        urlBar.value = '';
      }
    });

    // ═══════════════════════════════════════════════
    // Screenshot preview with actual images in panel
    // ═══════════════════════════════════════════════

    if (window.tandem) {
      window.tandem.onScreenshotTaken((data) => {
        const listEl = document.getElementById('screenshot-list');
        const placeholder = listEl.querySelector('p');
        if (placeholder) placeholder.remove();

        const div = document.createElement('div');
        div.className = 'ss-item';
        if (data.base64) {
          const imgSrc = `data:image/png;base64,${data.base64}`;
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = data.filename;
          img.title = 'Click to enlarge';
          div.appendChild(img);

          const label = document.createElement('div');
          label.className = 'ss-label';
          label.textContent = data.filename;
          div.appendChild(label);

          img.addEventListener('click', () => {
            const win = window.open('', '_blank', 'width=1200,height=800');
            if (win) {
              win.document.title = data.filename;
              const style = win.document.createElement('style');
              style.textContent = 'body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;}';
              win.document.head.appendChild(style);
              const preview = win.document.createElement('img');
              preview.src = imgSrc;
              win.document.body.replaceChildren(preview);
            }
          });
        } else {
          const label = document.createElement('div');
          label.className = 'ss-label';
          label.textContent = data.filename;
          div.appendChild(label);
        }
        listEl.prepend(div);
      });
    }

    window.openSettings = openSettings;
    window.openBookmarkPopup = openBookmarkPopup;
    window.toggleBookmarksBar = toggleBookmarksBar;
    window.toggleFindBar = toggleFindBar;
    window.openHistoryPage = openHistoryPage;
})();
