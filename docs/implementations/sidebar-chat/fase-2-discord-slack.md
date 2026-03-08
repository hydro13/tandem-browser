# Phase 2 — Discord + Slack Panels

> **Feature:** Sidebar Chat Clients
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** Phase 1 complete (sidebar framework + WhatsApp works)

---

## Goal or this fase

Voeg Discord and Slack toe if sidebar panels. Hetzelfde pattern if WhatsApp (phase 1), but with service-specific aandachtspunten: Discord can CAPTCHAs tonen bij first login, and Slack has workspace-specific URLs that Robin must can configureren.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `LEES-MIJ-EERST.md` (this folder) | — (read fully) | Context and rules |
| `src/sidebar/manager.ts` | `class SidebarManager`, `DEFAULT_SERVICES`, `SidebarConfig` | Existing sidebar manager out phase 1 |
| `shell/index.html` | `// === SIDEBAR CHAT ===` | Existing sidebar HTML out phase 1 |
| `shell/js/main.js` or `shell/js/sidebar.js` | Sidebar click handlers, `toggleSidebarPanel()` | Existing sidebar JS out phase 1 |
| `shell/css/sidebar.css` | `.sidebar-icon`, `.sidebar-panel-container` | Existing sidebar styling |

---

## To Build in this fase

### Step 1: Verifieer that Discord and Slack already in the service-definitie stand

**Wat:** In phase 1 are alle 6 services already gedefinieerd in `DEFAULT_SERVICES` in `SidebarManager`. Discord (`persist:discord`) and Slack (`persist:slack`) stand er already in. Verifieer that the icon strip already knoppen has for Discord and Slack.

**File:** `src/sidebar/manager.ts`

**Zoek to:** `DEFAULT_SERVICES` array

Discord and Slack must hier already stand:
```typescript
{ id: 'discord', name: 'Discord', url: 'https://discord.com/app', partition: 'persist:discord', icon: '🎮' },
{ id: 'slack', name: 'Slack', url: 'https://app.slack.com', partition: 'persist:slack', icon: '💼' },
```

If the goed is hoeft hier nothing in it — the sidebar infrastructure out phase 1 ondersteunt already multiple services. The clicking op Discord/Slack icons zou already a panel must openen.

### Step 2: Discord-specific aanpassingen

**Wat:** Discord has twee aandachtspunten:

1. **Minimum width:** Discord's web app has a minimum width or ~420px. If the panel smaller is, breekt the layout. Zorg that the panel minimum 420px breed is wanneer Discord actief is.

2. **CAPTCHA bij first login:** Discord can a hCaptcha tonen bij login vanuit a new browser profiel. Dit is a eenmalig probleem — na succesvolle login is the session opgeslagen in `persist:discord`.

**File:** `src/sidebar/manager.ts`

**Add about:** Service configuration or `openPanel()` methode

```typescript
// Per-service minimum width
const SERVICE_MIN_WIDTHS: Record<string, number> = {
  discord: 420,
  // andere services: 360 (default)
};
```

**File:** `shell/js/sidebar.js` (or waar sidebar JS staat)

Bij the openen or a Discord panel, stel minimum width in:
```javascript
function openSidebarPanel(serviceId) {
  const minWidth = SERVICE_MIN_WIDTHS[serviceId] || 360;
  const panelWidth = Math.max(currentPanelWidth, minWidth);
  // pas panel width about
}
```

### Step 3: Slack workspace URL configuration

**Wat:** Slack uses workspace-specific URLs. The default `https://app.slack.com` works if redirect to the juiste workspace, but sommige workspaces vereisen a directe URL (bv. `https://myteam.slack.com`). Robin must this can configureren.

**File:** `src/sidebar/manager.ts`

**Add about:** `SidebarConfig` interface and `openPanel()` methode

```typescript
export interface SidebarConfig {
  panels: Record<string, {
    enabled: boolean;
    muted: boolean;
    width: number;
    customUrl?: string;  // ← for Slack workspace URL
  }>;
  // ...
}
```

Bij the openen or a Slack panel, usage `customUrl` if that geconfigureerd is:

```typescript
openPanel(serviceId: string): SidebarService {
  const service = this.getService(serviceId);
  const panelConfig = this.config.panels[serviceId];
  const url = panelConfig?.customUrl || service.url;
  // maak webview about with this url
}
```

**File:** `src/api/routes/sidebar.ts`

**Add:** Endpoint for workspace URL configuration

