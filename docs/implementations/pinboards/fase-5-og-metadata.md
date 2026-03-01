# Fase 5 — OG Metadata Fetch (auto-thumbnails)

> **Afhankelijk van:** Fase 4 ✅

## Doel

Wanneer een URL wordt gepind → backend fetcht automatisch:
- `og:title` of `<title>`
- `og:description`  
- `og:image` URL (voor thumbnail)
- `og:site_name` of hostname

Resultaat: kaarten tonen echte thumbnails (YouTube video cover, site preview, etc.)

---

## Backend: nieuw endpoint + auto-fetch bij addItem

### `GET /pinboards/fetch-meta?url=...`

Fetcht OG metadata van een URL. Gebruikt `node-fetch` of native `fetch` (Node 18+).

```typescript
// Geen nieuwe npm packages! Gebruik native fetch (Node 18+)
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
  // Parse og: meta tags met regex (geen extra library nodig)
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

Als `type === 'link'` en `url` aanwezig maar `title` of `thumbnail` ontbreekt → roep `fetchOGMeta()` aan en vul aan.

---

## Frontend: toon og:image als thumbnail

In `pbRenderItems()` in shell/index.html:
- `item.thumbnail` bevat de og:image URL → tonen als `<img>` in de kaart preview
- Fallback: favicon via Google API als geen og:image

---

## Acceptatiecriteria

```
1. Pin een YouTube URL → kaart toont de video thumbnail automatisch
2. Pin een LinkedIn post → kaart toont og:image
3. Als fetch faalt (timeout/error) → pin wordt aangemaakt zonder thumbnail (geen crash)
4. npx tsc — zero errors
```
