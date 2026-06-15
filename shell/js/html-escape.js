/**
 * Shared HTML escaping for every shell surface — the single source of truth.
 *
 * Escapes &, <, >, " and ' so the result is safe in BOTH text-node and
 * (double- or single-quoted) attribute positions. Titles, URLs, and names
 * that reach the shell come from websites or from the agent API, so they are
 * attacker-controlled; every interpolation into innerHTML must go through
 * this helper (or use textContent/createElement instead).
 *
 * Loaded two ways, on purpose:
 *  - classic script tag (window.tandemEscape) for non-module shell scripts
 *  - side-effect ES module import (import '../html-escape.js') for modules,
 *    which then read window.tandemEscape
 * Both executions are idempotent.
 */
(function (global) {
  'use strict';

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Escape first, then turn newlines into <br> — for multi-line text (chat
  // messages, handoff bodies) rendered via innerHTML.
  function escapeHtmlMultiline(value) {
    return escapeHtml(value).replace(/\n/g, '<br>');
  }

  global.tandemEscape = { escapeHtml, escapeHtmlMultiline };
})(typeof window !== 'undefined' ? window : globalThis);
