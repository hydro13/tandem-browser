# Phase 3 — Telegram, Instagram and X/Twitter Panels

> **Feature:** Sidebar Chat Clients
> **Sessions:** 1 session
> **Priority:** MIDDEL
> **Depends on:** Phase 2 complete (Discord + Slack werken)

---

## Goal or this fase

Voeg the last drie messenger panels toe: Telegram, Instagram and X/Twitter. The sidebar framework and the panel-pattern stand already — this phase voegt only the service-specific configuration and eventuele edge cases toe. After this phase are alle 6 sidebar chat clients operationeel.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `LEES-MIJ-EERST.md` (this folder) | — (read fully) | Context and rules |
| `src/sidebar/manager.ts` | `class SidebarManager`, `DEFAULT_SERVICES` | Service definities verifiëren |
| `shell/index.html` | `// === SIDEBAR CHAT ===` | Icon strip verifiëren — Telegram, Instagram, X must er already stand |
| `shell/js/sidebar.js` (or waar sidebar JS staat) | `parseBadgeCount()`, `toggleSidebarPanel()` | Badge parsing + panel logic |
| `shell/css/sidebar.css` | `.sidebar-icon` | Eventuele styling tweaks |

---

## To Build in this fase

### Step 1: Verifieer that Telegram, Instagram and X already in the framework stand

**Wat:** Alle 6 services are already gedefinieerd in phase 1. Verifieer that Telegram, Instagram and X correct werken door ze te openen.

**File:** `src/sidebar/manager.ts`

**Zoek to:** `DEFAULT_SERVICES` — this drie must er stand:

```typescript
{ id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/a/', partition: 'persist:telegram', icon: '✈️' },
{ id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com', partition: 'persist:instagram', icon: '📷' },
{ id: 'x', name: 'X', url: 'https://x.com', partition: 'persist:x', icon: '𝕏' },
```

Normaal gesproken zou the clicking op this icons already a panel must openen with the juiste webview. Test this eerst voordat you verder bouwt.

### Step 2: Telegram-specific aanpassingen

**Wat:** Telegram Web has twee versies. We use Telegram Web A (`https://web.telegram.org/a/`) — this is the modernste versie with the beste responsieve layout.

**Aandachtspunten:**
- Telegram Web A works goed in smalle panels (responsive design)
- Login gaat via QR-code OF telefoonnummer — beide werken in a webview
- Telegram badge pattern: `Telegram (N)` — the getal staat ACHTER the name (anders then the meeste services that `(N) Service` use)

**File:** `shell/js/sidebar.js`

**Add about:** `parseBadgeCount()` function

```javascript
function parseBadgeCount(serviceId, title) {
  // Default: zoek (N) pattern — works for WhatsApp, Discord, Instagram, X
  const numMatch = title.match(/\((\d+)\)/);
  if (numMatch) return parseInt(numMatch[1], 10);

  // Slack-specifiek: * prefix
  if (serviceId === 'slack' && title.startsWith('*')) {
    return -1;
  }

  // Telegram: title pattern is "Telegram (N)" — default regex vangt this already
  // No extra logica nodig

  return 0;
}
```

**Opmerking:** The default `\((\d+)\)` regex vangt Telegram's pattern `Telegram (2)` already correct op — no extra logica nodig.

### Step 3: Instagram-specific aanpassingen

**Wat:** Instagram's web app is fully responsief and works goed in smalle panels. No speciale aanpassingen nodig.

**Aandachtspunten:**
- Instagram badge pattern: `(N) Instagram` — default pattern, is already gevangen door the regex
- Instagram can a "open in app" banner tonen at the top the page — this is vervelend but unavoidable in a desktop webview. Robin can this banner wegklikken.
- Instagram DMs werken via `https://www.instagram.com/direct/inbox/` — this URL loads automatisch via the navigatie in the web app

