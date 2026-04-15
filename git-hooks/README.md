# Git Hooks — Auto-Versioning

## post-commit

Runs after every commit **on the `main` branch only** and automatically:

- Parses the commit message (conventional commits)
- Strips leading emoji so `🗂️ feat: …` is recognised as `feat:`
- Bumps version in `package.json` based on commit type:
  - `fix:` → patch (0.14.3 → 0.14.4)
  - `feat:` → minor (0.14.3 → 0.15.0)
  - `feat!:` or `BREAKING CHANGE` → major (0.14.3 → 1.0.0)
- Updates `CHANGELOG.md` with new entry
- Updates `shell/about.html` version string
- Creates follow-up commit: `chore: bump to vX.Y.Z`

Commits on feature branches are not affected.

## Installation (optional)

The hook is only needed if you merge directly to `main`.
Feature-branch contributors can skip this step.

Run from repo root:
```bash
./setup-dev.sh
```

Or manually:
```bash
git config core.hooksPath git-hooks
chmod +x git-hooks/post-commit
```

## Skip Hook

To commit without triggering the hook:
```bash
git commit --no-verify -m "..."
```
