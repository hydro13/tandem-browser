const API = window.tandemApi?.baseUrl() || window.__TANDEM_API_BASE__ || 'http://127.0.0.1:8765';
const quickLinksList = document.getElementById('cfg-quickLinks');
let googlePhotosStatus = {};

// ═══ Load config ═══
let config = {};

async function loadConfig() {
  try {
    const res = await fetch(`${API}/config`);
    if (res.ok) config = await res.json();
  } catch { /* API not ready */ }
  await loadGooglePhotosStatus();
  applyConfigToUI();
}

async function loadGooglePhotosStatus() {
  try {
    const res = await fetch(`${API}/integrations/google-photos/status`);
    if (res.ok) googlePhotosStatus = await res.json();
  } catch {
    googlePhotosStatus = {};
  }
}

function applyConfigToUI() {
  const g = config.general || {};
  const s = config.screenshots || {};
  const v = config.voice || {};
  const a = config.appearance || {};
  const st = config.stealth || {};
  const b = config.behavior || {};
  const lgl = a.liquidGlass || {};

  // General
  setVal('cfg-startPage', g.startPage || 'wingman');
  setVal('cfg-customStartUrl', g.customStartUrl || '');

  // Appearance/Theme
  setVal('cfg-theme', a.theme || 'dark');
  window.TandemTheme.applyTheme(a.theme || 'dark');
  setVal('cfg-language', g.language || 'nl-BE');
  setVal('cfg-wingmanPanelPosition', g.wingmanPanelPosition || 'right');
  setChecked('cfg-wingmanPanelDefaultOpen', !!g.wingmanPanelDefaultOpen);
  setChecked('cfg-showBookmarksBar', g.showBookmarksBar !== false);
  toggleField('field-customStartUrl', g.startPage === 'custom');
  renderQuickLinkRows(g.quickLinks || []);
  setVal('cfg-apiPort', String(g.apiPort || 8765));
  updateAgentApiPreview();

  // Liquid Glass Lite
  setChecked('cfg-lgl-enabled', lgl.enabled !== false);
  const blurRadius = lgl.blurRadius || 20;
  const refractionStrength = lgl.refractionStrength || 15;
  setVal('cfg-lgl-blur', blurRadius);
  setVal('cfg-lgl-refraction', refractionStrength);
  document.getElementById('lgl-blur-value').textContent = blurRadius;
  document.getElementById('lgl-refraction-value').textContent = refractionStrength;

  // Screenshots
  setChecked('cfg-localFolder', s.localFolder !== false);
  setChecked('cfg-applePhotos', !!s.applePhotos);
  setChecked('cfg-googlePhotos', !!s.googlePhotos);
  const folderPath = s.localFolderPath || '~/Pictures/Tandem/';
  setVal('cfg-localFolderPath', folderPath);
  const displayEl = document.getElementById('cfg-localFolderPath-display');
  if (displayEl) displayEl.textContent = folderPath;
  setVal('cfg-googlePhotosClientId', googlePhotosStatus.clientId || '');
  renderGooglePhotosStatus();

  // Voice
  setVal('cfg-voiceLanguage', v.inputLanguage || 'nl-BE');
  setChecked('cfg-autoSendOnSilence', v.autoSendOnSilence !== false);
  const timeout = v.silenceTimeoutSeconds || 2;
  document.getElementById('cfg-silenceTimeout').value = timeout;
  document.getElementById('silenceTimeoutVal').textContent = timeout + 's';

  // Stealth
  setVal('cfg-userAgent', st.userAgent || 'auto');
  setVal('cfg-customUserAgent', st.customUserAgent || '');
  setVal('cfg-stealthLevel', st.stealthLevel || 'medium');
  setVal('cfg-acceptLanguage', st.acceptLanguage || 'auto');
  setVal('cfg-customAcceptLanguage', st.customAcceptLanguage || '');
  toggleField('field-customUserAgent', st.userAgent === 'custom');
  toggleField('field-customAcceptLanguage', st.acceptLanguage === 'custom');

  // Sync
  const sy = config.sync || {};
  setChecked('cfg-chromeBookmarks', !!sy.chromeBookmarks);
  setVal('cfg-chromeProfile', sy.chromeProfile || 'Default');
  toggleField('field-chromeProfile', !!sy.chromeBookmarks);

  // Behavior
  setChecked('cfg-trackingEnabled', b.trackingEnabled !== false);
}

function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = val; }
function toggleField(id, show) { const el = document.getElementById(id); if (el) el.style.display = show ? 'flex' : 'none'; }

function renderGooglePhotosStatus() {
  const statusEl = document.getElementById('googlePhotosStatus');
  const connectBtn = document.getElementById('btn-googlePhotosConnect');
  const disconnectBtn = document.getElementById('btn-googlePhotosDisconnect');
  const enabled = document.getElementById('cfg-googlePhotos').checked;
  const connected = !!googlePhotosStatus.connected;
  const configured = !!googlePhotosStatus.clientIdConfigured;
  if (statusEl) {
    if (connected) {
      statusEl.textContent = enabled
        ? 'Connected and ready to auto-upload screenshots'
        : 'Connected, but auto-upload is currently disabled';
    } else if (configured) {
      statusEl.textContent = 'Client ID saved. Connect Google Photos to finish setup.';
    } else {
      statusEl.textContent = 'Add a Google desktop OAuth client ID to connect.';
    }
  }
  if (connectBtn) connectBtn.disabled = !configured;
  if (disconnectBtn) disconnectBtn.disabled = !connected;
}

function appendQuickLinkRow(link = {}) {
  const row = document.createElement('div');
  row.className = 'quick-link-row';
  row.innerHTML = `
    <input type="text" class="quick-link-label" placeholder="Label" value="${esc(link.label || '')}" />
    <input type="url" class="quick-link-url" placeholder="https://example.com" value="${esc(link.url || '')}" />
    <button type="button" class="btn btn-danger quick-link-remove">Remove</button>
  `;
  row.querySelector('.quick-link-remove').addEventListener('click', () => {
    row.remove();
    updateQuickLinksEmptyState();
    void saveQuickLinks();
  });
  // Auto-save on label/url change (debounced)
  let _qlTimer;
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    clearTimeout(_qlTimer);
    _qlTimer = setTimeout(() => void saveQuickLinks(), 600);
  }));
  quickLinksList.appendChild(row);
  updateQuickLinksEmptyState();
}

function renderQuickLinkRows(links) {
  quickLinksList.innerHTML = '';
  if (Array.isArray(links)) {
    for (const link of links) appendQuickLinkRow(link);
  }
  updateQuickLinksEmptyState();
}

