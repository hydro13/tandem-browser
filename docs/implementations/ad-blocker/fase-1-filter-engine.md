# Phase 1 — Filter Engine: Download, Parse, Block

> **Feature:** Ad Blocker
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal or this fase

Bouw the ad blocking system: download EasyList and EasyPrivacy filterlijsten, parse ze to a efficiënte in-memory datastructuur, and blokkeer matchende HTTP requests via the existing `RequestDispatcher`. Registreer API endpoints for status and filter management. After this phase blokkeert Tandem advertenties and trackers op netwerk-niveau.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/network/dispatcher.ts` | `class RequestDispatcher`, `registerBeforeRequest()`, `attach()` | AdBlockManager registreert zich hier if request filter |
| `src/main.ts` | `startAPI()`, `dispatcher = new RequestDispatcher(ses)` | Begrijp hoe dispatcher is aangemaakt and uses |
| `src/main.ts` | `stealth.registerWith(dispatcher)` | Referentiepatroon: hoe a manager zich registreert bij RequestDispatcher |
| `src/main.ts` | `app.on('will-quit')` | Cleanup add |
| `src/registry.ts` | `interface ManagerRegistry` | AdBlockManager add |
| `src/api/server.ts` | `setupRoutes()` | Route-module registreren |
| `src/api/routes/sessions.ts` | `registerSessionRoutes()` | Referentiepatroon for route registratie |
| `src/security/security-manager.ts` | `class SecurityManager` | Referentie: hoe NetworkShield already request filtering doet (priority ≠ conflicteren) |

---

## To Build in this fase

### Step 1: Filter list downloader

**Wat:** Download EasyList.txt and EasyPrivacy.txt or officiële bronnen, cache ze in `~/.tandem/adblock/`, and update ze periodiek (daily).

**File:** `src/adblock/filter-lists.ts`

```typescript
export interface FilterListConfig {
  name: string;
  url: string;
  localPath: string;
}

const DEFAULT_LISTS: FilterListConfig[] = [
  {
    name: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
    localPath: 'easylist.txt',
  },
  {
    name: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    localPath: 'easyprivacy.txt',
  },
];

export class FilterListDownloader {
  private cacheDir: string; // ~/.tandem/adblock/

  constructor() { ... }

  /** Download alle filterlijsten (or usage cache if recent genoeg) */
  async downloadAll(): Promise<string[]> { ... }

  /** Download één list if cache ouder is then maxAge (default 24h) */
  async downloadIfStale(list: FilterListConfig, maxAgeMs?: number): Promise<string> { ... }

  /** Forceer download or alle lijsten */
  async forceUpdate(): Promise<void> { ... }
}
```

### Step 2: Filter engine — parser and matcher

**Wat:** Parse ABP/EasyList filter syntax to a efficiënte lookup structuur. Match inkomende request URLs tegen the rules.

**File:** `src/adblock/filter-engine.ts`

```typescript
export interface FilterRule {
  pattern: string;
  regex: RegExp | null;
  isException: boolean;       // @@-rules (whitelist)
  domains: string[] | null;   // $domain=... optie
  thirdPartyOnly: boolean;    // $third-party optie
  resourceTypes: string[] | null; // $script,$image etc.
}

export class FilterEngine {
  private blockRules: FilterRule[] = [];
  private exceptionRules: FilterRule[] = [];
  private domainBlockSet: Set<string> = new Set(); // snelle hash lookup for domain-rules
  private ruleCount = 0;

  /** Parse a filterlijst file (EasyList format) */
  loadFilterList(content: string): void {
    // Parse elke regel:
    // - Skip comments (! ...) and headers ([Adblock Plus ...])
    // - Parse @@-rules if exceptions
    // - Parse $-opties (domain, third-party, script, image, etc.)
    // - Converteer URL patterns to RegExp or string match
    // - Voeg toe about blockRules or exceptionRules
  }

  /** Check whether a URL should be blocked */
  match(url: string, resourceType: string, pageDomain: string): boolean {
    // 1. Check domain block set (snelste pad for ||domain^ rules)
    // 2. Check exception rules — if match, return false (not blokkeren)
    // 3. Check block rules — if match, return true (blokkeren)
    // 4. Return false (not blokkeren)
  }

  /** Aantal geladen rules */
  getRuleCount(): number { return this.ruleCount; }
}
```

**ABP Filter Syntax (subset to te ondersteunen):**
- `||example.com^` — blokkeer alle requests to example.com
- `/ads/banner` — blokkeer URLs that this pad bevatten
- `@@||example.com^` — exception (whitelist) for example.com
- `$third-party` — only third-party requests blokkeren
- `$domain=example.com` — only op specific page's blokkeren
- `$script,image,stylesheet` — resource type filters
- `*` — wildcard
- `^` — separator (alles behalve alfanumeriek and _-.%)

### Step 3: AdBlockManager — orchestratie

**Wat:** Combineert filter list download, engine, whitelist, and request interception. Registreert zich bij RequestDispatcher.

**File:** `src/adblock/manager.ts`

```typescript
import { FilterListDownloader } from './filter-lists';
import { FilterEngine } from './filter-engine';
import type { RequestDispatcher } from '../network/dispatcher';

export class AdBlockManager {
  private engine: FilterEngine;
  private downloader: FilterListDownloader;
  private enabled = true;
  private whitelist: Set<string> = new Set();  // gewhiteliste domains
  private blockedCounts: Folder<number, number> = new Folder(); // tabId → count
  private totalBlocked = 0;

  constructor() { ... }

  /** Initialiseer: download lijsten, parse, registreer bij dispatcher */
  async init(): Promise<void> {
    await this.loadWhitelist();
    const listContents = await this.downloader.downloadAll();
    for (const content or listContents) {
      this.engine.loadFilterList(content);
    }
  }

