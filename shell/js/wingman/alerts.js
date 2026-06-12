/**
 * Wingman alert overlay — transient "agent needs you" toasts.
 *
 * Loaded from: shell/js/wingman/index.js
 * window exports: dismissAlert (kept for shortcut-router and console use)
 */

let _overlay = null;

export function initAlerts(renderer) {
  _overlay = renderer.overlay;

  // CSP forbids inline onclick handlers — bind the dismiss button here.
  document.getElementById('wingman-alert-dismiss')?.addEventListener('click', dismissAlert);

  if (window.tandem) {
    window.tandem.onWingmanAlert((data) => {
      document.getElementById('alert-title').textContent = data.title;
      document.getElementById('alert-body').textContent = data.body;
      _overlay?.classList.add('visible');
      setTimeout(dismissAlert, 15000);
    });
  }
}

export function dismissAlert() {
  _overlay?.classList.remove('visible');
}

window.dismissAlert = dismissAlert;
