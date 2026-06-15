/**
 * Shared sidebar utilities — small pure helpers used by multiple panels.
 *
 * Loaded from: shell/js/sidebar/panels/bookmarks.js, shell/js/sidebar/panels/history.js
 * window exports: none
 */

import '../html-escape.js';

// Re-export of the shared escaper (shell/js/html-escape.js) for ES modules.
export const { escapeHtml, escapeHtmlMultiline } = window.tandemEscape;

export function getFaviconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=32`; }
  catch { return null; }
}

// CSP-safe replacement for inline onerror= favicon fallbacks: hide every
// img[data-favicon] under root that fails to load.
export function wireFaviconFallbacks(root) {
  if (!root) return;
  root.querySelectorAll('img[data-favicon]').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });
}