function updateQuickLinksEmptyState() {
  const rows = quickLinksList.querySelectorAll('.quick-link-row');
  let empty = quickLinksList.querySelector('.quick-link-empty');
  if (!rows.length) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'quick-link-empty';
      empty.textContent = 'No quick links configured yet.';
      quickLinksList.appendChild(empty);
    }
    return;
  }
  empty?.remove();
}

function normalizeQuickLinkUrl(rawUrl) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).toString();
}

function collectQuickLinks() {
  const rows = quickLinksList.querySelectorAll('.quick-link-row');
  const links = [];

  for (const row of rows) {
    const label = row.querySelector('.quick-link-label').value.trim();
    const rawUrl = row.querySelector('.quick-link-url').value.trim();

    if (!label && !rawUrl) continue;
    if (!label || !rawUrl) {
      throw new Error('Each quick link needs both a label and a URL.');
    }

    links.push({
      label,
      url: normalizeQuickLinkUrl(rawUrl),
    });
  }

  return links;
}

async function saveQuickLinks() {
  try {
    const quickLinks = collectQuickLinks();
    await saveConfig({ general: { quickLinks } });
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Save failed ✕');
  }
}

// ═══ Save on change ═══
async function saveConfig(patch) {
  try {
    const res = await fetch(`${API}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      config = await res.json();
      showToast('Saved ✓');
      return true;
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Save failed ✕');
      return false;
    }
  } catch {
    showToast('Save failed ✕');
    return false;
  }
}

async function saveGooglePhotosClientId() {
  const clientId = document.getElementById('cfg-googlePhotosClientId').value.trim();
  try {
    const res = await fetch(`${API}/integrations/google-photos/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    if (res.ok) {
      googlePhotosStatus = await res.json();
      renderGooglePhotosStatus();
      showToast('Saved ✓');
    }
  } catch {
    showToast('Save failed ✕');
  }
}

async function connectGooglePhotos() {
  const clientId = document.getElementById('cfg-googlePhotosClientId').value.trim();
  try {
    const res = await fetch(`${API}/integrations/google-photos/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Connect failed');
    }
    const popup = window.open(data.authUrl, 'google-photos-auth', 'width=520,height=760');
    if (!popup) {
      throw new Error('Popup blocked');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Connect failed ✕');
  }
}

async function disconnectGooglePhotos() {
  try {
    const res = await fetch(`${API}/integrations/google-photos/disconnect`, { method: 'POST' });
    if (res.ok) {
      googlePhotosStatus = await res.json();
      renderGooglePhotosStatus();
      showToast('Disconnected ✓');
    }
  } catch {
    showToast('Disconnect failed ✕');
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// Wire up all controls
function wire(id, path, transform) {
  const el = document.getElementById(id);
  if (!el) return;
  const event = el.type === 'checkbox' ? 'change' : el.tagName === 'SELECT' ? 'change' : 'blur';
  el.addEventListener(event, () => {
    let val = el.type === 'checkbox' ? el.checked : el.value;
    if (transform) val = transform(val);
    // Build nested patch from dot path
    const parts = path.split('.');
    const patch = {};
    let cur = patch;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
    saveConfig(patch);
  });
}

wire('cfg-startPage', 'general.startPage');
wire('cfg-customStartUrl', 'general.customStartUrl');
wire('cfg-language', 'general.language');
wire('cfg-wingmanPanelPosition', 'general.wingmanPanelPosition');
wire('cfg-wingmanPanelDefaultOpen', 'general.wingmanPanelDefaultOpen');
wire('cfg-localFolder', 'screenshots.localFolder');
wire('cfg-localFolderPath', 'screenshots.localFolderPath');
wire('cfg-googlePhotos', 'screenshots.googlePhotos');
wire('cfg-voiceLanguage', 'voice.inputLanguage');
wire('cfg-autoSendOnSilence', 'voice.autoSendOnSilence');
wire('cfg-theme', 'appearance.theme');
wire('cfg-userAgent', 'stealth.userAgent');
wire('cfg-customUserAgent', 'stealth.customUserAgent');
wire('cfg-stealthLevel', 'stealth.stealthLevel');
wire('cfg-acceptLanguage', 'stealth.acceptLanguage');
wire('cfg-customAcceptLanguage', 'stealth.customAcceptLanguage');
wire('cfg-showBookmarksBar', 'general.showBookmarksBar');
wire('cfg-applePhotos', 'screenshots.applePhotos');
wire('cfg-chromeBookmarks', 'sync.chromeBookmarks');
wire('cfg-chromeProfile', 'sync.chromeProfile');
wire('cfg-trackingEnabled', 'behavior.trackingEnabled');
// Folder picker for screenshot storage path
document.getElementById('btn-chooseFolder').addEventListener('click', async () => {
  try {
    const res = await fetch(`${API}/dialog/pick-folder`, { method: 'POST' });
    const data = await res.json();
    if (!data.canceled && data.path) {
      document.getElementById('cfg-localFolderPath').value = data.path;
      document.getElementById('cfg-localFolderPath-display').textContent = data.path;
      await saveConfig({ screenshots: { localFolderPath: data.path } });
    }
  } catch (e) {
    console.error('Folder picker failed:', e);
  }
});

document.getElementById('btn-addQuickLink').addEventListener('click', () => {
  appendQuickLinkRow();
  void saveQuickLinks();
});
document.getElementById('cfg-googlePhotosClientId').addEventListener('blur', () => {
  void saveGooglePhotosClientId();
});
document.getElementById('btn-googlePhotosConnect').addEventListener('click', () => {
  void connectGooglePhotos();
});
document.getElementById('btn-googlePhotosDisconnect').addEventListener('click', () => {
  void disconnectGooglePhotos();
});
document.getElementById('cfg-googlePhotos').addEventListener('change', () => {
  renderGooglePhotosStatus();
});
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'tandem-google-photos-auth') return;
  void loadGooglePhotosStatus().then(() => {
    renderGooglePhotosStatus();
    showToast(event.data.ok ? 'Google Photos connected ✓' : (event.data.error || 'Connect failed ✕'));
  });
});

// Liquid Glass Lite
wire('cfg-lgl-enabled', 'appearance.liquidGlass.enabled');

// LGL blur radius slider
const lglBlurSlider = document.getElementById('cfg-lgl-blur');
const lglBlurValue = document.getElementById('lgl-blur-value');
if (lglBlurSlider && lglBlurValue) {
  lglBlurSlider.addEventListener('input', () => {
    lglBlurValue.textContent = lglBlurSlider.value;
  });
  lglBlurSlider.addEventListener('change', () => {
    saveConfig({ appearance: { liquidGlass: { blurRadius: parseInt(lglBlurSlider.value) } } });
  });
}

// LGL refraction strength slider (disabled for now, ready for WebGL)
const lglRefractionSlider = document.getElementById('cfg-lgl-refraction');
const lglRefractionValue = document.getElementById('lgl-refraction-value');
if (lglRefractionSlider && lglRefractionValue) {
  lglRefractionSlider.addEventListener('input', () => {
    lglRefractionValue.textContent = lglRefractionSlider.value;
  });
  lglRefractionSlider.addEventListener('change', () => {
    saveConfig({ appearance: { liquidGlass: { refractionStrength: parseInt(lglRefractionSlider.value) } } });
  });
}

// Silence timeout slider
const silenceSlider = document.getElementById('cfg-silenceTimeout');
const silenceVal = document.getElementById('silenceTimeoutVal');
silenceSlider.addEventListener('input', () => {
  silenceVal.textContent = silenceSlider.value + 's';
});
silenceSlider.addEventListener('change', () => {
  saveConfig({ voice: { silenceTimeoutSeconds: parseFloat(silenceSlider.value) } });
});

// Show/hide conditional fields
document.getElementById('cfg-startPage').addEventListener('change', (e) => {
  toggleField('field-customStartUrl', e.target.value === 'custom');
});
document.getElementById('cfg-apiPort').addEventListener('input', updateAgentApiPreview);
document.getElementById('cfg-apiPort').addEventListener('change', () => void saveAgentApiPort());
document.getElementById('cfg-userAgent').addEventListener('change', (e) => {
  toggleField('field-customUserAgent', e.target.value === 'custom');
});
document.getElementById('cfg-acceptLanguage').addEventListener('change', (e) => {
  toggleField('field-customAcceptLanguage', e.target.value === 'custom');
});

// ═══ Navigation highlight ═══
const navLinks = document.querySelectorAll('.settings-nav a');
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('active'));
      const link = document.querySelector(`.settings-nav a[data-section="${entry.target.id}"]`);
      if (link) link.classList.add('active');
    }
  }
}, { rootMargin: '-20% 0px -70% 0px' });
document.querySelectorAll('.section').forEach(s => observer.observe(s));

// ═══ Behavior stats ═══
async function loadBehaviorStats() {
  try {
    const res = await fetch(`${API}/behavior/stats`);
    if (res.ok) {
      const stats = await res.json();
      document.getElementById('stat-todayEvents').textContent = stats.todayEvents ?? '—';
      document.getElementById('stat-totalFiles').textContent = stats.totalFiles ?? '—';
      document.getElementById('stat-sessionEvents').textContent = stats.totalEventsSession ?? '—';
      document.getElementById('stat-avgKeypress').textContent = stats.avgKeypressIntervalMs ?? '—';
      document.getElementById('stat-avgClick').textContent = stats.avgClickDelayMs ?? '—';
    }
  } catch { /* API not ready */ }
}

// ═══ Confirm modal ═══
let modalCallback = null;
function showModal(title, text, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-text').textContent = text;
  modalCallback = onConfirm;
  document.getElementById('modal-overlay').classList.add('show');
}
document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.remove('show');
  modalCallback = null;
});
document.getElementById('modal-confirm').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.remove('show');
  if (modalCallback) modalCallback();
  modalCallback = null;
});

// Clear behavior data
document.getElementById('btn-clearBehavior').addEventListener('click', () => {
  showModal('Clear behavioral data?', 'All stored behavioral patterns will be deleted. This cannot be undone.', async () => {
    try {
      await fetch(`${API}/behavior/clear`, { method: 'POST' });
      showToast('Behavioral data cleared ✓');
      loadBehaviorStats();
    } catch { showToast('Clear failed ✕'); }
  });
});

// Export data
document.getElementById('btn-export').addEventListener('click', async () => {
  try {
    const res = await fetch(`${API}/data/export`);
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tandem-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data exported ✓');
    }
  } catch { showToast('Export failed ✕'); }
});

// Import data
const importFile = document.getElementById('import-file');
document.getElementById('btn-import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await fetch(`${API}/data/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      showToast('Data imported ✓');
      loadConfig();
    }
  } catch { showToast('Import failed ✕'); }
  importFile.value = '';
});

