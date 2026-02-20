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
| `fase-3-sessions.md` | /sessions — geïsoleerde sessies | 📋 Wacht op fase 2 |
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
curl http://localhost:8765/devtools/status

# App starten
npm start
```

---

## Codebase — Kritieke bestanden

```
src/
├── api/server.ts           # ← HIER komen alle nieuwe endpoints bij
│                           #   ~118 endpoints, voeg toe onderaan, breek niets
├── devtools/
│   ├── manager.ts          # CDP attach/detach patroon — hergebruiken voor snapshot + mock
│   ├── network-capture.ts  # Bestaande network monitoring — uitbreiden voor mock
│   └── types.ts            # CDP types
├── tabs/manager.ts         # Tab + partition lifecycle — nodig voor fase 3 sessies
├── main.ts                 # Electron main process — webContents lifecycle
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
│   └── state.ts
│
cli/                        # Fase 4 (buiten src/)
├── index.ts
├── client.ts
└── commands/
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
- **App starten:** `npm start`
- **API auth:** Bearer token uit `~/.tandem/api-token`
- **Robin's sessie:** `persist:tandem` — NOOIT aanraken met agent code
- **CDP:** al actief via `src/devtools/manager.ts` — niet opnieuw initialiseren
