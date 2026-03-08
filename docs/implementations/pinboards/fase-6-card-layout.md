# Phase 6 — Card Layout: Masonry + Auto-height

> **Depends on:** Phase 5 ✅

## Goal

Kaarten that nu uitgerekt are over the full panelhoogte → compact, auto-height, masonry layout zoals Opera.

---

## CSS fixes

### Masonry grid (CSS columns)

```css
.pb-grid {
  columns: 2;          /* 2 kolommen in sidebar */
  column-gap: 8px;
  padding: 8px;
}

.pb-card {
  break-inside: avoid;
  margin-bottom: 8px;
  height: auto;        /* NO fixed height — critical! */
  min-height: unset;
}
```

### Card image — max hoogte beperken

```css
.pb-card-preview img {
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: 6px 6px 0 0;
}
```

### Quote cards — compact

```css
.pb-card-text-preview {
  font-style: italic;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 12px;
  max-height: 100px;
  overflow: hidden;
}
```

---

## Layout thema's (optional, Opera has 3)

Voeg a toggle toe at the top the board:
- **Compact** (3 kolommen)
- **Normal** (2 kolommen) — default
- **Spacious** (1 kolom, grotere images)

Opgeslagen per board in `boards.json` if `layout: 'compact' | 'normal' | 'spacious'`.

---

## Acceptatiecriteria

```
1. Kaarten are nooit groter then hun inhoud
2. 2-kolom masonry layout visible
3. Images laden correct (max 160px hoog)
4. No horizontale overflow
5. npx tsc — zero errors
```
