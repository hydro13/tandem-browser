// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

// Hostile values a website or API caller fully controls.
const SCRIPT_PAYLOAD = '<img src=x onerror=alert(1)>';
const ATTR_PAYLOAD = '" onmouseover="alert(1)" data-x="';

let renderHistoryItems;
let renderBmItems;

beforeAll(async () => {
  ({ renderHistoryItems } = await import('../js/sidebar/panels/history.js'));
  ({ renderBmItems } = await import('../js/sidebar/panels/bookmarks.js'));
});

function renderInto(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

function expectNoActiveContent(container) {
  // No injected elements capable of running script.
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img[src="x"]')).toBeNull();
  for (const el of container.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      expect(attr.name.startsWith('on'), `unexpected handler ${attr.name} on ${el.tagName}`).toBe(false);
    }
  }
}

describe('history panel rendering', () => {
  it('escapes hostile titles in text positions', () => {
    const container = renderInto(renderHistoryItems([
      { url: 'https://example.com/', title: SCRIPT_PAYLOAD },
    ]));

    expectNoActiveContent(container);
    expect(container.querySelector('.bm-name').textContent).toBe(SCRIPT_PAYLOAD);
  });

  it('escapes hostile URLs in attribute positions', () => {
    const hostileUrl = `https://example.com/${ATTR_PAYLOAD}`;
    const container = renderInto(renderHistoryItems([
      { url: hostileUrl, title: 'Title' },
    ]));

    expectNoActiveContent(container);
    expect(container.querySelector('.bm-item').dataset.url).toBe(hostileUrl);
  });

  it('uses data-favicon instead of inline onerror for favicon fallbacks', () => {
    const container = renderInto(renderHistoryItems([
      { url: 'https://example.com/', title: 'Title' },
    ]));

    const favicon = container.querySelector('img');
    expect(favicon.hasAttribute('data-favicon')).toBe(true);
    expect(favicon.getAttribute('onerror')).toBeNull();
  });
});

describe('bookmarks panel rendering', () => {
  it('escapes hostile bookmark names in text and data attributes', () => {
    const container = renderInto(renderBmItems([
      { id: 'b1', type: 'url', url: 'https://example.com/', name: SCRIPT_PAYLOAD },
    ]));

    expectNoActiveContent(container);
    expect(container.querySelector('.bm-name').textContent).toBe(SCRIPT_PAYLOAD);
    expect(container.querySelector('.bm-item').dataset.name).toBe(SCRIPT_PAYLOAD);
  });

  it('escapes quote breakouts in folder names', () => {
    const container = renderInto(renderBmItems([
      { id: 'f1', type: 'folder', name: ATTR_PAYLOAD },
    ]));

    expectNoActiveContent(container);
    expect(container.querySelector('.bm-item').dataset.name).toBe(ATTR_PAYLOAD);
  });

  it('escapes hostile URLs in attribute positions', () => {
    const hostileUrl = `https://example.com/${ATTR_PAYLOAD}`;
    const container = renderInto(renderBmItems([
      { id: 'b2', type: 'url', url: hostileUrl, name: 'Name' },
    ]));

    expectNoActiveContent(container);
    expect(container.querySelector('.bm-item').dataset.url).toBe(hostileUrl);
  });
});
