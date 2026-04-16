/**
 * Wingman alert overlay — transient "agent needs you" toasts.
 *
 * Loaded from: shell/js/wingman/index.js
 * window exports: dismissAlert (inline onclick in index.html needs this)
 */

let _overlay = null;

export function initAlerts(renderer) {
  _overlay = renderer.overlay;

  if (window.tandem) {
    window.tandem.onWingmanAlert((data) => {
      document.getElementById('alert-title').textContent = data.title;
      document.getElementById('alert-body').textContent = data.body;
      _overlay.classList.add('visible');
      setTimeout(dismissAlert, 15000);
    });
  }
}

export function dismissAlert() {
  _overlay?.classList.remove('visible');
}

// Inline onclick="dismissAlert()" in shell/index.html requires this binding
window.dismissAlert = dismissAlert;
