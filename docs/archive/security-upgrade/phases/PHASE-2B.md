# Phase 2-B: Rule Engine + CDP Integration + Event Logging

> **Priority:** HIGH | **Effort:** ~2 hours | **Dependencies:** Phase 2-A (ThreatRule interface + rule set)

## Goal
Implement the `analyzeScriptContent()` engine that runs ThreatRules against script source, wire it into ScriptGuard's CDP `Debugger.scriptParsed` flow, and log matches as security events.

## Files to Read
- `src/security/script-guard.ts` — where engine + CDP integration goes
- `src/security/types.ts` — ThreatRule, ThreatRuleMatch, ScriptAnalysisResult, JS_THREAT_RULES (from Phase 2-A)
- `src/security/security-db.ts` — `logEvent()` method signature
- `src/security/security-manager.ts` — event flow, Gatekeeper notification pattern
- `src/devtools/manager.ts` — CDP command interface (`sendCommand()`)

## Files to Modify
- `src/security/script-guard.ts` — add engine function + CDP integration

## Tasks

### 2B.1 Implement `analyzeScriptContent()` in ScriptGuard

```typescript
function analyzeScriptContent(source: string, url: string): ScriptAnalysisResult {
  const matches: ThreatRuleMatch[] = []
  let totalScore = 0

  for (const rule or JS_THREAT_RULES) {
    const match = rule.pattern.exec(source)
    if (match) {
      totalScore += rule.score
      matches.push({
        rule,
        offset: match.index,
        matchedText: match[0].substring(0, 100)
      })
    }
  }

  // Determine overall severity from total score
  let severity: ScriptAnalysisResult['severity'] = 'none'
  if (totalScore >= 50) severity = 'critical'
  else if (totalScore >= 30) severity = 'high'
  else if (totalScore >= 15) severity = 'medium'
  else if (totalScore > 0) severity = 'low'

  return {
    totalScore,
    matches,
    severity,
    scriptUrl: url,
    scriptLength: source.length
  }
}
```

### 2B.2 Wire into `Debugger.scriptParsed` handler

In the existing `scriptParsed` event handler:
1. Skip inline scripts (no `url` property or `url` starts with `debugger://`)
2. Skip first-party scripts (same origin as the page)
3. Skip scripts > 500KB (`MAX_SCRIPT_SIZE = 500 * 1024`)
4. Call `Debugger.getScriptSource({ scriptId })` via DevToolsManager to get source
5. Run `analyzeScriptContent(source, url)`
6. If severity !== 'none': log event + take action

**Important:** The `getScriptSource` call is async. Wrap in try/catch — CDP failures must not crash the handler. Use the existing DevToolsManager `sendCommand()` pattern.

### 2B.3 Event logging for rule matches

When `analyzeScriptContent` returns matches:
1. Log a security event via `db.logEvent()` with:
   - `type`: `'script-analysis'`
   - `severity`: from the analysis result
   - `details`: JSON with `{ totalScore, matchCount, topMatches: matches.slice(0, 5), scriptUrl, scriptLength }`
2. For `critical` severity: also notify Gatekeeper (follow existing pattern in ScriptGuard for `new-script-detected` events)
3. For `high` or `critical`: include in evolution tracking

### 2B.4 Integration with entropy check (Phase 1)

If Phase 1's entropy check is already implemented:
- Run entropy check AND rule engine on the same script source (avoid fetching source twice)
- Add the `entropy` field to the `ScriptAnalysisResult`
- If both entropy is high AND rules match: boost the total score by 25%

If Phase 1 is not yet completed: skip this integration, just run rule engine alone.

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `analyzeScriptContent()` function exists and returns correct results
- [ ] Script source retrieved via `Debugger.getScriptSource()` for external scripts
- [ ] Rule matches logged as security events with type `script-analysis`
- [ ] Critical severity events notify Gatekeeper
- [ ] Scripts > 500KB are skipped (performance protection)
- [ ] CDP errors in `getScriptSource` are caught and don't crash the handler
- [ ] App still starts, browsing works
- [ ] Phase 0-A, 0-B, 1, 2-A changes still work (regression)

## Scope
- ONLY modify `script-guard.ts`
- Do NOT modify the rule definitions (that's Phase 2-A)
- Do NOT add new API endpoints (correlations are Phase 3)
- Do NOT modify CDP subscriptions — use the existing `Debugger.scriptParsed` handler

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
