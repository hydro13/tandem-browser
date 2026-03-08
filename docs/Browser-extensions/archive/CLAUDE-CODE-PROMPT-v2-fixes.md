# Claude Code Prompt — Plan v2 Fixes

> Kopieer alles hieronder and plak the direct in Claude Code.

---

Tandem Browser — Extension Plan Aanpassingen

Read eerst:
- docs/Browser-extensions/CLAUDE.md
- docs/Browser-extensions/STATUS.md
- docs/Browser-extensions/phases/PHASE-1.md
- docs/Browser-extensions/phases/PHASE-7.md
- docs/Browser-extensions/phases/PHASE-10a.md
- docs/Browser-extensions/phases/PHASE-10b.md

Then make exactly the following 5 changes to the plan. Write NO code, only document changes.

---

## AANPASSING 1 — PHASE-1.md: CRX3 Signature Verificatie scope verkleinen

Vervang section 1.2 "CRX3 Signature Verification" fully door:

### 1.2 CRX3 Format Validation (NOT full signature verification)

**Scope decision:** Full CRX3 RSA/ECDSA signature verification requires parsing protobuf
binary format (CrxFileHeader) without a library — this is error-prone and a source or
subtle bugs (off-by-one in varint decoding reads wrong bytes as public key). Full
cryptographic verification is deferred to a future phase.

**What this phase DOES verify:**
1. Magic bytes: first 4 bytes must be `Cr24` (0x43723234) — reject anything else
2. Version: bytes 5-8 must be 2 or 3 — reject unknown CRX versions
3. Download source: the HTTP request must have stayed on *.google.com or
   *.googleapis.com throughout all redirects — reject if any redirect left Google's
   domains (MITM indicator)
4. ZIP validity: AdmZip must be able to open the extracted payload without errors
5. manifest.json: must be valid JSON with `name`, `version`, and `key` fields

**`CrxVerificationResult` interface:**
```typescript
interface CrxVerificationResult {
  valid: boolean;
  format: 'crx2' | 'crx3';
  downloadedFromGoogle: boolean;  // all redirects stayed on *.google.com / *.googleapis.com
  manifestValid: boolean;
  hasKeyField: boolean;
  error?: string;
}
```

Set `signatureVerified: false` on all InstallResults for now. Add a comment in code:
`// TODO: Full CRX3 RSA signature verification via protobuf — future phase`

**Failure behavior:** If any or the 5 checks fail → hard fail, do NOT install.
If `hasKeyField` is false → install but set `warning: "manifest.json missing key field
— extension ID may not match CWS ID, OAuth flows may break"`

Update the verification checklist in PHASE-1.md accordingly:
- Remove: "CRX3 signature verification passes" and "Tampered CRX is rejected"
- Add: "Download stayed on *.google.com / *.googleapis.com — verified in logs"
- Add: "Magic bytes Cr24 verified before extraction"
- Add: "ZIP validity verified by AdmZip (no extraction errors)"
- Keep: "manifest.json contains key field (log warning if missing)"
- Add: "InstallResult.signatureVerified is false (documented placeholder)"

Also update CLAUDE.md rule 7 from:
> "CRX3 signature verification is MANDATORY — never install an extension with an
> invalid or missing signature."

To:
> "CRX format validation is MANDATORY (magic bytes + version + Google-only redirects +
> valid ZIP + valid manifest.json). Full CRX3 RSA signature verification is deferred —
> signatureVerified will be false until implemented."

---

## AANPASSING 2 — PHASE-10b.md: Vervang runtime delta analyse door statische scan

Vervang section 10b.2 "Telemetry Gap Measurement" fully door:

### 10b.2 Static DNR Domain Analysis (replaces runtime delta approach)

