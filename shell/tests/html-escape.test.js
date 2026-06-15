// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  await import('../js/html-escape.js');
});

describe('shared html-escape module', () => {
  it('exposes window.tandemEscape for classic scripts and module consumers', () => {
    expect(window.tandemEscape).toBeDefined();
    expect(typeof window.tandemEscape.escapeHtml).toBe('function');
    expect(typeof window.tandemEscape.escapeHtmlMultiline).toBe('function');
  });

  it('neutralizes element injection payloads in text positions', () => {
    const { escapeHtml } = window.tandemEscape;
    const payload = '<img src=x onerror=alert(1)>';

    const container = document.createElement('div');
    container.innerHTML = `<span>${escapeHtml(payload)}</span>`;

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('span').textContent).toBe(payload);
  });

  it('neutralizes double-quote breakout in attribute positions', () => {
    const { escapeHtml } = window.tandemEscape;
    const payload = '" onmouseover="alert(1)" data-x="';

    const container = document.createElement('div');
    container.innerHTML = `<div title="${escapeHtml(payload)}"></div>`;

    const el = container.firstElementChild;
    expect(el.getAttribute('onmouseover')).toBeNull();
    expect(el.getAttribute('title')).toBe(payload);
  });

  it('neutralizes single-quote breakout in attribute positions', () => {
    const { escapeHtml } = window.tandemEscape;
    const payload = "' onmouseover='alert(1)";

    const container = document.createElement('div');
    container.innerHTML = `<div title='${escapeHtml(payload)}'></div>`;

    const el = container.firstElementChild;
    expect(el.getAttribute('onmouseover')).toBeNull();
    expect(el.getAttribute('title')).toBe(payload);
  });

  it('escapes all five significant characters', () => {
    const { escapeHtml } = window.tandemEscape;
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('handles null, undefined, and non-string input', () => {
    const { escapeHtml } = window.tandemEscape;
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });

  it('escapeHtmlMultiline escapes first, then converts newlines to <br>', () => {
    const { escapeHtmlMultiline } = window.tandemEscape;
    expect(escapeHtmlMultiline('a\n<b>')).toBe('a<br>&lt;b&gt;');
  });
});
