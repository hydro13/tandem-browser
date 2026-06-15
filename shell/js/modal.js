// ── Modal helpers (replaces native prompt/confirm in Electron) ──────────────
function _modalShow(title, message, inputs, buttons) {
  return new Promise(resolve => {
    const overlay = document.getElementById('tandem-modal-overlay');
    const titleEl = document.getElementById('tandem-modal-title');
    const msgEl   = document.getElementById('tandem-modal-message');
    const inpEl   = document.getElementById('tandem-modal-inputs');
    const btnEl   = document.getElementById('tandem-modal-buttons');

    titleEl.textContent = title;
    if (message) { msgEl.textContent = message; msgEl.style.display = 'block'; }
    else          { msgEl.style.display = 'none'; }

    inpEl.innerHTML = '';
    const fields = inputs.map(inp => {
      const el = document.createElement('input');
      el.type = 'text'; el.placeholder = inp.placeholder || '';
      el.value = inp.defaultValue || '';
      inpEl.appendChild(el);
      return el;
    });

    btnEl.innerHTML = '';
    buttons.forEach(btn => {
      const b = document.createElement('button');
      b.textContent = btn.label;
      b.className = btn.className || 'tandem-modal-btn-ok';
      b.onclick = () => {
        overlay.classList.add('hidden');
        resolve(btn.value !== undefined ? btn.value : fields.map(f => f.value));
      };
      btnEl.appendChild(b);
    });

    overlay.classList.remove('hidden');
    if (fields.length) fields[0].focus();

    // Enter key submits first OK button
    const handler = e => {
      if (e.key === 'Enter') {
        overlay.classList.add('hidden');
        overlay.removeEventListener('keydown', handler);
        const okBtn = buttons.find(b => b.isOk);
        resolve(okBtn?.value !== undefined ? okBtn.value : fields.map(f => f.value));
      } else if (e.key === 'Escape') {
        overlay.classList.add('hidden');
        overlay.removeEventListener('keydown', handler);
        const cancelBtn = buttons.find(b => b.isCancel);
        resolve(cancelBtn?.value !== undefined ? cancelBtn.value : null);
      }
    };
    overlay.addEventListener('keydown', handler);
  });
}

async function showPrompt(title, placeholder, defaultValue = '') {
  const result = await _modalShow(title, null,
    [{ placeholder, defaultValue }],
    [
      { label: 'Cancel', className: 'tandem-modal-btn-cancel', isCancel: true, value: null },
      { label: 'OK',     className: 'tandem-modal-btn-ok',     isOk:    true }
    ]
  );
  if (result === null) return null;
  const val = Array.isArray(result) ? result[0] : result;
  return val?.trim() || null;
}

async function showConfirm(title, message) {
  const result = await _modalShow(title, message, [],
    [
      { label: 'Cancel', className: 'tandem-modal-btn-cancel', isCancel: true, value: false },
      { label: 'Delete', className: 'tandem-modal-btn-danger', isOk:    true, value: true }
    ]
  );
  return result === true;
}

// Cross-file consumers (e.g. shell/js/sidebar/panels/pinboard.js) reach these via window.
window.showPrompt = showPrompt;
window.showConfirm = showConfirm;
