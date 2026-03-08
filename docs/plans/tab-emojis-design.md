# Design: Tab Emojis

> **Date:** 2026-02-28
> **Status:** Draft
> **Effort:** Easy (1-2d)
> **Author:** Kees

---

## Problem / Motivation

Tabs in Tandem are functioneel but visual eentonig. Wanneer Robin 15+ tabs open has, are favicon + title soms not genoeg to snel the juiste tab te vinden — vooral bij multiple tabs or the same site.

**Opera has:** Tab Emojis — hover over a tab shows a emoji-selector. Klik op "+" to a emoji if badge about the tab toe te wijzen. Persistent across sessions.

**Tandem currently has:** Nothing. Tabs show only a favicon, title, source indicator (👤), and a close button. No personalization option.

**Gap:** Completely missing. No emoji-toewijzing, no opslag, no UI.

---

## User Experience — How It Works

> Robin has 12 tabs open. Drie daarvan are GitHub-repositories — allemaal with hetzelfde favicon.
>
> He hovert over the first GitHub-tab. Next to the title appears a klein "+" icoontje. He clicks erop → a compact emoji-picker popup appears (default browser emoji's or a grid or populaire emoji's).
>
> He chooses 🔥 for the hoofdproject, 🧪 for the test-repo, and 📚 for the docs-repo.
>
> Nu shows elke tab are emoji if badge vóór the title. Robin vindt in één oogopslag welke tab welk goal dient.
>
> The next dag opens Robin Tandem — the emoji's stand er still. Ze are opgeslagen per URL-domain+pad.

---

## Technical Approach

### Architecture

```
                    ┌────────────────────┐
                    │ Shell UI            │
                    │ emoji picker popup  │
                    │ badge op tab        │
                    └─────────┬──────────┘
                              │ fetch()
                    ┌─────────▼──────────┐
                    │ REST API            │
                    │ POST /tabs/:id/emoji│
                    │ routes/tabs.ts      │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ TabManager          │
                    │ tab.emoji field     │
                    │ persist to JSON     │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ ~/.tandem/          │
                    │ tab-emojis.json     │
                    │ { url: emoji }      │
                    └────────────────────┘
```

### New Files

| File | Responsibility |
|---------|---------------------|
| — | No — alles past in existing modules |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/tabs/manager.ts` | `emoji` field op `Tab` interface + `setEmoji()` / `getEmoji()` + persistentie laden/save | `class TabManager` |
| `src/api/routes/tabs.ts` | Emoji set/delete endpoints | `function registerTabRoutes()` |
| `shell/index.html` | Emoji badge in tab element + emoji picker popup op hover | Tab creation in JS |
| `shell/css/main.css` | `.tab-emoji` badge styling | Tab styling section |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| POST | `/tabs/:id/emoji` | Zet emoji for tab (body: `{ emoji: "🔥" }`) |
| DELETE | `/tabs/:id/emoji` | Delete emoji or tab |

### Persistentie

Opslag in `~/.tandem/tab-emojis.json`:
```json
{
  "github.com/hydro13/tandem-browser": "🔥",
  "github.com/hydro13/tandem-cli": "🧪",
  "docs.google.com/document/d/abc123": "📚"
}
```

Key = URL hostname + pathname (without query/hash). Bij the openen or a tab is gekeken or er a opgeslagen emoji is for that URL.

### No new npm packages needed? ✅

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Volledige implementatie: Tab interface uitbreiden, API endpoints, persistentie, shell emoji picker + badge | 1 | — |

---

## Risks / Pitfalls

- **Emoji rendering:** Not alle emoji's renderen even goed op alle OS'and. Mitigation: usage native OS emoji rendering (no custom font). Tandem draait toch op macOS/Linux.
- **URL-matching te strikt:** If the emoji op exact pad zit, matcht `github.com/hydro13/tandem-browser` not with `github.com/hydro13/tandem-browser/issues`. Mitigation: match op langste prefix, or sta Robin toe te kiezen: per-page or per-domain.
- **Tab-emojis.json groeit:** Bij veel sites can the file large be. Mitigation: LRU-limiet or 500 entries, oudste be removed.

---

## Anti-detect considerations

- ✅ Alles via shell + main process — no injection into the webview
- ✅ Emoji picker is a shell-overlay, not visible for the website
- ✅ Opslag is purely local filesystem

---

## Decisions Needed from Robin

- [ ] Emoji-picker: simpel grid or ~50 populaire emoji's, or full OS emoji picker?
- [ ] Persistentie-scope: per exacte URL, per domain+pad, or per domain?
- [ ] Must emoji visible blijven wanneer tab erg narrow is (then overlapt the with favicon)?

---

## Approval

Robin: [ ] Go / [ ] No-go / [ ] Go with adjustment: ___________
