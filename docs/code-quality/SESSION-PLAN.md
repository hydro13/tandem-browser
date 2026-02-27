# Session Planning — How to Split Work Across Claude Code Sessions

## Context Window Reality

A Claude Code session has a context window of ~200K tokens. What that means in practice:

| Activity | Context cost | Typical capacity per session |
|----------|-------------|------------------------------|
| Reading a file | ~1K per 100 lines | Can read ~50 files before pressure |
| Editing a file | ~500 tokens per edit | ~100 edits per session comfortably |
| Running a command | ~200-500 tokens per run | ~100 commands per session |
| Agent dispatch (parallel) | ~5K per agent | 4-6 agents per batch |
| Compaction event | Loses detail, keeps summary | Happens once, then session is degraded |

**Rule of thumb:** A session can comfortably handle **5-10 quick items** or **1-2 medium items** before context pressure builds up. Once compaction happens, the session can continue but loses specifics from earlier work.

## Recommended Session Split

### Session 1: Changelog catch-up + Quick wins batch 1 (items 1-5)
**Estimated context usage:** 60-70%

1. First: bump package.json to 0.11.0, add changelog entry for all prior refactoring work
2. Item 1: Constants file (touches 7+ files)
3. Item 2: Dead code cleanup (2 files)
4. Item 3: Tab-register race fix (1 file)
5. Item 4: Silent catch → warn (8 files)
6. Item 5: Timing-safe token (1 file)
7. Bump to 0.11.1, update changelog + STATUS.md

### Session 2: Quick wins batch 2 (items 6-10)
**Estimated context usage:** 50-60%

1. Read STATUS.md first
2. Item 6: Dutch → English (~10 files)
3. Item 7: Extract script-guard functions (2 files)
4. Item 8: Named timeout constants (5+ files)
5. Item 9: Fix require('fs') + deprecate query token (2 files)
6. Item 10: Fix setInterval(async) (2 files)
7. Bump to 0.11.2, update changelog + STATUS.md

### Session 3: Logger utility (item 11)
**Estimated context usage:** 80-90% (207 replacements across 48 files)

1. Read STATUS.md first
2. Create `src/utils/logger.ts`
3. Replace console.log calls (use parallel agents for batches of files)
4. Bump to 0.11.3, update changelog + STATUS.md

### Session 4: ESLint setup (item 12)
**Estimated context usage:** 70-80%

1. Read STATUS.md first
2. Install eslint + plugins
3. Create config
4. Fix auto-fixable issues
5. Triage remaining warnings
6. Bump to 0.11.4, update changelog + STATUS.md

### Session 5: Medium items 13-16
**Estimated context usage:** 70-80%

1. Read STATUS.md first
2. Item 13: Split security-manager routes
3. Item 14: Lazy passwordManager
4. Item 15: Tests for pure logic modules
5. Item 16: Execute-js timeout
6. Bump to 0.11.5, update changelog + STATUS.md

### Sessions 6-8: Large items (17-19), one per session
Each is a focused session touching many files.

---

## How to Start Each Session

Paste this as your first message:

```
Lees docs/code-quality/STATUS.md en pak de volgende openstaande items op.
Volg de conventions in docs/code-quality/CONVENTIONS.md voor version bump en changelog.
```

Or for a specific item:

```
Lees docs/code-quality/STATUS.md en voer item [N] uit.
Volg de conventions in docs/code-quality/CONVENTIONS.md.
```

## Tips for Efficient Sessions

1. **Parallel agents** are your friend — when items touch independent files, dispatch them simultaneously
2. **Don't read files you won't edit** — saves context for actual work
3. **Verify before commit** — always run `npx tsc --noEmit` and `npx vitest run` before committing
4. **One commit per logical group** — not per file, but per completed item or batch of related items
5. **Update STATUS.md as the last step** — this is your handoff to the next session
