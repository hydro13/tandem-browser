# Phase 4: Curated Extension Gallery

> **Priority:** MEDIUM | **Effort:** ~half day | **Dependencies:** Phase 1

## Goal
Provide a curated gallery of verified-compatible popular extensions that users can browse and install with one click. The gallery uses a two-layer architecture: built-in defaults (shipped with the app) + an optional user-editable JSON file for overrides and additions.

## Files to Read
- `docs/Browser-extensions/TOP30-EXTENSIONS.md` — full compatibility assessment with IDs, categories, mechanisms
- `src/extensions/manager.ts` — ExtensionManager for install status check
- `src/api/server.ts` — existing route pattern

## Files to Create
- `src/extensions/gallery-defaults.ts` — built-in curated extension data (shipped with app)
- `src/extensions/gallery-loader.ts` — gallery loading + merge logic

## Files to Modify
- `src/api/server.ts` — add gallery API endpoint

## Tasks

### 4.1 Create Gallery Data (Two-Layer Architecture)

**Layer 1 — Built-in defaults:** Create `src/extensions/gallery-defaults.ts` with the complete curated extension list as a TypeScript constant. This ships with the app and is always available.

**Layer 2 — User overrides:** Create `src/extensions/gallery-loader.ts` that:

1. Loads the built-in defaults from `gallery-defaults.ts`
2. Checks for `~/.tandem/extensions/gallery.json` (optional user file)
3. Merges: user entries override defaults by `id`, user entries with new IDs are added
4. Returns the merged gallery list

**User gallery JSON format** (`~/.tandem/extensions/gallery.json`):

```json
{
  "version": 1,
  "extensions": [
    {
      "id": "cjpalhdlnbpafiamejdnhcphjbkeiagm",
      "name": "uBlock Origin",
      "description": "...",
      "category": "privacy",
      "compatibility": "works",
      "securityConflict": "dnr-overlap",
      "featured": true
    }
  ]
}
```

**Merge logic:**

```typescript
gallery = loadDefaults()            // Built-in 30 extensions
userGallery = loadUserGallery()     // ~/.tandem/extensions/gallery.json (if exists)
merged = merge(gallery, userGallery)  // User entries override defaults by ID
```

The architecture should allow a third source (remote gallery) in the future without code changes to the merge logic.

**`GalleryExtension` interface:**

```typescript
export interface GalleryExtension {
  id: string;
  name: string;
  description: string;
  category: ExtensionCategory;
  compatibility: 'works' | 'partial' | 'needs-work' | 'blocked';
  compatibilityNote?: string;  // e.g. "Needs chrome.identity polyfill for OAuth login"
  securityConflict: 'none' | 'dnr-overlap' | 'native-messaging';  // see Security Stack Rules in CLAUDE.md
  mechanism: string;  // e.g. "Content scripts + declarativeNetRequest"
  featured: boolean;  // true for the top 10 recommended extensions
}

export type ExtensionCategory =
  | 'privacy'
  | 'password'
  | 'productivity'
  | 'appearance'
  | 'developer'
  | 'media'
  | 'shopping'
  | 'language'
  | 'web3';
```

**Include all 30 extensions from TOP30-EXTENSIONS.md:**

