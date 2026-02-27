# Shared Utilities & Naming Consistency — Design

**Datum:** 2026-02-27
**Bron:** `docs/STRUCTURE-IMPROVEMENTS.md` items #3 en #10

---

## Wat is veranderd

### 1. `src/utils/paths.ts` — Gedeeld pad-utility

**Functie:** `tandemDir(...subpath)` vervangt 50+ inline `path.join(os.homedir(), '.tandem', ...)` calls.

```typescript
tandemDir()                     // ~/.tandem
tandemDir('extensions')         // ~/.tandem/extensions
tandemDir('security', 'blocklists')  // ~/.tandem/security/blocklists
```

**Functie:** `ensureDir(dir)` vervangt herhaalde `if (!existsSync) mkdirSync` patronen.

**Scope:** 39 productie-bestanden + 1 CLI bestand bijgewerkt. Test files bewust niet aangepast (assertions).

### 2. `src/utils/errors.ts` — Gedeeld error-utility

**Functie:** `handleRouteError(res, e)` vervangt 184 identieke catch blocks in 12 route-bestanden.

```typescript
// Voorheen (in elk route bestand):
} catch (e: any) {
  res.status(500).json({ error: e.message });
}

// Nu:
} catch (e) {
  handleRouteError(res, e);
}
```

**Scope:** Alleen `status(500)` + `{ error: e.message }` blocks vervangen. Catch blocks met andere statuscodes (400, 401, 403, 404), extra logging, of afwijkend JSON-formaat bewust behouden.

### 3. `SessionManager.cleanup()` → `destroy()`

Hernoemd voor consistentie met de 25 andere managers die `destroy()` gebruiken. De bestaande `destroy(name)` methode is samengevoegd: `destroy()` zonder argument wist alle sessies, `destroy(name)` vernietigt één sessie.

---

## Wat niet is veranderd

- **URL utilities** — Te divers om te centraliseren (scheme checks, URL parsing, domain matching)
- **Test files** — Gebruiken `path.join(os.homedir(), '.tandem', ...)` voor assertions, niet als productie-code
