# Design: [Feature Name]

> **Date:** YYYY-MM-DD
> **Status:** Draft / Under review / Goedgekeurd / Afgewezen
> **Effort:** Easy (1-2d) / Medium (3-5d) / Hard (1-2wk)
> **Author:** Kees

---

## Problem / Motivation

[Why willen we this bouwen? Welk probleem lost the op?
Refereer to gap analyse if relevant.]

**Opera has:** [description or Opera's implementatie]
**Tandem currently has:** [wat we nu hebben or juist missen]
**Gap:** [the verschil]

---

## User Experience — How It Works

[Vertel the verhaal vanuit Robin's perspectief]

> Robin opens Tandem. He clicks op [X]. Er appears [Y].
> He can nu [Z] doen without [pijnpunt].

---

## Technical Approach

### Architecture

```
[ASCII diagram]
```

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/[module]/manager.ts` | [Wat] |
| `shell/[component].js` | [Wat] |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/api/server.ts` | `TandemAPIOptions` uitbreiden | `class TandemAPI` |
| `src/main.ts` | Manager instantiëren + registreren | `startAPI()` |
| `shell/index.html` | UI add | `// === [SECTIE] ===` |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/[endpoint]` | [wat doet the] |
| POST | `/[endpoint]` | [wat doet the] |

### No new npm packages needed? ✅ / New packages:
- `[package]@[version]` — [reden]

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | [Basis/backend] | 1 | — |
| 2 | [UI/uitbreiding] | 1 | Phase 1 |
| 3 | [Polish/tests] | 1 | Phase 2 |

---

## Risks / Pitfalls

- **[Risk 1]:** [Hoe mitigeren]
- **[Risk 2]:** [Hoe mitigeren]

---

## Anti-detect considerations

[Are er anti-detect implicaties? Bv. iets wat in the webview terechtkomt?]
- ✅ Alles via Electron main process / shell — no injection into the webview
- ⚠️ [Eventuele aandachtspunten]

---

## Decisions Needed from Robin

- [ ] [Question 1: bv. wil you X or Y if UI approach?]
- [ ] [Question 2]

---

## Approval

Robin: [ ] Go / [ ] No-go / [ ] Go with adjustment: ___________
