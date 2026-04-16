/**
 * Shared sidebar utilities — small pure helpers used by multiple panels.
 *
 * Loaded from: shell/js/sidebar/panels/bookmarks.js, shell/js/sidebar/panels/history.js
 * window exports: none
 */

export function getFaviconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
  catch { return null; }
}
