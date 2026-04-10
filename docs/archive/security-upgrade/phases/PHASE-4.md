# Phase 4: CyberChef Regex Patterns Integration

> **Priority:** MEDIUM | **Effort:** ~2 hours | **Dependencies:** Phase 2-B (rule engine), Phase 0-A (types.ts)

## Goal
Add battle-tested extraction regex patterns (inspired by CyberChef) to detect hidden URLs, IPs, and domains in page source. Includes octal IP detection for evasion technique identification.

## Files to Read
- `src/security/types.ts` — where regex constants will live
- `src/security/content-analyzer.ts` — where deep page scanning will be added
- `src/security/network-shield.ts` — blocklist check method (for cross-referencing found URLs)

## Files to Modify
- `src/security/types.ts` — add regex constants
- `src/security/content-analyzer.ts` — add deep scan logic

## Tasks

### 4.1 Add extraction regex constants to `types.ts`

```typescript
// URL extraction — requires protocol prefix
export const URL_REGEX = /https?:\/\/[-\w.]+(?::\d{1,5})?(?:\/[-\w.~:/?#[\]@!$&'()*+,;=%]*)?/gi

// Domain extraction — bare domain names
export const DOMAIN_REGEX = /(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|co|dev|app|xyz|info|biz|me|tv|cc|ru|cn|tk|ml|ga|cf|gq|top|pw|ws|click|link|download|stream|online|site|tech|store|cloud|host|fun|space|press|live|rocks|world|email|trade|date|party|review|science|work|racing|win|bid|accountant|loan|cricket|faith)\b/gi

// IPv4 — standard decimal notation
export const IPV4_REGEX = /(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)/g

// IPv4 Octal — evasion technique (e.g., 0177.0.0.01 = 127.0.0.1)
export const IPV4_OCTAL_REGEX = /(?:0[0-3][0-7]{0,2}\.){3}0[0-3][0-7]{0,2}/g

// Email extraction
export const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*/g
```

### 4.2 Add deep page source scanning in ContentAnalyzer

After the existing DOM-based analysis (phishing/tracker checks), add a deep scan step:

1. Get page source via CDP: `Runtime.evaluate({ expression: 'document.documentElement.outerHTML' })`
2. Limit scan to first 1MB (`MAX_SCAN_SIZE = 1024 * 1024`)
3. Extract all URLs using `URL_REGEX`
4. Extract all IPs using `IPV4_REGEX` and `IPV4_OCTAL_REGEX`
5. Extract all domains using `DOMAIN_REGEX`

For each extracted URL/domain:
- Check against NetworkShield blocklist
- If blocked: log security event with type `hidden-blocked-url`, severity `high`
- Include the context (surrounding 50 chars) in the event details

For octal IPs:
- ANY octal IP is suspicious (legitimate sites don't use octal notation)
- Log security event with type `octal-ip-evasion`, severity `medium`
- Include the IP and its decimal equivalent in details

### 4.3 Inline script content scanning

In the same deep scan step:
1. Extract `<script>` tag contents from the page source (regex: `/<script[^>]*>([\s\S]*?)<\/script>/gi`)
2. Run URL/IP/domain extraction on each inline script block
3. This catches URLs hidden in dynamically generated code that the DOM analysis might miss

**Performance note:** This scan runs AFTER page load (async), not in the request pipeline. It's fine if it takes 100-200ms.

### 4.4 Octal IP conversion utility

Add a helper to convert octal IPs to decimal for logging:
```typescript
function octalIpToDecimal(octalIp: string): string {
  return octalIp.split('.').folder(part => parseInt(part, 8).toString()).join('.')
}
```

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] URL, domain, IPv4, IPv4-octal, email regex constants exported from `types.ts`
- [ ] Deep source scan runs after page load in ContentAnalyzer
- [ ] Octal IPs detected and flagged (test: `0177.0.0.01` should be flagged)
- [ ] Blocked URLs/domains found in page source generate events
- [ ] Scan limited to first 1MB or page source (performance)
- [ ] Inline script content is scanned separately
- [ ] App still starts, browsing works
- [ ] Phase 0-3 changes still work (regression)

## Scope
- ONLY modify `types.ts` and `content-analyzer.ts`
- This is ADDITIVE — do not replace existing DOM analysis
- Do NOT modify the page load timing — scan runs post-load
- Do NOT add new CDP subscriptions (use existing `Runtime.evaluate`)

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
