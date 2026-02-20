# Tandem × Agent-Browser Gaps — START HIER

> **Laatste update:** 20 februari 2026
> **Doel:** Tandem de 4 features geven die agent-browser zo populair maken,
> zonder de stealth/symbiose kern te breken.
> **Volgorde:** Fase 1 → 2 → 3 → 4 (elke fase is onafhankelijk maar bouwt op de vorige)

---

## Waarom deze features?

agent-browser (Vercel Labs) heeft 14.7k stars omdat het één ding goed doet:
AI agents een eenvoudige, gestructureerde manier geven om het web te bedienen.

Tandem doet hetzelfde maar beter — echte browser, echte sessies, echte mens als copiloot.
Maar Tandem mist de developer-vriendelijke laag die agent-browser zo populair maakt.

**Deze 4 features dichten dat gat:**

| Fase | Feature | Waarom |
|------|---------|--------|
| 1 | `/snapshot` — accessibility tree met @refs | LLMs kunnen elementen vinden zonder CSS selectors |
| 2 | `/network/mock` — requests intercepten/mocken | Testing, development, ad-blocking |
| 3 | `/sessions` — geïsoleerde browser sessies | Meerdere AI agents tegelijk |
| 4 | `tandem` CLI — thin wrapper | Developer UX, compat met agent-browser workflow |

---

## Architectuur in 30 seconden

```
Claude Code / andere AI
        │
        ▼
  Tandem API :8765
  (Express + Bearer auth)
        │
   ┌────┴────────────────────┐
   │                         │
   ▼                         ▼
src/snapshot/          src/network/
manager.ts             mocker.ts
(CDP: Accessibility)   (CDP: Fetch)
        │
   ┌────┴──────┐
   │           │
   ▼           ▼
src/sessions/  cli/
manager.ts     index.ts
(Electron      (npm package
 partitions)    @hydro13/tandem-cli)
```

### Anti-detect KRITISCH
- Accessibility tree via `CDP: Accessibility.getFullAXTree()` — vanuit main process
- Network intercept via `CDP: Fetch.enable` — vanuit main process
- Nooit DOM crawlers of scripts injecteren in de webview
- Robin's sessie (`persist:tandem`) wordt **NOOIT** aangeraakt door agent sessies

---

## Documenten in deze map

| Bestand | Wat | Status |
|---------|-----|--------|
| `LEES-MIJ-EERST.md` | ← dit bestand | — |
| `TODO.md` | Checklist per fase, vink af wat klaar is | 📋 Actief bijhouden |
| `fase-1-snapshot.md` | /snapshot endpoint — accessibility tree | 📋 Klaar om te starten |
| `fase-2-network-mock.md` | /network/mock — intercept/block/mock | 📋 Wacht op fase 1 |
| `fase-3-sessions.md` | /sessions — geïsoleerde sessies (3 sub-sessies) | 📋 Wacht op fase 2 |
| `fase-4-cli.md` | tandem CLI wrapper package | 📋 Wacht op fase 3 |

---

## Quick Status Check (run dit altijd eerst)

```bash
# Tandem API draait?
curl http://localhost:8765/status

# TypeScript clean?
npx tsc

# Git status clean?
git status

# CDP beschikbaar? (nodig voor fase 1 + 2)
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/devtools/status

# App starten (ALTIJD via npm start, nooit npx electron .)
npm start
```

---

## Codebase — Kritieke bestanden

```
src/
├── api/server.ts           # ← HIER komen alle nieuwe endpoints bij
│                           #   ~170 endpoints (2385 regels), voeg toe NA de DevTools sectie
│                           #   Sectie-marker: zoek naar "// COPILOT STREAM" (regel ~2354)
│                           #   Voeg nieuwe secties toe VOOR die regel
├── devtools/
│   ├── manager.ts          # CDP attach/detach + sendCommand() — hergebruiken voor snapshot + mock
│   │                       # Network capture zit OOK in dit bestand (inline, ring buffer 300 entries)
│   │                       # ER IS GEEN apart network-capture.ts bestand!
│   ├── console-capture.ts  # Console log capture (apart)
│   └── types.ts            # CDP types (DOMNodeInfo, StorageData, etc.)
├── tabs/manager.ts         # Tab lifecycle — tabs worden aangemaakt via RENDERER
│                           # (window.__tandemTabs.createTab in shell/index.html)
├── main.ts                 # Electron main process — manager instantiatie + wiring
│                           # startAPI() functie (regel ~250): hier worden ALLE managers aangemaakt
│                           # will-quit handler (regel ~852): hier worden managers opgeruimd
│
│   [NIEUW — jij bouwt dit:]
├── snapshot/               # Fase 1
│   ├── manager.ts
│   └── types.ts
├── network/                # Fase 2
│   ├── mocker.ts
│   └── types.ts
├── sessions/               # Fase 3
│   ├── manager.ts
│   ├── types.ts
│   └── state.ts
│
cli/                        # Fase 4 (buiten src/, eigen package.json + tsconfig.json)
├── index.ts
├── client.ts
└── commands/
```

---

## Harde regels (breek deze NOOIT)

1. **TypeScript strict mode** — geen `any` behalve in catch blocks (`e: any`)
2. **Geen npm packages toevoegen** zonder expliciete goedkeuring van Robin
3. **Alle CDP calls via `devToolsManager.sendCommand(method, params)`** — nooit zelf `debugger.attach()` aanroepen. DevToolsManager beheert de CDP verbinding
4. **Nieuwe managers altijd registreren** in 3 plekken (zie "Manager Wiring" hieronder)
5. **`persist:tandem` partition** — NOOIT schrijven, NOOIT wissen vanuit agent code
6. **module: commonjs** — geen ES modules, geen `import type` met assertions
7. **Named exports** — geen `export default`, altijd `export class/function/interface`
8. **Anti-detect** — zie AGENTS.md: nooit scripts injecteren in webview, altijd CDP vanuit main process
9. **Tabs worden aangemaakt via de renderer** — `window.__tandemTabs.createTab()` in shell/index.html, niet vanuit main process

