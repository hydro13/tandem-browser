# Design: [Feature Name]

> **Date:** YYYY-MM-DD
> **Status:** Draft / Under review / Approved / Rejected
> **Effort:** Easy (1-2d) / Medium (3-5d) / Hard (1-2wk)
> **Author:** [Name]

---

## Problem / Motivation

[Why do we want to build this? What problem does it solve?
Reference the gap analysis if relevant.]

**Opera has:** [description of Opera's implementation]
**Tandem currently has:** [what we currently have or are missing]
**Gap:** [the difference]

---

## User Experience — How It Works

[Tell the story from Robin's perspective]

> Robin opens Tandem. He clicks on [X]. [Y] appears.
> He can now do [Z] without [pain point].

---

## Technical Approach

### Architecture

```
[ASCII diagram]
```

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/[module]/manager.ts` | [What] |
| `shell/[component].js` | [What] |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/api/server.ts` | Extend `TandemAPIOptions` | `class TandemAPI` |
| `src/main.ts` | Instantiate + register manager | `startAPI()` |
| `shell/index.html` | Add UI | `// === [SECTION] ===` |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/[endpoint]` | [what it does] |
| POST | `/[endpoint]` | [what it does] |

### No new npm packages needed? ✅ / New packages:
- `[package]@[version]` — [reason]

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | [Core/backend] | 1 | — |
| 2 | [UI/extension] | 1 | Phase 1 |
| 3 | [Polish/tests] | 1 | Phase 2 |

---

## Risks / Pitfalls

- **[Risk 1]:** [How to mitigate]
- **[Risk 2]:** [How to mitigate]

---

## Anti-detect Considerations

[Are there anti-detect implications? E.g. anything that ends up in the webview?]
- ✅ Everything via Electron main process / shell — no injection into the webview
- ⚠️ [Any concerns]

---

## Open Questions

- [ ] [Question 1: e.g. do you want X or Y as UI approach?]
- [ ] [Question 2]
