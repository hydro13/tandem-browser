/**
 * Screenshot button + region-capture drag overlay.
 *
 * Loaded from: shell/js/wingman/index.js
 * window exports: none
 */

const screenshotButton = document.getElementById('btn-screenshot');
const regionOverlay = document.getElementById('region-capture-overlay');
const regionBox = document.getElementById('region-capture-box');

function updateRegionBox(startX, startY, currentX, currentY) {
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  regionBox.style.display = 'block';
  regionBox.style.left = `${left}px`;
  regionBox.style.top = `${top}px`;
  regionBox.style.width = `${width}px`;
  regionBox.style.height = `${height}px`;
}

export function selectRegion() {
  return new Promise((resolve) => {
    let startX = 0;
    let startY = 0;
    let dragging = false;

    regionOverlay.classList.add('active');
    regionBox.style.display = 'none';

    const cleanup = (result = null) => {
      regionOverlay.classList.remove('active');
      regionBox.style.display = 'none';
      regionOverlay.removeEventListener('mousedown', onMouseDown);
      regionOverlay.removeEventListener('mousemove', onMouseMove);
      regionOverlay.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown, true);
      resolve(result);
    };

    const onMouseDown = (event) => {
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      updateRegionBox(startX, startY, startX, startY);
    };

    const onMouseMove = (event) => {
      if (!dragging) return;
      updateRegionBox(startX, startY, event.clientX, event.clientY);
    };

    const onMouseUp = (event) => {
      if (!dragging) return cleanup();
      dragging = false;
      const left = Math.min(startX, event.clientX);
      const top = Math.min(startY, event.clientY);
      const width = Math.abs(event.clientX - startX);
      const height = Math.abs(event.clientY - startY);
      if (width < 4 || height < 4) {
        cleanup();
        return;
      }
      cleanup({ x: left, y: top, width, height });
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup();
      }
    };

    regionOverlay.addEventListener('mousedown', onMouseDown);
    regionOverlay.addEventListener('mousemove', onMouseMove);
    regionOverlay.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown, true);
  });
}

export async function captureScreenshotMode(mode) {
  if (!window.tandem) return;

  if (mode === 'region') {
    const region = await selectRegion();
    if (!region) return;
    // Wait two frames so the overlay is fully painted away before capture
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await window.tandem.captureScreenshot('region', region);
    return;
  }

  await window.tandem.captureScreenshot(mode);
}

/**
 * Wire the screenshot button to the renderer bridge.
 * renderer is window.__tandemRenderer, passed explicitly to avoid
 * implicit global coupling.
 */
export function initScreenshot(renderer) {
  screenshotButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const rect = screenshotButton.getBoundingClientRect();
    void window.tandem?.showScreenshotMenu({
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 6),
    });
  });
}