---

## Manager Wiring — hoe nieuwe managers registreren

Elke nieuwe manager (SnapshotManager, NetworkMocker, SessionManager) moet op **3 plekken** worden aangesloten:

### 1. `src/api/server.ts` — TandemAPIOptions interface (regel ~64)

```typescript
export interface TandemAPIOptions {
  // ... bestaande managers ...
  snapshotManager: SnapshotManager;  // ← toevoegen
}
```

En in de constructor opslaan:

```typescript
this.snapshotManager = opts.snapshotManager;
```

### 2. `src/main.ts` — startAPI() functie (regel ~250)

Instantieer de manager en geef hem mee aan TandemAPI:

```typescript
// In startAPI(), NA devToolsManager aanmaken:
const snapshotManager = new SnapshotManager(devToolsManager!);

// In new TandemAPI({...}):
api = new TandemAPI({
  // ... bestaande managers ...
  snapshotManager: snapshotManager!,
});
```

### 3. `src/main.ts` — will-quit handler (regel ~852)

Cleanup toevoegen:

```typescript
app.on('will-quit', () => {
  // ... bestaande cleanup ...
  if (snapshotManager) snapshotManager.destroy();
});
```

---

## API Endpoint Patroon — kopieer dit exact

Elke endpoint in de codebase volgt dit patroon:

```typescript
// Sectie header (verplicht bij nieuwe feature-groep)
// ═══════════════════════════════════════════════
// SNAPSHOT — Accessibility Tree met @refs
// ═══════════════════════════════════════════════

this.app.get('/snapshot', async (req: Request, res: Response) => {
  try {
    const interactive = req.query.interactive === 'true';
    const result = await this.snapshotManager.getSnapshot({ interactive });
    res.json({ ok: true, snapshot: result.text, count: result.count, url: result.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

**Regels:**

- `try/catch` rond ALLES
- Catch altijd als `(e: any)` → `res.status(500).json({ error: e.message })`
- 400 voor ontbrekende verplichte velden
- 404 voor niet-gevonden resources
- Success: altijd `{ ok: true, ...data }`

---

## CDP Aanroep Patroon — zo werkt het

DevToolsManager heeft een publieke methode `sendCommand(method, params)` (regel ~733 in devtools/manager.ts):

```typescript
// Binnenkant van sendCommand:
async sendCommand(method: string, params?: Record<string, any>): Promise<any> {
  const wc = await this.ensureAttached();  // hergebruikt bestaande connectie
  if (!wc) throw new Error('No active tab or CDP attach failed');
  return wc.debugger.sendCommand(method, params || {});
}
```

**Gebruik vanuit nieuwe managers:**

```typescript
// ✅ GOED — via devToolsManager
const tree = await this.devtools.sendCommand('Accessibility.getFullAXTree', {});

// ❌ FOUT — nooit zelf attach doen
const wc = tabManager.getActiveWebContents();
wc.debugger.attach('1.3');  // NOOIT! DevToolsManager beheert dit
```

**CDP Accessibility API** (Electron 40 = Chromium ~134, beide beschikbaar):

```typescript
await this.devtools.sendCommand('Accessibility.enable', {});
const result = await this.devtools.sendCommand('Accessibility.getFullAXTree', {});
// result.nodes = AXNode[] met role, name, value, children, etc.
```

---

## Regels voor elke sessie

1. **Lees dit bestand + het relevante fase-document** voor je begint
2. **Lees de bestaande code** die aangeraakt wordt — snap de patronen
3. **Breek niets** — `GET /devtools/status` en bestaande endpoints moeten altijd blijven werken
4. **Anti-detect patronen verplicht** — zie AGENTS.md (één map omhoog)
5. **Incrementeel bouwen** — kleine stukken, steeds compileren
6. **`npx tsc` na elke functie** — niet wachten tot het eind
7. **Curl test ELKE nieuwe endpoint** voor je klaar bent
8. **Commit werkende code** aan het eind van de sessie
9. **Update TODO.md** — vink af, noteer obstakels, zet datum erbij

---

## Sessie Protocol

### Bij start:
```
1. Lees LEES-MIJ-EERST.md (dit bestand)
2. Lees fase-X.md voor de huidige fase
3. Check TODO.md — waar waren we gebleven?
4. Run: curl http://localhost:8765/status && npx tsc
5. Lees de te wijzigen bronbestanden
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start zonder crashes
3. Curl test alle nieuwe endpoints
4. Update TODO.md (vink [x], voeg datum toe)
5. Git commit + push
6. Rapport:
   ## Gebouwd
   ## Getest (curl output)
   ## Obstakels
   ## Volgende sessie start bij...
```

---

## Key Info

- **Repo:** https://github.com/hydro13/tandem-browser (privé)
- **Owner:** Robin Waslander (hydro13)
- **App starten:** `npm start` (NOOIT `npx electron .` of `npm run dev`)
- **API auth:** Bearer token uit `~/.tandem/api-token`
- **Robin's sessie:** `persist:tandem` — NOOIT aanraken met agent code
- **CDP:** al actief via `src/devtools/manager.ts` — niet opnieuw initialiseren
- **Electron versie:** 40 (Chromium ~134) — CDP Accessibility API is beschikbaar
- **TypeScript:** strict mode, target ES2022, module commonjs
- **server.ts:** ~2385 regels, ~170 endpoints, sectie-markers met `═══`
