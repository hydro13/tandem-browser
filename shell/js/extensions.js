    // ═══════════════════════════════════════════════
    // Extension Toolbar (Phase 5b)
    // ═══════════════════════════════════════════════

    const MAX_VISIBLE_EXTENSIONS = 6;
    let extToolbarData = [];

    function escHtml(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    function renderExtToolbar(extensions) {
      extToolbarData = extensions || [];
      const container = document.getElementById('ext-toolbar');
      const overflowBtn = document.getElementById('ext-overflow-btn');
      const overflowDropdown = document.getElementById('ext-overflow-dropdown');
      if (!container) return;

      // Remove existing extension buttons (keep overflow btn + dropdown)
      container.querySelectorAll('.ext-toolbar-btn').forEach(el => el.remove());

      if (extToolbarData.length === 0) {
        overflowBtn.style.display = 'none';
        overflowDropdown.classList.remove('visible');
        return;
      }

      // Split into visible (pinned first, then by order, up to MAX) and overflow
      const visible = extToolbarData.slice(0, MAX_VISIBLE_EXTENSIONS);
      const overflow = extToolbarData.slice(MAX_VISIBLE_EXTENSIONS);

      // Render visible buttons (insert before overflow button)
      for (const ext of visible) {
        const btn = document.createElement('button');
        btn.className = 'ext-toolbar-btn';
        btn.title = escHtml(ext.title || ext.name);
        btn.dataset.extId = ext.id;

        const img = document.createElement('img');
        img.src = ext.icon;
        img.alt = ext.name;
        img.draggable = false;
        btn.appendChild(img);

        // Badge
        if (ext.badgeText) {
          const badge = document.createElement('span');
          badge.className = 'ext-badge';
          badge.textContent = ext.badgeText;
          if (ext.badgeColor) badge.style.background = ext.badgeColor;
          btn.appendChild(badge);
        }

        // Left click: open popup
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (ext.popupUrl && window.tandem) {
            const rect = btn.getBoundingClientRect();
            window.tandem.openExtensionPopup(ext.id, {
              x: Math.round(rect.left),
              y: Math.round(rect.bottom + 4)
            });
          }
        });

        // Right click: context menu
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.tandem) {
            window.tandem.showExtensionContextMenu(ext.id);
          }
        });

        container.insertBefore(btn, overflowBtn);
      }

      // Overflow button
      if (overflow.length > 0) {
        overflowBtn.style.display = 'flex';
        renderExtOverflow(overflow, overflowDropdown);
      } else {
        overflowBtn.style.display = 'none';
        overflowDropdown.classList.remove('visible');
      }
    }

    function renderExtOverflow(extensions, dropdown) {
      dropdown.innerHTML = '';
      for (const ext of extensions) {
        const item = document.createElement('button');
        item.className = 'ext-overflow-item';

        const img = document.createElement('img');
        img.src = ext.icon;
        img.alt = ext.name;
        img.draggable = false;
        item.appendChild(img);

        const name = document.createElement('span');
        name.textContent = ext.name;
        item.appendChild(name);

        if (ext.badgeText) {
          const badge = document.createElement('span');
          badge.className = 'ext-badge';
          badge.textContent = ext.badgeText;
          if (ext.badgeColor) badge.style.background = ext.badgeColor;
          item.appendChild(badge);
        }

        // Left click: open popup
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('visible');
          if (ext.popupUrl && window.tandem) {
            const rect = item.getBoundingClientRect();
            window.tandem.openExtensionPopup(ext.id, {
              x: Math.round(rect.left),
              y: Math.round(rect.bottom + 4)
            });
          }
        });

        // Right click: context menu
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropdown.classList.remove('visible');
          if (window.tandem) {
            window.tandem.showExtensionContextMenu(ext.id);
          }
        });

        dropdown.appendChild(item);
      }
    }

    // Toggle overflow dropdown
    (function () {
      const overflowBtn = document.getElementById('ext-overflow-btn');
      const overflowDropdown = document.getElementById('ext-overflow-dropdown');
      if (overflowBtn && overflowDropdown) {
        overflowBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          overflowDropdown.classList.toggle('visible');
        });
        // Close dropdown on click outside
        document.addEventListener('click', () => {
          overflowDropdown.classList.remove('visible');
        });
      }
    })();

    // Listen for toolbar updates from main process
    if (window.tandem) {
      window.tandem.onExtensionToolbarUpdate((extensions) => {
        renderExtToolbar(extensions);
      });

      // Listen for extension remove requests (from context menu)
      window.tandem.onExtensionRemoveRequest(async (data) => {
        const confirmed = confirm(`Remove "${data.name}" from Tandem?`);
        if (!confirmed) return;
        try {
          const resp = await fetch(`http://localhost:8765/extensions/uninstall/${data.diskId || data.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          });
          if (resp.ok) {
            // Refresh toolbar
            const exts = await window.tandem.getToolbarExtensions();
            renderExtToolbar(exts);
          }
        } catch (err) {
          console.warn('Extension remove failed:', err);
        }
      });

      // Listen for toolbar refresh (triggered by API install/uninstall)
      window.tandem.onExtensionToolbarRefresh(async () => {
        try {
          const exts = await window.tandem.getToolbarExtensions();
          renderExtToolbar(exts);
        } catch (e) {
          console.warn('Extension toolbar refresh failed:', e);
        }
      });

      // Load initial toolbar state
      window.tandem.getToolbarExtensions().then(exts => {
        renderExtToolbar(exts);
      }).catch(() => { });
    }





// ═══ About Panel (sidebar) ═══
function renderAboutPanel() {
  const panel = document.getElementById('sidebar-panel');
  const titleEl = document.getElementById('sidebar-panel-title');
  const content = document.getElementById('sidebar-panel-content');
  
  titleEl.textContent = 'About Tandem';
  panel.classList.add('open');
  content.classList.remove('webview-mode');
  
  content.innerHTML = `
    <div class="about-panel-wrapper">
      <img class="about-logo" src="tandem-bike.png" alt="Tandem">
      <div class="about-title"><span class="about-t">T</span><span class="about-rest">andem</span></div>
      <div class="about-subtitle">First-Party OpenClaw Companion Browser</div>
      <div class="about-quote">Public developer preview for serious OpenClaw workflows</div>
      <div class="about-version" id="about-version-text">...</div>
      <div class="about-info">
        Built specifically for human-AI collaboration with OpenClaw.<br>
        Maintained in the same ecosystem as OpenClaw, with local control and security built in.
      </div>
      <div class="about-link-wrapper">
        <a href="https://github.com/hydro13" class="about-link" id="about-github-link">GitHub — hydro13</a>
      </div>
      <div class="about-copyright">© 2026 Robin Waslander</div>
      <div class="about-team">A first-party companion browser for OpenClaw</div>
    </div>
  `;
  
  // Set version from injected global
  const aboutVersionEl = document.getElementById('about-version-text');
  if (aboutVersionEl) aboutVersionEl.textContent = window.__TANDEM_VERSION__ ? 'v' + window.__TANDEM_VERSION__ : '';

  // Bind GitHub link
  const githubLink = document.getElementById('about-github-link');
  if (githubLink) {
    githubLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.tandem) window.tandem.newTab('https://github.com/hydro13');
    });
  }
}

window.renderAboutPanel = renderAboutPanel;