// Wipe all data
document.getElementById('btn-wipe').addEventListener('click', () => {
  showModal('⚠️ Clear ALL data?', 'This will delete your chat history, config, behavioral data and more. This CANNOT be undone!', async () => {
    try {
      await fetch(`${API}/data/wipe`, { method: 'POST' });
      showToast('All data cleared ✓');
      loadConfig();
      loadBehaviorStats();
    } catch { showToast('Clear failed ✕'); }
  });
});

// ═══ Theme and Help Functions ═══
function openHelpPage() {
  window.open('help.html', '_blank');
}

// Handle theme changes — apply locally via the shared module, then
// broadcast to all other renderer windows so they update too.
// Settings.html is the single broadcaster; all other windows only subscribe
// (the subscription is installed by shell/js/theme.js).
document.getElementById('cfg-theme').addEventListener('change', (e) => {
  const theme = e.target.value;
  window.TandemTheme.applyTheme(theme);
  try {
    const bc = new BroadcastChannel('tandem-theme');
    bc.postMessage({ theme });
    bc.close();
  } catch {}
});

// ═══ Chrome sync ═══
// Show/hide profile selector when sync toggled
document.getElementById('cfg-chromeBookmarks').addEventListener('change', (e) => {
  toggleField('field-chromeProfile', e.target.checked);
  // Start/stop sync via API
  if (e.target.checked) {
    fetch(`${API}/import/chrome/sync/start`, { method: 'POST' }).then(() => updateSyncStatus());
  } else {
    fetch(`${API}/import/chrome/sync/stop`, { method: 'POST' }).then(() => updateSyncStatus());
  }
});

// Load Chrome profiles into dropdown
async function loadChromeProfiles() {
  try {
    const res = await fetch(`${API}/import/chrome/profiles`);
    if (res.ok) {
      const data = await res.json();
      const select = document.getElementById('cfg-chromeProfile');
      const currentVal = select.value;
      select.innerHTML = '';
      if (data.profiles && data.profiles.length > 0) {
        for (const p of data.profiles) {
          const opt = document.createElement('option');
          opt.value = p.path;
          opt.textContent = p.name + (p.hasBookmarks ? '' : ' (no bookmarks)');
          select.appendChild(opt);
        }
      } else {
        const opt = document.createElement('option');
        opt.value = 'Default';
        opt.textContent = 'Default';
        select.appendChild(opt);
      }
      select.value = currentVal || (config.sync || {}).chromeProfile || 'Default';
    }
  } catch { /* API not ready */ }
}

