# Design: Tab Emojis

> **Date:** 2026-02-28
> **Status:** Planned
> **Effort:** Easy (1-2d)
> **Author:** Kees

---

## Problem / Motivation

Tabs in Tandem are functional but visually monotonous. When Robin has 15+ tabs open, favicon + title are sometimes not enough to quickly find the right tab — especially with multiple tabs from the same site.

**Opera has:** Tab Emojis — hover over a tab shows an emoji selector. Click "+" to assign an emoji as a badge on the tab. Persistent across sessions.

**Tandem currently has:** Nothing. Tabs show only a favicon, title, source indicator (👤), and a close button. No personalization option.

**Gap:** Completely missing. No emoji assignment, no storage, no UI.

---

## User Experience — How It Works

> Robin has 12 tabs open. Three of them are GitHub repositories — all with the same favicon.
>
> He hovers over the first GitHub tab. Next to the title a small "+" icon appears. He clicks it → a compact emoji picker popup appears (default browser emojis or a grid of popular emojis).
>
> He chooses 🔥 for the main project, 🧪 for the test repo, and 📚 for the docs repo.
>
> Now each tab shows its emoji as a badge before the title. Robin can tell at a glance which tab serves which purpose.
>
> The next day Robin opens Tandem — the emojis are still there. They are stored per URL domain+path.

---

## Technical Approach

### Architecture

```
                    ┌────────────────────┐
                    │ Shell UI            │
                    │ emoji picker popup  │
                    │ badge on tab        │
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
| — | None — everything fits in existing modules |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/tabs/manager.ts` | `emoji` field on `Tab` interface + `setEmoji()` / `getEmoji()` + persistence load/save | `class TabManager` |
| `src/api/routes/tabs.ts` | Emoji set/delete endpoints | `function registerTabRoutes()` |
| `shell/index.html` | Emoji badge in tab element + emoji picker popup on hover | Tab creation in JS |
| `shell/css/main.css` | `.tab-emoji` badge styling | Tab styling section |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| POST | `/tabs/:id/emoji` | Set emoji for tab (body: `{ emoji: "🔥" }`) |
| DELETE | `/tabs/:id/emoji` | Remove emoji from tab |

### Persistence

Storage in `~/.tandem/tab-emojis.json`:
```json
{
  "github.com/hydro13/tandem-browser": "🔥",
  "github.com/hydro13/tandem-cli": "🧪",
  "docs.google.com/document/d/abc123": "📚"
}
```

Key = URL hostname + pathname (without query/hash). When opening a tab, it checks whether there is a stored emoji for that URL.

### No new npm packages needed? ✅

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Full implementation: extend Tab interface, API endpoints, persistence, shell emoji picker + badge | 1 | — |

---

## Risks / Pitfalls

- **Emoji rendering:** Not all emojis render equally well on all OSes. Mitigation: use native OS emoji rendering (no custom font). Tandem runs on macOS/Linux anyway.
- **URL matching too strict:** If the emoji is tied to an exact path, `github.com/hydro13/tandem-browser` won't match `github.com/hydro13/tandem-browser/issues`. Mitigation: match on longest prefix, or let Robin choose: per-page or per-domain.
- **tab-emojis.json grows:** With many sites the file can become large. Mitigation: LRU limit of 500 entries, oldest are removed.

---

## Anti-detect Considerations

- ✅ Everything via shell + main process — no injection into the webview
- ✅ Emoji picker is a shell overlay, not visible to the website
- ✅ Storage is purely local filesystem

---

## Open Questions

- [ ] Emoji picker: simple grid of ~50 popular emojis, or full OS emoji picker?
- [ ] Persistence scope: per exact URL, per domain+path, or per domain?
- [ ] Should the emoji remain visible when a tab is very narrow (where it would overlap with the favicon)?
