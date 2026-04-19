#!/usr/bin/env bash
# Regenerate docs/changelog.html from GitHub Releases.
# Run after publishing a new release on GitHub to refresh the public changelog.
#
# Requires: gh CLI authenticated to hydro13/tandem-browser, python3
#
# Usage (from repo root or from bin/):
#   ./bin/update-changelog.sh
#   bash bin/update-changelog.sh

set -euo pipefail

REPO="hydro13/tandem-browser"

# Find repo root regardless of invocation directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$REPO_ROOT"

OUT="docs/changelog.html"
TMP="$(mktemp)"

echo "Fetching releases from $REPO..."
RELEASES_JSON="$(gh api "repos/$REPO/releases?per_page=100")"
RELEASE_COUNT="$(echo "$RELEASES_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")"
echo "Found $RELEASE_COUNT releases."

echo "Generating HTML..."
echo "$RELEASES_JSON" | python3 "$SCRIPT_DIR/update-changelog.py" > "$TMP"

mv "$TMP" "$OUT"
echo "Wrote $OUT"
echo ""
echo "To preview:"
echo "  cd docs && python3 -m http.server 8765"
echo "  open http://localhost:8765/changelog.html"
