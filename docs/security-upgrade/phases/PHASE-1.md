# Phase 1: Shannon Entropy Check + MIME Whitelist

> **Priority:** HIGH | **Effort:** ~2 hours | **Dependencies:** None (can run parallel with Phase 0)

## Goal
Two small but impactful additions: (1) Shannon entropy analysis on script content to detect obfuscation, (2) Content-Type whitelist in OutboundGuard to skip body scanning for media uploads.

## Files to Read
- `src/security/script-guard.ts` — entropy check goes here, understand `Debugger.scriptParsed` flow
- `src/security/outbound-guard.ts` — MIME whitelist goes here, understand `analyzeOutbound()` flow
- `src/security/types.ts` — SecurityEvent and other shared types

## Files to Modify
- `src/security/script-guard.ts` — add entropy function + integration
- `src/security/outbound-guard.ts` — add MIME whitelist

## Tasks

### 1.1 Shannon entropy function
Implement in `script-guard.ts` (or a shared `utils.ts` if preferred):

```typescript
function calculateEntropy(input: string): number {
  if (input.length === 0) return 0
  const freq = new Map<number, number>()
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    freq.set(code, (freq.get(code) || 0) + 1)
  }
  let entropy = 0
  for (const count of freq.values()) {
    const p = count / input.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}
```

Reference values: normal JS = 4.5-5.5, minified = 5.0-5.8, obfuscated = 5.8-6.5, encrypted = 7.5-8.0.

### 1.2 Integrate entropy check in ScriptGuard
- On `Debugger.scriptParsed` events for external scripts (not inline, not first-party)
- Retrieve source via `Debugger.getScriptSource({ scriptId })` (async CDP call — wrap in try/catch)
- Only check scripts > 1000 chars and < 500KB
- If entropy > 6.0: log security event with category `obfuscation`, severity based on entropy level

### 1.3 Trusted Content-Type whitelist in OutboundGuard
Add early return in `analyzeOutbound()` for known-safe content types:

```typescript
const TRUSTED_OUTBOUND_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/bmp', 'image/tiff', 'image/x-icon', 'image/avif',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'font/woff', 'font/woff2', 'font/ttf', 'font/otf',
  'application/octet-stream', 'application/zip', 'application/gzip',
])
```

Insert AFTER same-origin check but BEFORE body scan. Parse Content-Type header (split on `;`, trim, lowercase). Do NOT whitelist `application/json`, `application/x-www-form-urlencoded`, or `multipart/form-data`.

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Entropy function returns ~0 for "aaaa", ~4-5 for normal text, ~7+ for random data
- [ ] Browse to a news site — obfuscated tracker scripts generate entropy events
- [ ] Image uploads skip OutboundGuard body scan
- [ ] `application/json` POST bodies are still scanned
- [ ] Normal login forms still trigger credential scanning
- [ ] App launches with `npm start`, browsing works

## Scope
- ONLY modify `script-guard.ts` and `outbound-guard.ts` (+ optional `utils.ts`)
- These are ADDITIVE changes — do not replace existing checks
- Do NOT modify CDP subscriptions or binding mechanisms
- Do NOT modify credential patterns in OutboundGuard

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