// Sync status
async function updateSyncStatus() {
  try {
    const res = await fetch(`${API}/import/chrome/sync/status`);
    if (res.ok) {
      const data = await res.json();
      const statusEl = document.getElementById('sync-status-text');
      if (data.syncing) {
        statusEl.textContent = `Active — syncing with ${data.profile || 'Chrome'}`;
        statusEl.style.color = 'var(--success)';
      } else {
        statusEl.textContent = 'Not active';
        statusEl.style.color = 'var(--text-dim)';
      }
    }
  } catch { /* API not ready */ }
}

// Manual sync button
document.getElementById('btn-syncNow').addEventListener('click', async () => {
  try {
    const res = await fetch(`${API}/import/chrome/bookmarks`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      showToast(`${data.count || 0} bookmarks synced ✓`);
    } else {
      showToast('Sync failed ✕');
    }
  } catch { showToast('Sync failed ✕'); }
});

// ═══ Autonomy settings ═══
let autonomyConfig = {};

async function loadAutonomy() {
  try {
    const res = await fetch(`${API}/autonomy`);
    if (res.ok) autonomyConfig = await res.json();
  } catch { /* API not ready */ }
  applyAutonomyToUI();
}

function applyAutonomyToUI() {
  setChecked('cfg-autoApproveRead', autonomyConfig.autoApproveRead !== false);
  setChecked('cfg-autoApproveNavigate', autonomyConfig.autoApproveNavigate !== false);
  setChecked('cfg-autoApproveClick', !!autonomyConfig.autoApproveClick);
  setChecked('cfg-autoApproveType', !!autonomyConfig.autoApproveType);
  setChecked('cfg-autoApproveForms', !!autonomyConfig.autoApproveForms);
  const sitesEl = document.getElementById('cfg-trustedSites');
  if (sitesEl && autonomyConfig.trustedSites) {
    sitesEl.value = autonomyConfig.trustedSites.join('\n');
  }
}

async function saveAutonomy(patch) {
  try {
    const res = await fetch(`${API}/autonomy`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      autonomyConfig = await res.json();
      showToast('Saved ✓');
    }
  } catch { showToast('Save failed ✕'); }
}

// Autonomy toggle handlers
for (const [id, key] of [
  ['cfg-autoApproveRead', 'autoApproveRead'],
  ['cfg-autoApproveNavigate', 'autoApproveNavigate'],
  ['cfg-autoApproveClick', 'autoApproveClick'],
  ['cfg-autoApproveType', 'autoApproveType'],
  ['cfg-autoApproveForms', 'autoApproveForms'],
]) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', (e) => saveAutonomy({ [key]: e.target.checked }));
}

// Trusted sites textarea
const trustedSitesEl = document.getElementById('cfg-trustedSites');
if (trustedSitesEl) {
  trustedSitesEl.addEventListener('change', () => {
    const sites = trustedSitesEl.value.split('\n').map(s => s.trim()).filter(Boolean);
    saveAutonomy({ trustedSites: sites });
  });
}

// ═══ Extensions ═══

// Tab switching
document.querySelectorAll('#ext-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#ext-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ext-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add('active');
    // Load data on tab switch
    if (btn.dataset.tab === 'ext-installed') loadExtInstalled();
    else if (btn.dataset.tab === 'ext-chrome') loadExtChrome();
    else if (btn.dataset.tab === 'ext-gallery') loadExtGallery();
  });
});

// ── Installed tab ──
let updateStatusCache = {}; // extensionId → { latestKnownVersion, updateAvailable }
let updateStatusLoading = false; // prevent infinite loop between loadExtInstalled ↔ loadUpdateStatus