```typescript
// POST /sidebar/config — pas panel configuration about
router.post('/sidebar/config', async (req: Request, res: Response) => {
  try {
    const { service, customUrl, width } = req.body;
    if (!service) return res.status(400).json({ error: 'Missing required field: service' });
    ctx.sidebarManager.updatePanelConfig(service, { customUrl, width });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

### Step 4: Notification badge parsing for Discord and Slack

**Wat:** Verifieer that the badge detection correct works for Discord and Slack title patterns.

**Discord title pattern:** `(5) Discord | #general - Server Name` → extract `5`

**Slack title pattern:** Slack uses verschillende patterns:
- `* Slack - Workspace` → unread berichten (sterretje), badge = generiek indicator
- `(3) Slack - Workspace` → sommige Slack versies use getal in title
- No getal → `*` if indicator → toon a punt-badge (no getal)

**File:** `shell/js/sidebar.js` (or waar badge detection staat)

Pas the badge parser about to Slack's sterretje-pattern te herkennen:

```javascript
function parseBadgeCount(serviceId, title) {
  // Default: zoek (N) pattern
  const numMatch = title.match(/\((\d+)\)/);
  if (numMatch) return parseInt(numMatch[1], 10);

  // Slack-specifiek: * prefix = unread (no specifiek getal)
  if (serviceId === 'slack' && title.startsWith('*')) {
    return -1; // -1 = "er are unread berichten" (toon stip, no getal)
  }

  return 0;
}

function updateBadge(serviceId, count) {
  const badge = document.getElementById(`badge-${serviceId}`);
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count.toString();
    badge.style.display = 'flex';
  } else if (count === -1) {
    badge.textContent = '•';  // stip for "unread but no getal"
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}
```

### Stap 5: Test Discord and Slack panels

**Wat:** Handmatig testen that beide panels correct laden, login works, and session bewaard blijft.

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: Open Discord panel
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/open \
  -H "Content-Type: application/json" \
  -d '{"service": "discord"}'
# Verwacht: {"ok":true,"panel":{"id":"discord","name":"Discord",...}}

# Test 2: Open Slack panel
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/open \
  -H "Content-Type: application/json" \
  -d '{"service": "slack"}'
# Verwacht: {"ok":true,"panel":{"id":"slack","name":"Slack",...}}

# Test 3: Configureer Slack workspace URL
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/config \
  -H "Content-Type: application/json" \
  -d '{"service": "slack", "customUrl": "https://myteam.slack.com"}'
# Verwacht: {"ok":true}

# Test 4: Verifieer configuration opgeslagen
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/sidebar/list
# Verwacht: slack service with customUrl in the output

# Test 5: Toggle works for alle drie
for svc in whatsapp discord slack; do
  curl -s -H "Authorization: Bearer $TOKEN" \
    -X POST http://localhost:8765/sidebar/toggle \
    -H "Content-Type: application/json" \
    -d "{\"service\": \"$svc\"}"
  echo ""
done
# Verwacht: 3x {"ok":true,"visible":true,...}
```

**UI verificatie:**
- [ ] Discord icon (🎮) clicking opens Discord web app in sidebar panel
- [ ] Discord login scherm appears, login is mogelijk
- [ ] Na login: session blijft bewaard na browser herstart (persist:discord)
- [ ] Slack icon (💼) clicking opens Slack in sidebar panel
- [ ] Slack workspace login works
- [ ] If `customUrl` geconfigureerd is, loads Slack that specific workspace URL
- [ ] Notification badges verschijnen for Discord and Slack bij unread berichten
- [ ] Schakelen between WhatsApp, Discord and Slack works soepel (vorige verbergt, new appears)
- [ ] Alle drie panels onthouden hun scroll-positie and chat-state

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-2-discord-slack.md) fully
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
6. git commit -m "🗨️ feat: sidebar Discord + Slack panels"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next session start bij fase-3-telegram-instagram-x.md
```

---

## Bekende valkuilen

- [ ] Discord minimum width (420px) — panel mag not smaller be
- [ ] Discord CAPTCHA bij first login — this is eenmalig, persist:discord onthoudt the session after that
- [ ] Slack workspace URL — default `https://app.slack.com` redirect to juiste workspace, but sommige setups vereisen directe URL
- [ ] Slack badge pattern anders then andere services — `*` prefix ipv `(N)` getal
- [ ] TypeScript strict mode — no `any` buiten catch
- [ ] Vergeet not the new `/sidebar/config` endpoint also te testen