  /** Registreer bij RequestDispatcher (priority 20) */
  registerWith(dispatcher: RequestDispatcher): void {
    dispatcher.registerBeforeRequest({
      name: 'AdBlocker',
      priority: 20,
      handler: (details) => {
        if (!this.enabled) return false;

        // Bepaal page domain or the request
        const pageDomain = this.extractDomain(details.url);
        const requestDomain = this.extractDomain(details.url);

        // Check whitelist
        if (this.whitelist.has(pageDomain)) return false;

        // Check filter engine
        const resourceType = details.resourceType || 'other';
        if (this.engine.match(details.url, resourceType, pageDomain)) {
          this.incrementBlockedCount(details.webContentsId);
          return true; // cancel request
        }

        return false; // allow request
      }
    });
  }

  /** Status info */
  getStatus(): { enabled: boolean; ruleCount: number; totalBlocked: number } { ... }

  /** Blocked count per tab */
  getBlockedCount(tabId: number): number { ... }

  /** Reset blocked count for tab */
  resetBlockedCount(tabId: number): void { ... }

  /** Toggle globaal about/out */
  toggle(): boolean { ... }

  /** Whitelist management */
  addToWhitelist(domain: string): void { ... }
  removeFromWhitelist(domain: string): void { ... }
  getWhitelist(): string[] { ... }

  /** Forceer filter update */
  async updateFilters(): Promise<void> { ... }

  /** Cleanup */
  destroy(): void { ... }

  private loadWhitelist(): void { ... }
  private saveWhitelist(): void { ... }
  private extractDomain(url: string): string { ... }
  private incrementBlockedCount(webContentsId: number): void { ... }
}
```

### Step 4: API routes

**Wat:** REST endpoints for ad blocker management.

**File:** `src/api/routes/adblock.ts`

**Function:** `registerAdBlockRoutes(router, ctx)`

```typescript
export function registerAdBlockRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // AD BLOCKER — Consumer ad blocking
  // ═══════════════════════════════════════════════

  router.get('/adblock/status', (req, res) => { ... });
  router.post('/adblock/toggle', (req, res) => { ... });
  router.get('/adblock/stats', (req, res) => { ... });
  router.get('/adblock/whitelist', (req, res) => { ... });
  router.post('/adblock/whitelist', (req, res) => { ... });
  router.delete('/adblock/whitelist/:domain', (req, res) => { ... });
  router.post('/adblock/update-filters', async (req, res) => { ... });
}
```

### Stap 5: Wiring — registreer manager and routes

**File:** `src/registry.ts` — voeg `adBlockManager: AdBlockManager` toe

**File:** `src/main.ts` — in `startAPI()`:
```typescript
import { AdBlockManager } from './adblock/manager';

const adBlockManager = new AdBlockManager();
await adBlockManager.init();
if (dispatcher) adBlockManager.registerWith(dispatcher);
```

Voeg toe about registry object and will-quit cleanup.

**File:** `src/api/server.ts` — in `setupRoutes()`:
```typescript
import { registerAdBlockRoutes } from './routes/adblock';
registerAdBlockRoutes(router, ctx);
```

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: Status ophalen
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/adblock/status
# Verwacht: {"ok":true, "enabled":true, "ruleCount":85000+, "totalBlocked":0}

# Test 2: Toggle out
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/adblock/toggle
# Verwacht: {"ok":true, "enabled":false}

# Test 3: Toggle about
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/adblock/toggle
# Verwacht: {"ok":true, "enabled":true}

# Test 4: Whitelist add
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/adblock/whitelist \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
# Verwacht: {"ok":true}

# Test 5: Whitelist ophalen
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/adblock/whitelist
# Verwacht: {"ok":true, "whitelist":["example.com"]}

# Test 6: Whitelist verwijderen
curl -H "Authorization: Bearer $TOKEN" \
  -X DELETE http://localhost:8765/adblock/whitelist/example.com
# Verwacht: {"ok":true}

# Test 7: Forceer filter update
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/adblock/update-filters
# Verwacht: {"ok":true}

# Test 8: Navigeer to ad-heavy site, check stats
# (open a page in Tandem, wait even, then:)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/adblock/stats
# Verwacht: {"ok":true, "totalBlocked":N, "blockedPerTab":{...}}
```

**Compilatie verificatie:**
- [ ] `npx tsc` — zero errors
- [ ] `npx vitest run` — alle existing tests slagen
- [ ] `npm start` — app start without crashes
- [ ] Filter lists gecached in `~/.tandem/adblock/`

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-1-filter-engine.md) fully
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
6. git commit -m "🛡️ feat: ad blocker filter engine + API"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next session start bij fase-2-ui-badge-whitelist.md
```

---

## Bekende valkuilen

- [ ] EasyList download can falen bij netwerk issues — usage cached versie if fallback
- [ ] Filter list parsing must async are (can 2-3 seconden duren for 90K rules) — blokkeer not the app startup
- [ ] `webContentsId` in onBeforeRequest is not hetzelfde if `tabId` — you hebt a mapping nodig (or usage webContentsId direct)
- [ ] RequestDispatcher's `registerBeforeRequest` handler must `true` returnen to te blokkeren, `false` to door te laten — check the exacte contract in `dispatcher.ts`
- [ ] TypeScript strict mode — no `any` buiten catch blocks
- [ ] Vergeet not `destroy()` toe te voegen about will-quit handler
- [ ] EasyList URLs: `https://easylist.to/easylist/easylist.txt` and `https://easylist.to/easylist/easyprivacy.txt` — usage HTTPS