**Minimum width:** 360px (Instagram's responsive layout schaalt goed to beneden)

### Step 4: X/Twitter-specific aanpassingen

**Wat:** X/Twitter's web app is fully responsief. The sidebar levert the same ervaring if a narrow browser window.

**Aandachtspunten:**
- X badge pattern: `(N) X` — default pattern
- X can a "Cookies accepteren" dialoog tonen bij first bezoek — Robin must this eenmalig accepteren. The is opgeslagen in `persist:x`.
- X/Twitter has goed responsief design with a "slim" layout for smalle schermen

**Relatie with X-Scout:** Tandem has a interne X-Scout agent for X/Twitter intelligence. The sidebar X panel is NIET the same if X-Scout — the sidebar is for Robin's handmatige X/Twitter usage. X-Scout opereert via the main webview with stealth. Ze use verschillende partitions and mogen not with elkaar interfere.

### Stap 5: Optioneel — Panel reordering

**Wat:** Robin wil misschien the order or the sidebar icons aanpassen. Dit is a nice-to-have for phase 3.

**Implementatie:** Voeg a `order` field toe about `SidebarConfig.panels`:

```typescript
panels: Record<string, {
  enabled: boolean;
  muted: boolean;
  width: number;
  customUrl?: string;
  order?: number;  // ← order in the icon strip
}>
```

**API endpoint:**

```typescript
// POST /sidebar/reorder — pas icon order about
router.post('/sidebar/reorder', async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // ["whatsapp", "slack", "discord", "telegram", "x", "instagram"]
    if (!order || !Array.isArray(order)) {
      return res.status(400).json({ error: 'Missing required field: order (array or service IDs)' });
    }
    ctx.sidebarManager.reorderPanels(order);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

Dit is **optional** — if er no tijd for is, can the in a latere sprint.

### Stap 6: Optioneel — Panel enable/disable

**Wat:** Robin wil misschien not alle 6 icons zien. Voeg a enable/disable per service toe.

**API endpoint:**

```typescript
// POST /sidebar/enable — enable/disable a service
router.post('/sidebar/enable', async (req: Request, res: Response) => {
  try {
    const { service, enabled } = req.body;
    if (!service) return res.status(400).json({ error: 'Missing required field: service' });
    ctx.sidebarManager.enablePanel(service, enabled !== false);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

**Shell-side:** Verberg icons with `enabled: false` in the icon strip.

Dit is also **optional** for phase 3.

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: Open Telegram panel
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/open \
  -H "Content-Type: application/json" \
  -d '{"service": "telegram"}'
# Verwacht: {"ok":true,"panel":{"id":"telegram","name":"Telegram",...}}

# Test 2: Open Instagram panel
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/open \
  -H "Content-Type: application/json" \
  -d '{"service": "instagram"}'
# Verwacht: {"ok":true,"panel":{"id":"instagram","name":"Instagram",...}}

# Test 3: Open X panel
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/open \
  -H "Content-Type: application/json" \
  -d '{"service": "x"}'
# Verwacht: {"ok":true,"panel":{"id":"x","name":"X",...}}

# Test 4: Status — alle 6 services visible
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/sidebar/status
# Verwacht: {"ok":true,"services":[...6 services...]}

# Test 5: Alle services togglebaar
for svc in whatsapp discord slack telegram instagram x; do
  echo "=== $svc ==="
  curl -s -H "Authorization: Bearer $TOKEN" \
    -X POST http://localhost:8765/sidebar/toggle \
    -H "Content-Type: application/json" \
    -d "{\"service\": \"$svc\"}"
  echo ""
done
# Verwacht: 6x {"ok":true,"visible":true,...}

# Test 6 (optional): Panel reorder
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/reorder \
  -H "Content-Type: application/json" \
  -d '{"order": ["whatsapp", "slack", "discord", "telegram", "x", "instagram"]}'
# Verwacht: {"ok":true}
```

**UI verificatie:**
- [ ] Telegram icon (✈️) opens Telegram Web A in sidebar panel
- [ ] Telegram login (QR-code or telefoon) works in the panel
- [ ] Telegram session blijft bewaard na herstart (persist:telegram)
- [ ] Instagram icon (📷) opens Instagram in sidebar panel
- [ ] Instagram login works, feed and DMs are toegankelijk
- [ ] Instagram session bewaard na herstart (persist:instagram)
- [ ] X icon (𝕏) opens X/Twitter in sidebar panel
- [ ] X login works, timeline and DMs are toegankelijk
- [ ] X session bewaard na herstart (persist:x)
- [ ] Schakelen between alle 6 panels works soepel
- [ ] Notification badges werken for alle 6 services
- [ ] Elke service onthoudt are own login, chat-positie, and scroll-state

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-3-telegram-instagram-x.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Read the files in the "Files to read" table above
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. Alle curl tests out "Acceptatiecriteria" uitvoeren
4. npx vitest run — alle existing tests blijven slagen
5. Update CHANGELOG.md with korte entry
6. git commit -m "🗨️ feat: sidebar Telegram + Instagram + X panels"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Feature compleet! Alle 6 sidebar chat clients operationeel.
```

---

## Bekende valkuilen

- [ ] Telegram Web versie — usage `https://web.telegram.org/a/` (Web A), not the oude `https://web.telegram.org/z/` or `https://web.telegram.org/k/`
- [ ] Instagram "open in app" banner — can not voorkomen be, Robin must hem wegklikken. Is per-session onthouden.
- [ ] X/Twitter cookie-dialoog — eenmalig accepteren, opgeslagen in persist:x
- [ ] X sidebar is NIET X-Scout — verschillende partitions, verschillende doelen. No interferentie.
- [ ] TypeScript strict mode — no `any` buiten catch
- [ ] Test ALLE 6 services na voltooiing, not only the 3 new — regressie voorkomen
