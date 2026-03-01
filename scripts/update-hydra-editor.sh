#!/bin/bash
# update-hydra-editor.sh — Rebuild Hydra Editor IIFE bundle and copy to Tandem vendor
# Usage: ./scripts/update-hydra-editor.sh

set -e

HYDRA_DIR="../hydra-editor"
VENDOR_DIR="shell/vendor/hydra-editor"

echo "🔨 Building Hydra Editor IIFE bundle..."
cd "$HYDRA_DIR"
npm run build:bundle

cd - > /dev/null
echo "📦 Copying to $VENDOR_DIR..."
mkdir -p "$VENDOR_DIR"
cp "$HYDRA_DIR/dist/hydra-editor.iife.global.js" "$VENDOR_DIR/hydra-editor.iife.js"
cp "$HYDRA_DIR/dist/styles.css" "$VENDOR_DIR/styles.css"

echo "✅ Done! Hydra Editor updated in $VENDOR_DIR"
ls -lh "$VENDOR_DIR"
