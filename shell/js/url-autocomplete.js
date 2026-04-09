/**
 * URL Autocomplete — Chrome-style autocomplete for the URL bar.
 * Queries GET /history/search?q=<query> and shows a dropdown + inline completion.
 */
(() => {
  const API_BASE = 'http://localhost:8765';
  const DEBOUNCE_MS = 200;
  const MIN_CHARS = 2;
  const MAX_RESULTS = 8;

  let dropdown = null;
  let items = [];
  let selectedIndex = -1;
  let abortController = null;
  let debounceTimer = null;
  let originalValue = '';  // what the user actually typed
  let isOpen = false;

  function init(urlBar, onNavigate) {
    dropdown = document.createElement('div');
    dropdown.className = 'url-autocomplete-dropdown';
    dropdown.style.display = 'none';
    // Append to toolbar so we can position relative to it
    urlBar.closest('.toolbar').appendChild(dropdown);

    // Prevent dropdown clicks from stealing focus / triggering blur
    dropdown.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.url-autocomplete-item');
      if (item) {
        const url = item.dataset.url;
        urlBar.value = url;
        close();
        onNavigate(url);
      }
    });

    urlBar.addEventListener('input', () => {
      originalValue = urlBar.value;
      scheduleSearch(urlBar);
    });

    urlBar.addEventListener('keydown', (e) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectItem((selectedIndex + 1) % items.length, urlBar);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectItem(selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1, urlBar);
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && items[selectedIndex]) {
          e.preventDefault();
          e.stopImmediatePropagation();  // prevent tabs.js Enter handler
          const url = items[selectedIndex].url;
          urlBar.value = url;
          close();
          onNavigate(url);
        } else if (hasInlineCompletion(urlBar)) {
          // Accept inline completion — let tabs.js handle the full URL
          acceptInlineCompletion(urlBar);
          close();
        } else {
          close();
          // Let tabs.js Enter handler fire
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        urlBar.value = originalValue;
        close();
      } else if (e.key === 'Tab' || (e.key === 'ArrowRight' && hasInlineCompletion(urlBar))) {
        if (hasInlineCompletion(urlBar)) {
          e.preventDefault();
          acceptInlineCompletion(urlBar);
          close();
        }
      }
    });

    urlBar.addEventListener('blur', () => {
      // Small delay to allow click events on dropdown items
      setTimeout(() => close(), 100);
    });

    // When url-bar gets focus and already has text (e.g. clicking back into it),
    // don't auto-trigger — only trigger on actual input.
  }

  function scheduleSearch(urlBar) {
    clearTimeout(debounceTimer);
    const query = originalValue.trim();
    if (query.length < MIN_CHARS) {
      close();
      return;
    }
    debounceTimer = setTimeout(() => fetchSuggestions(query, urlBar), DEBOUNCE_MS);
  }

  async function fetchSuggestions(query, urlBar) {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    try {
      const token = window.__TANDEM_TOKEN__ || '';
      const res = await fetch(
        `${API_BASE}/history/search?q=${encodeURIComponent(query)}`,
        {
          signal: abortController.signal,
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!res.ok) return;
      const data = await res.json();
      const results = (data.results || []).slice(0, MAX_RESULTS);

      if (results.length === 0) {
        close();
        return;
      }

      items = results;
      selectedIndex = -1;
      renderDropdown(query);
      applyInlineCompletion(urlBar, query, results[0]);
      isOpen = true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        close();
      }
    }
  }

  function renderDropdown(query) {
    dropdown.innerHTML = '';
    const lowerQuery = query.toLowerCase();

    items.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'url-autocomplete-item';
      el.dataset.url = item.url;
      el.dataset.index = index;

      const titleEl = document.createElement('div');
      titleEl.className = 'url-autocomplete-title';
      titleEl.innerHTML = highlightMatch(item.title || item.url, lowerQuery);

      const urlEl = document.createElement('div');
      urlEl.className = 'url-autocomplete-url';
      urlEl.innerHTML = highlightMatch(item.url, lowerQuery);

      el.appendChild(titleEl);
      el.appendChild(urlEl);
      dropdown.appendChild(el);

      el.addEventListener('mouseenter', () => {
        selectItem(index, null);  // visual only, no inline completion change
      });
    });

    dropdown.style.display = 'block';
    isOpen = true;
  }

  function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx === -1) return escapeHtml(text);
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return escapeHtml(before) + '<strong>' + escapeHtml(match) + '</strong>' + escapeHtml(after);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function selectItem(index, urlBar) {
    const prevEl = dropdown.querySelector('.url-autocomplete-item.selected');
    if (prevEl) prevEl.classList.remove('selected');

    selectedIndex = index;
    const el = dropdown.querySelector(`.url-autocomplete-item[data-index="${index}"]`);
    if (el) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest' });
    }

    // When navigating with arrows, show the selected URL in the input
    if (urlBar && items[index]) {
      urlBar.value = items[index].url;
      urlBar.setSelectionRange(urlBar.value.length, urlBar.value.length);
    }
  }

  function applyInlineCompletion(urlBar, typed, topResult) {
    if (!topResult || !topResult.url) return;

    // Strip protocol for matching
    const normalize = (u) => u.replace(/^https?:\/\//, '').replace(/^www\./, '');
    const normalizedUrl = normalize(topResult.url);
    const normalizedTyped = normalize(typed).toLowerCase();

    if (normalizedUrl.toLowerCase().startsWith(normalizedTyped)) {
      // Build the completed value: user's typed text + rest of the URL
      const completion = normalizedUrl.slice(normalizedTyped.length);
      const fullValue = typed + completion;
      urlBar.value = fullValue;
      urlBar.setSelectionRange(typed.length, fullValue.length);
    }
  }

  function hasInlineCompletion(urlBar) {
    return urlBar.selectionStart !== urlBar.selectionEnd &&
           urlBar.selectionEnd === urlBar.value.length &&
           urlBar.selectionStart > 0;
  }

  function acceptInlineCompletion(urlBar) {
    urlBar.setSelectionRange(urlBar.value.length, urlBar.value.length);
    originalValue = urlBar.value;
  }

  function close() {
    if (!isOpen && dropdown.style.display === 'none') return;
    dropdown.style.display = 'none';
    items = [];
    selectedIndex = -1;
    isOpen = false;
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    clearTimeout(debounceTimer);
  }

  // Expose init globally
  window.__urlAutocomplete = { init };
})();
