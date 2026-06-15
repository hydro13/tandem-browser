/**
 * Pre-paint theme stamp for webview-loaded shell pages.
 *
 * The main BrowserWindow gets the theme via preload+additionalArguments, but
 * webviews don't inherit that path — so we do a tiny sync XHR here to stamp
 * data-theme before the inline <style> blocks are processed by the parser.
 * Sync XHR is deprecated (console warning), but it's the only way to avoid a
 * dark→light flash. Fails silently if the API isn't up.
 *
 * Loaded as a classic script in <head>, right after js/api-base.js, on every
 * standalone shell page (newtab, settings, bookmarks, about, help). Classic
 * scripts block parsing, so the stamp still lands before first paint even
 * though the code now lives in an external file (CSP: no inline scripts).
 */
(function () {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', ((window.__TANDEM_API_BASE__ || 'http://127.0.0.1:8765') + '/config'), false);
    xhr.send();
    if (xhr.status === 200) {
      var cfg = JSON.parse(xhr.responseText);
      var theme = (cfg && cfg.appearance && cfg.appearance.theme) || 'dark';
      if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else if (theme === 'system') document.documentElement.setAttribute('data-theme', 'system');
    }
  } catch (e) { /* API not ready; theme.js will apply on load */ }
})();