async function loadExtInstalled() {
  const container = document.getElementById('ext-installed-list');
  const updateHeader = document.getElementById('ext-update-header');
  container.innerHTML = '<div class="ext-empty">Loading...</div>';
  try {
    const res = await fetch(`${API}/extensions/list`);
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    const { loaded, available } = data;
    if (available.length === 0) {
      updateHeader.style.display = 'none';
      container.innerHTML = '<div class="ext-empty">No extensions installed yet. Use the Gallery tab to discover extensions.</div>';
      return;
    }

    // Show update header for installed extensions
    updateHeader.style.display = 'flex';

    // Fetch update status (non-blocking — use cached data if available)
    if (!updateStatusLoading) {
      loadUpdateStatus();
    }

    // Build a map of loaded extensions by path for status lookup
    const loadedByPath = {};
    for (const ext of loaded) {
      loadedByPath[ext.path] = ext;
    }
    container.innerHTML = '';
    for (const ext of available) {
      const loadedExt = loadedByPath[ext.path];
      const isLoaded = !!loadedExt;
      const hasManifest = ext.hasManifest;
      const diskId = ext.path.split('/').pop();
      const version = loadedExt ? loadedExt.version : '';
      const name = ext.name || diskId;

      let statusBadge = '';
      if (!hasManifest) {
        statusBadge = '<span class="ext-badge ext-badge-error">Error</span>';
      } else if (isLoaded) {
        statusBadge = '<span class="ext-badge ext-badge-loaded">Loaded</span>';
      } else {
        statusBadge = '<span class="ext-badge ext-badge-notloaded">Not loaded</span>';
      }

      // Update badge from cache
      let updateBadge = '';
      const updateInfo = updateStatusCache[diskId];
      if (updateInfo && updateInfo.updateAvailable) {
        updateBadge = `<span class="ext-badge ext-badge-update">Update: v${esc(version)} → v${esc(updateInfo.latestKnownVersion)}</span>`;
      }

      const card = document.createElement('div');
      card.className = 'ext-card';
      card.innerHTML = `
        <div class="ext-card-info">
          <div class="ext-card-name">${esc(name)}</div>
          <div class="ext-card-meta">
            ${version ? '<span>v' + esc(version) + '</span>' : ''}
            <span style="opacity:0.5">${esc(diskId)}</span>
            ${statusBadge}
            ${updateBadge}
          </div>
        </div>
        <div class="ext-card-actions">
          ${updateInfo && updateInfo.updateAvailable ? `<button class="btn-sm btn-primary ext-update-btn" data-id="${esc(diskId)}">Update</button>` : ''}
          <button class="btn-sm btn-danger ext-remove-btn" data-id="${esc(diskId)}">Remove</button>
        </div>
      `;
      container.appendChild(card);
    }

    // Wire update buttons
    container.querySelectorAll('.ext-update-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = 'Updating...';
        try {
          const res = await fetch(`${API}/extensions/updates/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extensionId: id }),
          });
          const data = await res.json();
          if (data.results && data.results[0] && data.results[0].success) {
            showToast(`Updated ${data.results[0].name}: v${data.results[0].previousVersion} → v${data.results[0].newVersion}`);
            delete updateStatusCache[id];
            loadExtInstalled();
          } else {
            const err = data.results?.[0]?.error || 'Update failed';
            showToast(err);
            btn.disabled = false;
            btn.textContent = 'Update';
          }
        } catch {
          showToast('Update failed');
          btn.disabled = false;
          btn.textContent = 'Update';
        }
      });
    });

    // Wire remove buttons
    container.querySelectorAll('.ext-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        showModal('Remove extension?', `This will uninstall "${id}" and remove its files.`, async () => {
          btn.disabled = true;
          btn.textContent = 'Removing...';
          try {
            const res = await fetch(`${API}/extensions/uninstall/${id}`, { method: 'DELETE' });
            if (res.ok) {
              showToast('Extension removed');
              loadExtInstalled();
            } else {
              const err = await res.json().catch(() => ({}));
              showToast(err.error || 'Remove failed');
              btn.disabled = false;
              btn.textContent = 'Remove';
            }
          } catch {
            showToast('Remove failed');
            btn.disabled = false;
            btn.textContent = 'Remove';
          }
        });
      });
    });
  } catch {
    container.innerHTML = '<div class="ext-empty">Failed to load extensions.</div>';
  }
}

// Load update status from API (background, non-blocking)
async function loadUpdateStatus() {
  if (updateStatusLoading) return;
  updateStatusLoading = true;
  const statusText = document.getElementById('ext-update-status-text');
  const updateAllBtn = document.getElementById('ext-update-all-btn');
  try {
    const res = await fetch(`${API}/extensions/updates/status`);
    if (!res.ok) return;
    const data = await res.json();
    const prevCache = JSON.stringify(updateStatusCache);
    updateStatusCache = data.extensions || {};
    const updatesAvailable = Object.values(updateStatusCache).filter(e => e.updateAvailable).length;
    // Update tab badge
    const installedTab = document.querySelector('#ext-tabs button[data-tab="ext-installed"]');
    if (installedTab) {
      installedTab.textContent = updatesAvailable > 0 ? `Installed (${updatesAvailable})` : 'Installed';
    }

    if (updatesAvailable > 0) {
      statusText.textContent = `${updatesAvailable} update${updatesAvailable > 1 ? 's' : ''} available`;
      updateAllBtn.style.display = '';
    } else if (data.lastCheck) {
      const ago = timeSince(new Date(data.lastCheck));
      statusText.textContent = `All up to date (checked ${ago})`;
      updateAllBtn.style.display = 'none';
    } else {
      statusText.textContent = 'Updates not checked yet';
      updateAllBtn.style.display = 'none';
    }
    // Re-render installed list to show update badges only if cache changed
    if (JSON.stringify(updateStatusCache) !== prevCache) {
      updateStatusLoading = true; // keep flag true during re-render
      loadExtInstalled();
    }
  } catch { /* ignore */ }
  updateStatusLoading = false;
}

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Wire Check for Updates button
document.getElementById('ext-check-updates-btn').addEventListener('click', async function() {
  this.disabled = true;
  this.textContent = 'Checking...';
  const statusText = document.getElementById('ext-update-status-text');
  statusText.textContent = 'Checking for updates...';
  try {
    const res = await fetch(`${API}/extensions/updates/check`);
    if (!res.ok) throw new Error('Check failed');
    const data = await res.json();
    const updatesAvailable = data.updatesAvailable ? data.updatesAvailable.length : 0;
    // Update cache from check results
    if (data.results) {
      for (const r of data.results) {
        updateStatusCache[r.extensionId] = {
          installedVersion: r.installedVersion,
          latestKnownVersion: r.latestVersion,
          updateAvailable: r.updateAvailable,
        };
      }
    }
    if (updatesAvailable > 0) {
      showToast(`${updatesAvailable} update${updatesAvailable > 1 ? 's' : ''} available`);
    } else {
      showToast(`All ${data.checked} extensions are up to date`);
    }
    loadExtInstalled();
  } catch {
    showToast('Update check failed');
  }
  this.disabled = false;
  this.textContent = 'Check for Updates';
});

// Wire Update All button
document.getElementById('ext-update-all-btn').addEventListener('click', async function() {
  this.disabled = true;
  this.textContent = 'Updating...';
  try {
    const res = await fetch(`${API}/extensions/updates/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    const results = data.results || [];
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    if (success > 0) {
      showToast(`${success} extension${success > 1 ? 's' : ''} updated${failed > 0 ? `, ${failed} failed` : ''}`);
    } else if (failed > 0) {
      showToast(`${failed} update${failed > 1 ? 's' : ''} failed`);
    } else {
      showToast('No updates to apply');
    }
    updateStatusCache = {};
    loadExtInstalled();
  } catch {
    showToast('Update failed');
  }
  this.disabled = false;
  this.textContent = 'Update All';
});

// ── From Chrome tab ──
async function loadExtChrome() {
  const container = document.getElementById('ext-chrome-list');
  container.innerHTML = '<div class="ext-empty">Loading...</div>';
  try {
    const res = await fetch(`${API}/extensions/chrome/list`);
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    if (!data.chromeDir) {
      container.innerHTML = '<div class="ext-empty">Chrome not found on this system.</div>';
      return;
    }
    if (!data.extensions || data.extensions.length === 0) {
      container.innerHTML = '<div class="ext-empty">No extensions found in Chrome.</div>';
      return;
    }
    container.innerHTML = '';
    for (const ext of data.extensions) {
      const card = document.createElement('div');
      card.className = 'ext-card';
      card.innerHTML = `
        <div class="ext-card-info">
          <div class="ext-card-name">${esc(ext.name)}</div>
          <div class="ext-card-meta">
            ${ext.version ? '<span>v' + esc(ext.version) + '</span>' : ''}
          </div>
        </div>
        <div class="ext-card-actions">
          ${ext.alreadyImported
            ? '<span class="ext-badge ext-badge-imported">Imported</span>'
            : '<button class="btn-sm btn-primary ext-chrome-import-btn" data-id="' + esc(ext.id) + '">Import</button>'
          }
        </div>
      `;
      container.appendChild(card);
    }
    // Wire import buttons
    container.querySelectorAll('.ext-chrome-import-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.innerHTML = '<span class="ext-spinner"></span>';
        try {
          const res = await fetch(`${API}/extensions/chrome/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extensionId: btn.dataset.id }),
          });
          if (res.ok) {
            btn.outerHTML = '<span class="ext-badge ext-badge-imported">Imported</span>';
            showToast('Extension imported');
          } else {
            const err = await res.json().catch(() => ({}));
            btn.disabled = false;
            btn.textContent = 'Import';
            showToast(err.error || 'Import failed');
          }
        } catch {
          btn.disabled = false;
          btn.textContent = 'Import';
          showToast('Import failed');
        }
      });
    });
  } catch {
    container.innerHTML = '<div class="ext-empty">Failed to load Chrome extensions.</div>';
  }
}

// Import All button
document.getElementById('ext-chrome-import-all').addEventListener('click', async () => {
  const btn = document.getElementById('ext-chrome-import-all');
  btn.disabled = true;
  btn.textContent = 'Importing...';
  try {
    const res = await fetch(`${API}/extensions/chrome/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      const data = await res.json();
      showToast(`${data.imported || 0} imported, ${data.skipped || 0} skipped`);
      loadExtChrome();
    } else {
      showToast('Import failed');
    }
  } catch {
    showToast('Import failed');
  }
  btn.disabled = false;
  btn.textContent = 'Import All';
});

// ── Gallery tab ──
let galleryActiveCategory = null;

async function loadExtGallery(category) {
  galleryActiveCategory = category || null;
  const container = document.getElementById('ext-gallery-list');
  const filtersContainer = document.getElementById('ext-gallery-filters');
  container.innerHTML = '<div class="ext-empty">Loading...</div>';
  try {
    const url = new URL(`${API}/extensions/gallery`);
    if (category) url.searchParams.set('category', category);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    // Render category filters
    const allCategories = data.categories || [];
    filtersContainer.innerHTML = '';
    const allPill = document.createElement('button');
    allPill.className = 'ext-category-pill' + (!category ? ' active' : '');
    allPill.textContent = 'All';
    allPill.addEventListener('click', () => loadExtGallery(null));
    filtersContainer.appendChild(allPill);
    for (const cat of allCategories) {
      const pill = document.createElement('button');
      pill.className = 'ext-category-pill' + (category === cat ? ' active' : '');
      pill.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      pill.addEventListener('click', () => loadExtGallery(cat));
      filtersContainer.appendChild(pill);
    }
    // Render extensions — featured first
    const extensions = (data.extensions || []).sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return 0;
    });
    if (extensions.length === 0) {
      container.innerHTML = '<div class="ext-empty">No extensions found.</div>';
      return;
    }
    container.innerHTML = '';
    for (const ext of extensions) {
      let compatBadge = '';
      if (ext.compatibility === 'works') compatBadge = '<span class="ext-badge ext-badge-works">Works</span>';
      else if (ext.compatibility === 'partial') compatBadge = '<span class="ext-badge ext-badge-partial">Partial</span>';
      else if (ext.compatibility === 'needs-work') compatBadge = '<span class="ext-badge ext-badge-needs-work">Needs Setup</span>';

      let conflictBadge = '';
      if (ext.securityConflict === 'dnr-overlap') conflictBadge = '<span class="ext-badge ext-badge-dnr">DNR Overlap</span>';
      else if (ext.securityConflict === 'native-messaging') conflictBadge = '<span class="ext-badge ext-badge-native">Native Messaging</span>';

      const featuredBadge = ext.featured ? '<span class="ext-badge ext-badge-featured">Featured</span>' : '';

      const card = document.createElement('div');
      card.className = 'ext-card';
      card.innerHTML = `
        <div class="ext-card-info">
          <div class="ext-card-name">${esc(ext.name)}</div>
          <div class="ext-card-desc">${esc(ext.description)}</div>
          <div class="ext-card-meta">
            ${featuredBadge}
            ${compatBadge}
            ${conflictBadge}
          </div>
        </div>
        <div class="ext-card-actions">
          ${ext.installed
            ? '<span class="ext-badge ext-badge-installed">Installed</span>'
            : '<button class="btn-sm btn-primary ext-gallery-install-btn" data-id="' + esc(ext.id) + '">Install</button>'
          }
        </div>
      `;
      container.appendChild(card);
    }
    // Wire install buttons
    container.querySelectorAll('.ext-gallery-install-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.innerHTML = '<span class="ext-spinner"></span>';
        // Add error container
        const card = btn.closest('.ext-card');
        let errEl = card.querySelector('.ext-error-msg');
        if (errEl) errEl.remove();
        try {
          const res = await fetch(`${API}/extensions/install`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: btn.dataset.id }),
          });
          if (res.ok) {
            btn.outerHTML = '<span class="ext-badge ext-badge-installed">Installed</span>';
            showToast('Extension installed');
          } else {
            const err = await res.json().catch(() => ({}));
            btn.disabled = false;
            btn.textContent = originalText;
            errEl = document.createElement('div');
            errEl.className = 'ext-error-msg';
            errEl.textContent = err.error || 'Install failed';
            card.querySelector('.ext-card-info').appendChild(errEl);
          }
        } catch {
          btn.disabled = false;
          btn.textContent = originalText;
          errEl = document.createElement('div');
          errEl.className = 'ext-error-msg';
          errEl.textContent = 'Install failed — check connection';
          card.querySelector('.ext-card-info').appendChild(errEl);
        }
      });
    });
  } catch {
    container.innerHTML = '<div class="ext-empty">Failed to load gallery.</div>';
  }
}