**Why not runtime delta analysis:** The original approach ("domain not seen by Guardian
= blocked by DNR") has unacceptable false positive rates. A domain may not appear in
Guardian's traffic because: (1) it was served from browser cache, (2) the page didn't
request it this time due to A/B testing, (3) NetworkShield blocked it first. These are
indistinguishable from DNR blocks at runtime.

**This phase uses static analysis instead:**

When an extension with DNR rules is installed or updated:
1. Read all DNR rule files listed in `manifest.json` → `declarative_net_request.rule_resources`
2. Parse each rule file — rules with `action.type: "block"` extract target domains from
   `condition.urlFilter` using the pattern `||domain.com^` → `domain.com`
3. Store the complete blocked-domain set in SecurityDB as a new record type:
   ```typescript
   interface DnrExtensionBlocklist {
     extensionId: string;
     extensionName: string;
     domains: string[];          // domains with action.type: "block"
     ruleCount: number;
     analysedAt: number;         // timestamp
     manifestVersion: string;    // extension version this analysis is for
   }
   ```
4. Save to `~/.tandem/extensions/{id}/.dnr-analysis.json` for fast loading on restart
5. Re-run analysis on every extension update

**Runtime integration:**
In RequestDispatcher's `completedConsumer` (low priority), when a request completes:
- Check if the requesting domain is in any extension's DNR blocklist
- If yes, AND Guardian processed the request (it was NOT blocked): log this as
  `{ type: 'dnr-allowed-by-guardian', domain, reason: 'guardian-saw-it-first' }`
- This gives accurate data about when Guardian fires BEFORE DNR rules

**Drop the "inferred block" synthetic events entirely.** Static analysis gives accurate
data; inferred events add noise to SecurityDB. The overlap analysis (10b.4) now uses
the static blocklist directly — no runtime inference needed.

Also update the verification checklist in PHASE-10b.md:
- Remove all items about "inferred blocks" and "confidence: inferred"
- Add: "DNR rule files parsed for all installed DNR extensions on startup and install"
- Add: "Static blocklist stored in SecurityDB and {id}/.dnr-analysis.json"
- Add: "Analysis re-runs automatically on extension update"
- Add: "NetworkShield overlap correctly calculated from static blocklist"
- Keep: all 10b.4 overlap analysis verification items (they now use static data)

---

## AANPASSING 3 — PHASE-7.md: Maak Scenario B prescriptief

In section 7.1, vervang the Scenario B bullet:

**Huidig:**
```
- **Scenario B:** Extension shows an error about `chrome.identity` → login completely
  fails → proceed to Step 2
```

**Vervangen door:**
```
- **Scenario B:** Extension shows an error about `chrome.identity` → login completely
  fails → proceed to Step 2 (implement Option A — companion extension).
  If after 2 hours or work you cannot get `chrome.runtime.onMessageExternal`
  cross-extension messaging working between the companion and the target extension:
  STOP. Mark Phase 7 as BLOCKED in STATUS.md with exact error details.
  Report to Robin — do not proceed to Option B independently. Phase 7 is LOW priority
  and can be revisited later; the 22/30 extensions that don't use chrome.identity
  work fine without it.
```

In section 7.2, vervang:

**Huidig:**
```
**Choose based on testing.** Document which approach was chosen and why in STATUS.md.
```

**Vervangen door:**
```
**Default to Option A (companion extension).** Only consider Option B if Option A
fails and Robin explicitly approves the switch. Document which approach was chosen
and why in STATUS.md.
```

---

## AANPASSING 4 — PHASE-10a.md: Voeg empirische ScriptGuard test toe

Voeg about the BEGIN or section 10a.3 "Broad content script injection (warning)" in:

```
**First: empirical test (before implementing any whitelist):**

Install Dark Reader extension (content scripts only). Open Tandem's DevTools console
and enable CDP Debugger domain. Check whether ScriptGuard logs any scriptParsed events
for Dark Reader's content scripts:

- If ScriptGuard logs the content script injections → whitelist implementation IS needed,
  proceed with 10a.3 as written below.
- If ScriptGuard logs nothing for extension content scripts → extension scripts run
  outside CDP's scriptParsed event scope. In this case:
  - No whitelist implementation needed (nothing to whitelist)
  - Replace the whitelist task with: log content_scripts URL patterns to the security
    audit log only (human-readable record, not a code whitelist)
  - Update STATUS.md: "Extension content scripts are outside CDP scope — whitelist
    implementation not needed"

Document empirical result in STATUS.md before writing any whitelist code.
```

---

## AANPASSING 5 — CLAUDE.md: Documenteer state files

Voeg a new subsectie toe about the EINDE or "Key Architecture Facts (Already Built)":

```
## State Files in ~/.tandem/extensions/

| File | Purpose | Created in Phase |
|------|---------|------------------|
| `{id}/.tandem-meta.json` | Per-extension metadata (CWS source, import info, cwsId) | Phase 3 |
| `gallery.json` | User gallery overrides (optional, merged with defaults) | Phase 4 |
| `toolbar-state.json` | Extension toolbar pin order + visibility per extension | Phase 5b |
| `update-state.json` | Update check timestamps + version tracking per extension | Phase 9 |
| `{id}/.dnr-analysis.json` | Static DNR domain blocklist analysis per extension | Phase 10b |

**Rule: Do NOT create new state files without adding them to this table first.**
If you need to persist new state, either add a new key to an existing file or
document the new file in this table before creating it.
```

---

## Na alle 5 aanpassingen:

1. Read alle gewijzigde files terug and verifieer that alle 5 aanpassingen correct doorgevoerd are
2. Run `npx tsc --noEmit` — must 0 errors geven (this are only documentwijzigingen)
3. Commit with bericht: `docs(extensions): Apply plan v2 review corrections`
4. Push to main

Write NO implementation code. Only document changes in the listed `.md` files.
