# Fase 6 — Card Layout: Masonry + Auto-height

> **Afhankelijk van:** Fase 5 ✅

## Doel

Kaarten die nu uitgerekt zijn over de volledige panelhoogte → compact, auto-height, masonry layout zoals Opera.

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
  height: auto;        /* GEEN vaste hoogte — kritisch! */
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

## Layout thema's (optioneel, Opera heeft 3)

Voeg een toggle toe bovenaan het board:
- **Compact** (3 kolommen)
- **Normal** (2 kolommen) — default
- **Spacious** (1 kolom, grotere afbeeldingen)

Opgeslagen per board in `boards.json` als `layout: 'compact' | 'normal' | 'spacious'`.

---

## Acceptatiecriteria

```
1. Kaarten zijn nooit groter dan hun inhoud
2. 2-kolom masonry layout zichtbaar
3. Afbeeldingen laden correct (max 160px hoog)
4. Geen horizontale overflow
5. npx tsc — zero errors
```