// HTML escape helper — shared module (shell/js/html-escape.js, loaded in
// <head>). Also escapes quotes, so esc() is safe in attribute positions
// (value="...", data-id="..."), which the old textContent-based helper was not.
const esc = window.tandemEscape.escapeHtml;

// ═══ Connected Agents ═══
let activeSetupCode = null;
let codeTimerInterval = null;
let codePollInterval = null;
let selectedMode = null; // 'local' | 'remote'
let detectedAddresses = null;

function parseApiPortInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, error: 'Agent API port is required.' };
  if (!/^\d+$/.test(raw)) return { ok: false, error: 'Agent API port must contain digits only.' };
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'Agent API port must be between 1 and 65535.' };
  }
  return { ok: true, port };
}

function updateAgentApiPreview() {
  const g = config.general || {};
  const portInput = document.getElementById('cfg-apiPort');
  const validation = document.getElementById('agent-api-validation');
  const parsed = parseApiPortInput(portInput?.value || g.apiPort || 8765);
  const port = parsed.ok ? parsed.port : (g.apiPort || 8765);
  const listenHost = g.apiListenHost || '0.0.0.0';
  document.getElementById('agent-api-local-preview').textContent = `http://127.0.0.1:${port}`;
  document.getElementById('agent-api-listen-host').textContent = listenHost;

  if (validation) {
    validation.style.display = parsed.ok ? 'none' : '';
    validation.textContent = parsed.ok ? '' : parsed.error;
  }

  const remote = document.getElementById('agent-api-remote-preview');
  if (!remote) return;
  if (detectedAddresses?.remoteAccess?.enabled === false) {
    remote.textContent = detectedAddresses.remoteAccess.reason || 'Remote access disabled in local-only mode.';
  } else if (detectedAddresses?.tailscale?.address) {
    remote.textContent = detectedAddresses.tailscale.address.replace(/:\d+$/, `:${port}`);
  } else {
    remote.textContent = 'No Tailscale address detected.';
  }
}

