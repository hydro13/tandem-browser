# Phase 5 — OG Metadata Fetch (auto-thumbnails)

> **Depends on:** Phase 4 ✅

## Goal

Wanneer a URL is gepind → backend fetcht automatisch:
- `og:title` or `<title>`
- `og:description`  
- `og:image` URL (for thumbnail)
- `og:site_name` or hostname

Resultaat: cards tonen echte thumbnails (YouTube video cover, site preview, etc.)

---

## Backend: new endpoint + auto-fetch bij addItem

### `GET /pinboards/fetch-meta?url=...`

Fetcht OG metadata or a URL. Uses `node-fetch` or native `fetch` (Node 18+).

```typescript
// No new npm packages! Usage native fetch (Node 18+)
async function fetchOGMeta(url: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Tandem/1.0)' },
    signal: AbortSignal.timeout(5000),
  });
  const html = await res.text();
  // Parse og: meta tags with regex (no extra library nodig)
  const og = (prop: string) => {
    const m = html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
              || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${prop}["']`, 'i'));
    return m?.[1];
  };
  const title = og('title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  return {
    title,
    description: og('description'),
    image: og('image'),
    siteName: og('site_name'),
  };
}
```

### Auto-fetch in `PinboardManager.addItem()`

If `type === 'link'` and `url` aanwezig but `title` or `thumbnail` ontbreekt → roep `fetchOGMeta()` about and vul about.

---

## Frontend: toon og:image if thumbnail

In `pbRenderItems()` in shell/index.html:
- `item.thumbnail` contains the og:image URL → tonen if `<img>` in the card preview
- Fallback: favicon via Google API if no og:image

---

## Acceptatiecriteria

```
1. Pin a YouTube URL → card shows the video thumbnail automatisch
2. Pin a LinkedIn post → card shows og:image
3. If fetch faalt (timeout/error) → pin is aangemaakt without thumbnail (no crash)
4. npx tsc — zero errors
```
