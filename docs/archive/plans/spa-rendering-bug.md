# BUG: SPA content not rendering for /page-content endpoint

## Problem
The `/page-content` endpoint returns empty/minimal content on Single Page Application (SPA) websites that render content dynamically via JavaScript after initial page load.

## Reproduction
1. Navigate to `https://www.viture.com/developer/unity-sdk/requirements`
2. Call `GET /page-content`
3. **Expected:** Full documentation text (requirements, Unity versions, etc.)
4. **Actual:** Only returns the shell/nav elements ("Developer", "VITURE XR SDK for Unity", "CONTACT US", footer) — the main content area is empty

Same issue on `/developer/unity-sdk/quick-start` — 74KB or HTML but 0 headings rendered, content div is empty.

The overview page (`/developer/unity-sdk/unity#overview`) DOES work partially — it returns the introduction text. So the issue is specifically with subpages that lazy-load content.

## Root Cause (likely)
The `/page-content` endpoint probably reads the DOM too early, before the SPA framework (likely React/Next.js) has hydrated and rendered the route-specific content. The page shell loads immediately but the actual documentation content is fetched asynchronously.

## Fix Needed
The `/page-content` endpoint needs to **wait for SPA content to settle** before extracting text. Options:

1. **MutationObserver approach:** After navigation, watch for DOM mutations to stop (e.g., no new mutations for 500ms) before reading content
2. **Content length check:** After `document.body.innerText` stops growing, read it
3. **Configurable wait:** Add an optional `?waitMs=2000` parameter to `/page-content` that delays extraction
4. **Smart detection:** If the extracted text is suspiciously short relative to `document.body.innerHTML.length`, wait and retry

Option 1 (MutationObserver) is the most robust. The implementation should:
- Start observing DOM mutations after navigation/page load
- Wait until mutations settle (no new mutations for 500-1000ms)
- Then extract and return the text content
- Have a maximum timeout (e.g., 10s) to avoid hanging

## Files to Check
- Look at the Express route handler for `/page-content`
- Check how `document.body.innerText` or equivalent is being extracted
- The fix should also benefit `/execute-js` calls that depend on rendered content

## Test Cases
After fix, these should all return full content:
- `https://www.viture.com/developer/unity-sdk/requirements`
- `https://www.viture.com/developer/unity-sdk/quick-start`
- `https://www.viture.com/developer/unity-sdk/features`
- Any SPA docs site (React, Next.js, Vue, etc.)