async function saveAgentApiPort() {
  const input = document.getElementById('cfg-apiPort');
  const parsed = parseApiPortInput(input.value);
  updateAgentApiPreview();
  if (!parsed.ok) return;
  try {
    const previousPort = config.general?.apiPort || 8765;
    const saved = await saveConfig({ general: { apiPort: parsed.port } });
    if (!saved) {
      input.value = String(config.general?.apiPort || 8765);
      updateAgentApiPreview();
      return;
    }
    if (previousPort !== parsed.port) {
      showToast('Saved. Restart Tandem to use the new port.');
    }
    await loadAddresses();
    updateAgentApiPreview();
    if (selectedMode) selectAgentMode(selectedMode);
  } catch {
    showToast('Save failed ✕');
  }
}

async function loadAddresses() {
  try {
    const res = await fetch(`${API}/pairing/addresses`);
    if (res.ok) detectedAddresses = await res.json();
  } catch { /* API not ready */ }
  updateAgentApiPreview();
}

function selectAgentMode(mode) {
  selectedMode = mode;
  // Update button styles
  const localBtn = document.getElementById('agent-mode-local-btn');
  const remoteBtn = document.getElementById('agent-mode-remote-btn');
  localBtn.className = mode === 'local' ? 'btn btn-primary' : 'btn btn-secondary';
  remoteBtn.className = mode === 'remote' ? 'btn btn-primary' : 'btn btn-secondary';

  const detail = document.getElementById('agent-mode-detail');
  const info = document.getElementById('agent-mode-info');
  const connectBtn = document.getElementById('agent-connect-btn');
  detail.style.display = '';

  if (mode === 'local') {
    const addr = detectedAddresses ? detectedAddresses.local.address : `${API}`;
    info.innerHTML = `
      <p class="field-desc">Your AI and Tandem are on the same machine.</p>
      <p class="field-desc" style="margin-top:4px;">Tandem will generate a ready-to-paste instruction block for your AI.</p>
      <div style="font-size:13px;color:var(--text-dim);margin-top:6px;">
        Tandem address: <strong style="color:var(--text)">${esc(addr)}</strong>
      </div>`;
    connectBtn.disabled = false;
    connectBtn.textContent = 'Generate connection instructions';
  } else {
    if (detectedAddresses && detectedAddresses.remoteAccess && !detectedAddresses.remoteAccess.enabled) {
      info.innerHTML = `
        <p class="field-desc" style="color:var(--warning)">Remote agent access is disabled.</p>
        <p class="field-desc" style="margin-top:4px;">${esc(detectedAddresses.remoteAccess.reason || 'The Agent API is listening on loopback only.')}</p>`;
      connectBtn.disabled = true;
      connectBtn.textContent = 'Remote access disabled';
    } else if (detectedAddresses && detectedAddresses.tailscale.available) {
      const addr = detectedAddresses.tailscale.address;
      info.innerHTML = `
        <p class="field-desc">Your AI runs on another machine in your Tailscale network.</p>
        <p class="field-desc" style="margin-top:4px;">Tandem will generate a ready-to-paste instruction block for your remote AI.</p>
        <div style="font-size:13px;color:var(--text-dim);margin-top:6px;">
          Tandem address: <strong style="color:var(--text)">${esc(addr)}</strong>
        </div>
        <p class="field-desc" style="margin-top:6px;font-size:11px;">Both machines must be on the same Tailscale network. Tandem is never exposed to the public internet.</p>`;
      connectBtn.disabled = false;
      connectBtn.textContent = 'Generate connection instructions';
    } else {
      info.innerHTML = `
        <p class="field-desc" style="color:var(--warning)">No Tailscale connection detected.</p>
        <p class="field-desc" style="margin-top:4px;">Remote connections require Tailscale. Make sure Tailscale is running and this machine is connected to your tailnet.</p>
        <p class="field-desc" style="margin-top:4px;font-size:11px;">Tandem only supports remote connections over private Tailscale networks, never over the public internet.</p>`;
      connectBtn.disabled = true;
      connectBtn.textContent = 'Tailscale not available';
    }
  }
}

function buildInstructionText(code, mode) {
  const addr = mode === 'local'
    ? (detectedAddresses ? detectedAddresses.local.address : `${API}`)
    : detectedAddresses.tailscale.address;

  if (mode === 'local') {
    return [
      `Connect to Tandem Browser on this machine.`,
      ``,
      `Tandem address: ${addr}`,
      `Setup code: ${code}`,
      ``,
      `Read ${addr}/agent first. It explains how this Tandem instance works.`,
      ``,
      `Then exchange the setup code for a connection token:`,
      `POST ${addr}/pairing/exchange`,
      `Body: { "code": "${code}", "machineId": "<your-machine-id>", "machineName": "<your-hostname>", "agentLabel": "<your-name>", "agentType": "<your-type>", "bindingKind": "local" }`,
      ``,
      `Use the returned token as: Authorization: Bearer <token>`,
      `Store it securely.`,
    ].join('\n');
  } else {
    return [
      `Connect to Tandem Browser on another machine via Tailscale.`,
      `Both machines must be on the same Tailscale network.`,
      ``,
      `Tandem address: ${addr}`,
      `Setup code: ${code}`,
      ``,
      `Read ${addr}/agent first. It explains how this Tandem instance works.`,
      ``,
      `Then exchange the setup code for a connection token:`,
      `POST ${addr}/pairing/exchange`,
      `Body: { "code": "${code}", "machineId": "<your-machine-id>", "machineName": "<your-hostname>", "agentLabel": "<your-name>", "agentType": "<your-type>", "bindingKind": "remote", "transport": ["http", "mcp"] }`,
      ``,
      `Use the returned token as: Authorization: Bearer <token>`,
      `Store it securely.`,
      ``,
      `MCP access (recommended for Claude Code, Cursor, etc.):`,
      `After pairing, add this to your MCP client config:`,
      `{`,
      `  "mcpServers": {`,
      `    "tandem": {`,
      `      "type": "streamable-http",`,
      `      "url": "${addr}/mcp",`,
      `      "headers": { "Authorization": "Bearer <your-token>" }`,
      `    }`,
      `  }`,
      `}`,
      ``,
      `This connection works only over Tailscale. Tandem is not exposed to the public internet.`,
    ].join('\n');
  }
}

