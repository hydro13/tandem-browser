# Structure Improvements — Voortgang

> Gebaseerd op `docs/CODEBASE-STRUCTURE-REPORT.md` (2026-02-26)
> Update dit bestand na elke sessie die aan een punt werkt.

## Status

| # | Verbetering | Status | Sessie | Notities |
|---|-------------|--------|--------|----------|
| 1 | Split `api/server.ts` in route files | TODO | — | Hoogste prioriteit. ~1700 regels → routes/ directory |
| 2 | Split `main.ts` (IPC, bootstrap, menu) | TODO | — | 1016 regels → ipc/, bootstrap/, menu.ts |
| 3 | Shared utilities (`paths`, `url`, `errors`) | TODO | — | Quick win. src/utils/ aanmaken |
| 4 | Fix circulaire deps (`copilotAlert`) | TODO | — | Quick win. Verplaats naar src/notifications/ |
| 5 | Unified `npm test` + meer tests | TODO | — | TabManager, API routes, activity handler |
| 6 | Type safety: CDP types + minder `any` | TODO | — | Begin bij devtools/types.ts |
| 7 | Split `shell/index.html` | TODO | — | JS naar shell/js/, CSS naar shell/css/ |
| 8 | Manager registry / DI pattern | TODO | — | Vervangt 35-param TandemAPIOptions |
| 9 | Expliciete initialisatie volgorde | TODO | — | SecurityManager builder/init pattern |
| 10 | Naming consistency | TODO | — | destroy/cleanup, ChatMessage, ActivityEntry |

## Hoe te gebruiken

Start een sessie met:
> "Voer punt [N] uit van docs/STRUCTURE-IMPROVEMENTS.md"

Of voor meerdere quick wins:
> "Doe punten 3 en 4 van docs/STRUCTURE-IMPROVEMENTS.md"

## Logboek

<!-- Voeg hier per sessie een entry toe -->

### Template
```
### [datum] — Punt [N]: [titel]
- **Wat gedaan:** ...
- **Bestanden gewijzigd:** ...
- **Tests:** passing / failing
- **Openstaand:** ...
```
