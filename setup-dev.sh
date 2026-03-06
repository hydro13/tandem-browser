#!/bin/bash
# Tandem Browser — Development Setup
# Run this after cloning to configure auto-versioning + git hooks

echo "🔧 Tandem Browser Development Setup"
echo ""

# 1. Install git hooks
echo "📦 Installing git hooks..."
git config core.hooksPath git-hooks
chmod +x git-hooks/post-commit
echo "   ✅ Auto-versioning hook installed (git-hooks/post-commit)"

# 2. Check git config
echo ""
echo "🔍 Checking git author config..."
GIT_NAME=$(git config user.name)
GIT_EMAIL=$(git config user.email)

if [ -z "$GIT_NAME" ] || [ -z "$GIT_EMAIL" ]; then
  echo "   ⚠️  Git author identity is incomplete"
  echo "   Set it manually before committing:"
  echo "   git config user.name \"Your Name\""
  echo "   git config user.email \"you@example.com\""
else
  echo "   ✅ Git config correct: $GIT_NAME <$GIT_EMAIL>"
fi

# 3. Check dependencies
echo ""
echo "📋 Checking dependencies..."
if ! command -v node &> /dev/null; then
  echo "   ❌ Node.js not found — install it first"
else
  NODE_VERSION=$(node -v)
  echo "   ✅ Node.js $NODE_VERSION"
fi

if [ ! -d "node_modules" ]; then
  echo "   ⚠️  node_modules missing — run 'pnpm install' or 'npm install'"
else
  echo "   ✅ node_modules installed"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Commit convention:"
echo "   fix: ...     → patch bump (0.14.3 → 0.14.4)"
echo "   feat: ...    → minor bump (0.14.3 → 0.15.0)"
echo "   feat!: ...   → major bump (0.14.3 → 1.0.0)"
echo "   chore/docs/test/refactor → no version bump"
echo ""