async function generateAndShowInstructions() {
  try {
    const res = await fetch(`${API}/pairing/setup-code`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Failed to generate code');
      return;
    }
    const data = await res.json();
    activeSetupCode = data;

    // Hide onboarding controls, show instruction area
    document.getElementById('agent-onboard').style.display = 'none';
    document.getElementById('agent-mode-detail').style.display = 'none';
    const area = document.getElementById('agent-instruction-area');
    area.style.display = '';

    document.getElementById('agent-code-display').textContent = data.code;
    document.getElementById('agent-instruction-text').value = buildInstructionText(data.code, selectedMode);

    // Countdown timer
    if (codeTimerInterval) clearInterval(codeTimerInterval);
    codeTimerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      document.getElementById('agent-code-timer').textContent = remaining > 0
        ? `Expires in ${m}:${s.toString().padStart(2, '0')}`
        : 'Expired';
      if (remaining <= 0) {
        clearInterval(codeTimerInterval);
        cancelSetupCode();
      }
    }, 1000);

    // Poll for new bindings
    if (codePollInterval) clearInterval(codePollInterval);
    let lastCount = -1;
    codePollInterval = setInterval(async () => {
      try {
        const bRes = await fetch(`${API}/pairing/bindings`);
        if (!bRes.ok) return;
        const bindings = await bRes.json();
        if (lastCount >= 0 && bindings.length > lastCount) {
          renderAgentBindings(bindings);
          cancelSetupCode();
          showToast('Agent connected');
        } else {
          lastCount = bindings.length;
        }
      } catch { /* ignore */ }
    }, 2000);
  } catch {
    showToast('Failed to generate setup code');
  }
}

function cancelSetupCode() {
  activeSetupCode = null;
  if (codeTimerInterval) clearInterval(codeTimerInterval);
  if (codePollInterval) clearInterval(codePollInterval);
  document.getElementById('agent-instruction-area').style.display = 'none';
  document.getElementById('agent-onboard').style.display = '';
  if (selectedMode) {
    document.getElementById('agent-mode-detail').style.display = '';
  }
}

function copyInstructions() {
  const text = document.getElementById('agent-instruction-text').value;
  navigator.clipboard.writeText(text).then(() => showToast('Instructions copied'));
}

async function loadAgentBindings() {
  try {
    const res = await fetch(`${API}/pairing/bindings`);
    if (!res.ok) return;
    const bindings = await res.json();
    renderAgentBindings(bindings);
  } catch { /* API not ready */ }
}

function renderAgentBindings(bindings) {
  const container = document.getElementById('agent-bindings-list');
  const noBindings = document.getElementById('agent-no-bindings');

  if (!bindings || bindings.length === 0) {
    noBindings.style.display = '';
    container.querySelectorAll('.agent-card').forEach(c => c.remove());
    return;
  }

  noBindings.style.display = 'none';
  container.querySelectorAll('.agent-card').forEach(c => c.remove());

  for (const b of bindings) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.style.cssText = 'background: var(--surface2); border-radius: 8px; padding: 14px 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';

    const statusColor = b.state === 'paired' ? 'var(--success)' : b.state === 'paused' ? 'var(--warning)' : 'var(--danger)';
    const statusDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};margin-right:6px"></span>`;
    const lastUsed = b.lastUsedAt ? new Date(b.lastUsedAt).toLocaleString() : 'never';

    // CSP forbids inline onclick handlers — buttons carry data attributes and
    // are wired below via addEventListener.
    card.innerHTML = `
      <div>
        <div style="font-weight:500;font-size:14px">${statusDot}${esc(b.agentLabel)}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
          ${esc(b.machineName)} · ${esc(b.agentType)} · last used: ${esc(lastUsed)}
        </div>
      </div>
      <div style="display:flex;gap:6px">
        ${b.state === 'paired' ? `<button class="btn-sm btn-secondary" data-agent-action="pause" data-binding-id="${esc(b.id)}">Pause</button>` : ''}
        ${b.state === 'paused' ? `<button class="btn-sm btn-secondary" data-agent-action="resume" data-binding-id="${esc(b.id)}">Resume</button>` : ''}
        ${b.state !== 'revoked' ? `<button class="btn-sm btn-secondary" style="color:var(--warning)" data-agent-action="revoke" data-binding-id="${esc(b.id)}">Revoke</button>` : ''}
        <button class="btn-sm btn-secondary" style="color:var(--danger)" data-agent-action="remove" data-binding-id="${esc(b.id)}">Remove</button>
      </div>
    `;
    card.querySelectorAll('[data-agent-action]').forEach(btn => {
      btn.addEventListener('click', () => agentAction(btn.dataset.bindingId, btn.dataset.agentAction));
    });
    container.appendChild(card);
  }
}

async function agentAction(id, action) {
  try {
    if (action === 'remove') {
      const res = await fetch(`${API}/pairing/bindings/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Agent removed'); loadAgentBindings(); }
    } else {
      const res = await fetch(`${API}/pairing/bindings/${id}/${action}`, { method: 'POST' });
      if (res.ok) {
        showToast(`Agent ${action}d`);
        loadAgentBindings();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || `Failed to ${action}`);
      }
    }
  } catch {
    showToast(`Failed to ${action} agent`);
  }
}

// ═══ Init ═══
// CSP forbids inline onclick attributes — wire the static buttons here.
document.getElementById('open-help-btn')?.addEventListener('click', openHelpPage);
document.getElementById('agent-mode-local-btn')?.addEventListener('click', () => selectAgentMode('local'));
document.getElementById('agent-mode-remote-btn')?.addEventListener('click', () => selectAgentMode('remote'));
document.getElementById('agent-connect-btn')?.addEventListener('click', generateAndShowInstructions);
document.getElementById('agent-copy-instructions-btn')?.addEventListener('click', copyInstructions);
document.getElementById('agent-cancel-code-btn')?.addEventListener('click', cancelSetupCode);

loadConfig();
loadAutonomy();
loadBehaviorStats();
loadChromeProfiles();
updateSyncStatus();
loadExtInstalled();
loadAddresses();
loadAgentBindings();
// Refresh stats every 10s
setInterval(loadBehaviorStats, 10000);