| # | Extension | ID | Compat | Category | Featured |
|---|-----------|-----|--------|----------|----------|
| 1 | uBlock Origin | `cjpalhdlnbpafiamejdnhcphjbkeiagm` | works | privacy | Yes |
| 2 | AdBlock Plus | `cfhdojbkjhnklbpkdaibdccddilifddb` | works | privacy | No |
| 3 | AdBlock | `gighmmpiobklfepjocnamgkkbiglidom` | works | privacy | No |
| 4 | Privacy Badger | `pkehgijcmpdhfbdbbnkijodmdjhbjlgp` | works | privacy | No |
| 5 | Ghostery | `mlomiejdfkolichcflejclcbmpeaniij` | works | privacy | No |
| 6 | DuckDuckGo Privacy | `caoacbimdbbljakfhgikoodekdnkbicp` | works | privacy | No |
| 7 | Bitwarden | `nngceckbapebfimnlniiiahkandclblb` | works | password | Yes |
| 8 | LastPass | `hdokiejnpimakedhajhdlcegeplioahd` | partial | password | No |
| 9 | 1Password | `aeblfdkhhhdcdjpifhhbdiojplfjncoa` | needs-work | password | No |
| 10 | Grammarly | `kbfnbcaeplbcioakkpcpgfkobkghlhen` | partial | productivity | No |
| 11 | Notion Web Clipper | `knheggckgoiihginacbkhaalnibhilkk` | partial | productivity | No |
| 12 | Pocket | `niloccemoadcdkdjlinkgdfekeahmflj` | works | productivity | Yes |
| 13 | Loom | `liecbddmkiiihnedobmlmillhodjkdmb` | partial | productivity | No |
| 14 | Momentum | `laookkfknpbbblfpciffpaejjkokdgca` | works | productivity | Yes |
| 15 | StayFocusd | `laankejkbhbdhmipfmgcngdelahlfoji` | works | productivity | Yes |
| 16 | Dark Reader | `eimadpbcbfnmbkopoojfekhnkhdbieeh` | works | appearance | Yes |
| 17 | Stylus | `clngdbkpkpeebahjckkjfobafhncgmne` | works | appearance | No |
| 18 | React DevTools | `fmkadmapgofadopljbjfkapdkoienihi` | works | developer | Yes |
| 19 | Vue DevTools | `nhdogjmejiglipccpnnnanhbledajbpd` | works | developer | No |
| 20 | Wappalyzer | `gppongmhjkpfnbhagpmjfkannfbllamg` | works | developer | Yes |
| 21 | JSON Formatter | `bcjindcccaagfpapjibcdnjnljaoajfd` | works | developer | No |
| 22 | ColorZilla | `bhlhnicpbhignbdhedgjmaplebemodai` | works | developer | No |
| 23 | EditThisCookie | `fngmhnnpilhplaeedifhccceomclgfbg` | works | developer | No |
| 24 | Postman Interceptor | `aicmkgpgakddgnaphhhpliifpcfnhce` | needs-work | developer | No |
| 25 | Video Speed Controller | `nffaoalbilbmmfgbnbgppjihopabppdk` | works | media | Yes |
| 26 | Return YouTube Dislike | `gebbhagfogifgggkldgodflihielkjfl` | works | media | No |
| 27 | Enhancer for YouTube | `ponfpcnoihfmfllpaingbgckeeldkhle` | works | media | No |
| 28 | Honey | `bmnlcjabgnpnenekpadlanbbkooimhnj` | works | shopping | No |
| 29 | Google Translate | `aapbdbdomjkkjkaonfhkkikfgjllcleb` | partial | language | No |
| 30 | MetaMask | `nkbihfbeogaeaoehlefnkodbefgpgknn` | works | web3 | Yes |

Copy the `description`, `compatibilityNote`, and `mechanism` from TOP30-EXTENSIONS.md for each entry.

### 4.2 Implement `GET /extensions/gallery` endpoint

```typescript
// GET /extensions/gallery
// Query: ?category=privacy (optional filter)
//        ?featured=true (optional, only show featured)
// Returns: {
//   extensions: Array<GalleryExtension & { installed: boolean }>,
//   categories: string[],
//   counts: { total, works, partial, needsWork }
// }
```

- Import gallery via `GalleryLoader` (which merges defaults + user overrides)
- Merge with `extensionManager.list()` to determine `installed` status per entry
- Support optional `category` and `featured` query params for filtering

### 4.3 Add category filtering support

The endpoint should support filtering by category and featured status. Return the available categories list so the UI can build filter buttons.

## Verification

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `gallery-defaults.ts` exports built-in gallery with 30 entries
- [ ] All 10 featured extensions match the TOP30-EXTENSIONS.md recommendations
- [ ] Each entry has: id, name, description, category, compatibility, securityConflict, mechanism
- [ ] Extensions with `declarativeNetRequest` have `securityConflict: 'dnr-overlap'`
- [ ] `~/.tandem/extensions/gallery.json` is loaded if it exists
- [ ] User gallery entries override built-in entries by ID
- [ ] User gallery can add extra extensions not in defaults
- [ ] `GET /extensions/gallery` returns the merged list (all 30+ extensions)
- [ ] `GET /extensions/gallery?category=privacy` returns only privacy extensions
- [ ] `GET /extensions/gallery?featured=true` returns only the 10 featured
- [ ] `installed` field is `true` for extensions that exist in `~/.tandem/extensions/`
- [ ] `gallery.json` format is documented (so users can manually edit it)
- [ ] App launches, browsing works

## Scope
- ONLY create `gallery-defaults.ts`, `gallery-loader.ts`, and add the gallery route to `api/server.ts`
- Do NOT build any UI — that's Phase 5
- Do NOT verify extension IDs against Chrome Web Store — that's Phase 8
- The gallery is a static list — no dynamic fetching from CWS

## After Completion
1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
