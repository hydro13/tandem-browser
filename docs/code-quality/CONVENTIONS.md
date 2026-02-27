# Conventions — Version Bumping & Changelog

## Version Scheme

Tandem uses **semver**: `MAJOR.MINOR.PATCH`

- **PATCH** (0.11.X → 0.11.X+1): bug fixes, small refactors, cleanup items
- **MINOR** (0.X.0 → 0.X+1.0): new features, significant architecture changes
- **MAJOR** (X.0.0): breaking API changes (not expected pre-1.0)

## When to Bump

| Change type | Version bump | Example |
|-------------|-------------|---------|
| Quick win (items 1–10) | PATCH per session (group fixes) | 0.11.0 → 0.11.1 |
| Medium effort (items 11–16) | PATCH per item | 0.11.1 → 0.11.2 |
| Large effort (items 17–19) | MINOR if architectural | 0.11.X → 0.12.0 |

## Workflow Per Session

Every Claude Code session that makes changes MUST do these steps before finishing:

### 1. Bump version in `package.json`

```bash
# Read current version
grep '"version"' package.json

# Edit to new version (e.g., 0.11.1 → 0.11.2)
```

### 2. Add changelog entry

Add a new section at the TOP of `CHANGELOG.md` (below the header, above the previous entry):

```markdown
## [0.11.X] — YYYY-MM-DD

### Code Quality — Items N, M

- **Item N title**: one-line description of what changed
- **Item M title**: one-line description of what changed
```

Keep changelog entries concise — 1-2 lines per item, not paragraphs.

### 3. Update STATUS.md

- Mark completed items as `DONE`
- Fill in Session date and Commit hash
- Update "Current State" section at the top
- Add a Session Log entry at the bottom

### 4. Commit everything together

```bash
git add package.json CHANGELOG.md docs/code-quality/STATUS.md [changed files]
git commit -m "chore: bump to 0.11.X — items N, M (description)"
```

## Catching Up the Changelog

The changelog is currently behind. The structure improvement work (0.10.3 → now) needs a catch-up entry. This should be done as the first action in the first code-quality session:

### Missing changelog entries (already committed, not yet in CHANGELOG):

1. `0.11.0` — Code Quality Foundation
   - Split api/server.ts into 12 route modules (3032→349 lines)
   - Split main.ts into ipc/handlers, menu/app-menu, notifications/alert (1016→575 lines)
   - Shared utilities: tandemDir(), handleRouteError()
   - Fix circular dependency (copilotAlert)
   - Unified npm test + 152 tests (was 86)
   - CDP types + reduced `any` usage in devtools code
   - Split shell/index.html into external CSS/JS (6572→451 lines)
   - ManagerRegistry DI pattern (TandemAPIOptions 35→3 params)
   - Explicit SecurityManager.init() consolidation
   - Naming consistency (cleanup→destroy)
   - Removed all catch(e: any) → catch(e) + instanceof Error (96 fixes, 32 files)
   - Replaced 48 unsafe `: any` with proper types (64→16 remaining)

This entry covers commits `e488d5a` through `e26405f` on branch `claude/vigilant-lumiere`.
