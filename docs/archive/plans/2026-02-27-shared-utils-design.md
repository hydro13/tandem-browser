# Shared Utilities & Naming Consistency — Design

**Date:** 2026-02-27
**Bron:** `docs/STRUCTURE-IMPROVEMENTS.md` items #3 and #10

---

## Wat is veranderd

### 1. `src/utils/paths.ts` — Gedeeld pad-utility

**Function:** `tandemDir(...subpath)` vervangt 50+ inline `path.join(os.homedir(), '.tandem', ...)` calls.

```typescript
tandemDir()                     // ~/.tandem
tandemDir('extensions')         // ~/.tandem/extensions
tandemDir('security', 'blocklists')  // ~/.tandem/security/blocklists
```

**Function:** `ensureDir(dir)` vervangt herhaalde `if (!existsSync) mkdirSync` patterns.

**Scope:** 39 productie-files + 1 CLI file updated. Test files bewust not aangepast (assertions).

### 2. `src/utils/errors.ts` — Gedeeld error-utility

**Function:** `handleRouteError(res, e)` vervangt 184 identieke catch blocks in 12 route-files.

```typescript
// Voorheen (in elk route file):
} catch (e: any) {
  res.status(500).json({ error: e.message });
}

// Nu:
} catch (e) {
  handleRouteError(res, e);
}
```

**Scope:** Only `status(500)` + `{ error: e.message }` blocks vervangen. Catch blocks with andere statuscodes (400, 401, 403, 404), extra logging, or afwijkend JSON-formaat bewust behouden.

### 3. `SessionManager.cleanup()` → `destroy()`

Hernoemd for consistentie with the 25 andere managers that `destroy()` use. The existing `destroy(name)` methode is samengevoegd: `destroy()` without argument wist alle sessions, `destroy(name)` vernietigt één session.

---

## Wat not is veranderd

- **URL utilities** — Te divers to te centraliseren (scheme checks, URL parsing, domain matching)
- **Test files** — Gebruiken `path.join(os.homedir(), '.tandem', ...)` for assertions, not if productie-code
