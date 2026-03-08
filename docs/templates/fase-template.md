# Phase [N] — [Name]: [Korte omschrijving]

> **Feature:** [Feature name]
> **Sessions:** 1 session (soms 2 if the complex is)
> **Priority:** [HOOG / MIDDEL / LAAG]
> **Depends on:** Phase [N-1] complete / No

---

## Goal or this fase

[2-3 zinnen: wat bouwt Claude Code in this session? Wat is the eindresultaat?]

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/api/routes/[file].ts` | `function register[X]Routes()` | Hier komen new endpoints bij |
| `src/[module]/manager.ts` | `class [X]Manager` | Existing manager that uitgebreid is |
| `src/main.ts` | `startAPI()` | Registratie new manager |
| `shell/index.html` | `// === [SECTIE] ===` | UI aanpassen |

---

## To Build in this fase

### [Step 1: Name]

**Wat:** [Duidelijke omschrijving in 1-2 zinnen]

**File:** `src/[pad/to/file].ts`

**Function add about:** `function [existingFunction]()`

```typescript
// Code voorbeeld / skelet
export class [NieuweKlasse] {
  constructor(private [dep]: [DepType]) {}
  
  async [methode](): Promise<[ReturnType]> {
    // implementatie
  }
}
```

### [Step 2: Name]

**Wat:** [Omschrijving]

**File:** `src/api/routes/[file].ts`

**Add about:** `function register[X]Routes()`

```typescript
router.post('/[endpoint]', async (req, res) => {
  try {
    // implementatie
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

### [Stap N: UI aanpassen]

**File:** `shell/index.html`

**Zoek to:** `// === [SECTIE] ===`

**Voeg toe:**

```html
<!-- Description or UI toevoeging -->
<div class="[class]">...</div>
```

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: [name]
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/[endpoint] \
  -H "Content-Type: application/json" \
  -d '{"[param]": "[waarde]"}'
# Verwacht: {"ok":true, "[field]": ...}

# Test 2: [name]
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/[endpoint]
# Verwacht: {"ok":true, ...}
```

**UI verificatie:**
- [ ] [Visual te zien: beschrijf wat visible must are]
- [ ] [Interactie: beschrijf wat klikbaar/werkend must are]

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-[N].md) fully
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
6. git commit -m "[emoji] feat: [korte description]"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next session start bij...
```

---

## Bekende valkuilen

- [ ] [Valkuil 1: bv. vergeet the will-quit cleanup]
- [ ] [Valkuil 2: bv. TypeScript strict mode — no any buiten catch]
- [ ] [Valkuil 3: bv. test in persist:tandem session, not in guest]
