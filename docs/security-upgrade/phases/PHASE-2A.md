# Phase 2-A: ThreatRule Interface + Rule Set Definition

> **Priority:** HIGH | **Effort:** ~1 hour | **Dependencies:** Phase 0-A (types.ts cleanup)

## Goal
Define the `ThreatRule` interface and the full rule set as typed constants in `types.ts`. This is pure type/data work — no engine logic, no CDP integration.

## Files to Read
- `src/security/types.ts` — where new interfaces and rules will live

## Files to Modify
- `src/security/types.ts` — add interfaces + rule array

## Tasks

### 2A.1 Define interfaces in types.ts

```typescript
export interface ThreatRule {
  id: string
  pattern: RegExp
  score: number
  category: 'obfuscation' | 'exfiltration' | 'injection' | 'evasion' | 'redirect'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
}

export interface ThreatRuleMatch {
  rule: ThreatRule
  offset: number
  matchedText: string  // first 100 chars
}

export interface ScriptAnalysisResult {
  totalScore: number
  matches: ThreatRuleMatch[]
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical'
  scriptUrl: string
  scriptLength: number
  entropy?: number
}
```

### 2A.2 Define the full rule set

Export `JS_THREAT_RULES: ThreatRule[]` with these rules (include ALL or them):

**Obfuscation:**
- `eval_string`: `/\beval\s*\(\s*['"]/` — score 25, high
- `eval_fromcharcode`: `/eval\s*\(\s*String\.fromCharCode/` — score 35, critical
- `eval_atob`: `/eval\s*\(\s*atob\s*\(/` — score 30, high
- `eval_function`: `/eval\s*\(\s*function/` — score 20, medium
- `function_constructor`: `/new\s+Function\s*\(\s*['"]/` — score 25, high
- `fromcharcode_chain`: `/String\.fromCharCode\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+/` — score 15, medium
- `charcode_loop`: `/for\s*\([^)]*\)\s*\{[^}]*String\.fromCharCode/` — score 20, medium
- `hex_escape_heavy`: `/(?:\\x[0-9a-fA-F]{2}){10,}/` — score 20, medium
- `unicode_escape_heavy`: `/(?:\\u[0-9a-fA-F]{4}){8,}/` — score 20, medium
- `silent_catch`: `/catch\s*\(\w*\)\s*\{\s*\}/` — score 8, low (evasion category)

**Exfiltration:**
- `cookie_access`: `/document\.cookie/` — score 10, low
- `cookie_to_fetch`: `/document\.cookie[\s\S]{0,100}fetch\s*\(/` — score 40, critical
- `cookie_to_xhr`: `/document\.cookie[\s\S]{0,100}XMLHttpRequest/` — score 40, critical
- `cookie_to_img`: `/document\.cookie[\s\S]{0,100}\.src\s*=/` — score 35, critical
- `localstorage_exfil`: `/localStorage[\s\S]{0,100}(?:fetch|XMLHttpRequest|\.src\s*=)/` — score 30, high
- `credential_harvest`: `/querySelector\s*\([^)]*(?:password|passwd|credit|ssn)[^)]*\)[\s\S]{0,100}(?:fetch|XMLHttpRequest)/i` — score 45, critical

**Injection:**
- `innerhtml_dynamic`: `/\.innerHTML\s*=\s*(?!\s*['"]<)/` — score 10, low
- `document_write`: `/document\.write\s*\(/` — score 12, medium
- `dynamic_script_create`: `/createElement\s*\(\s*['"]script['"]\)/` — score 15, medium
- `dynamic_iframe_create`: `/createElement\s*\(\s*['"]iframe['"]\)/` — score 15, medium
- `activex_object`: `/new\s+ActiveXObject\s*\(/` — score 40, critical
- `wscript_shell`: `/WScript\.(?:CreateObject|Shell)/` — score 40, critical

**Redirect:**
- `location_redirect`: `/(?:window\.)?location\s*(?:\.href\s*)?=\s*[^=!]/` — score 12, medium
- `meta_refresh_inject`: `/\.innerHTML[\s\S]{0,50}meta[\s\S]{0,50}refresh/i` — score 30, high
- `window_open_data`: `/window\.open\s*\(\s*['"]data:/` — score 25, high

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `ThreatRule`, `ThreatRuleMatch`, `ScriptAnalysisResult` interfaces exported
- [ ] `JS_THREAT_RULES` array exported with 25 rules
- [ ] All regex patterns compile without errors
- [ ] App still starts (no runtime errors from the new constants)

## Scope
- ONLY modify `types.ts`
- This is pure data/types — NO logic, NO engine, NO CDP calls
- Do NOT create the analysis engine (that's Phase 2-B)

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
