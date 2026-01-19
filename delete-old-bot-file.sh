#!/bin/bash

# This script removes the old bot.ts file that's causing duplicate notifications

echo "=== Removing Old Bot File ==="
echo ""

cd "$(dirname "$0")/telegram-bot"

echo "Files to remove:"
echo "  - src/bot.ts (old bot implementation)"
echo "  - dist/bot.js (compiled old bot)"
echo "  - dist/bot.d.ts (type definitions)"
echo ""

# Remove source file
if [ -f "src/bot.ts" ]; then
  rm src/bot.ts
  echo "✅ Removed src/bot.ts"
else
  echo "⚠️  src/bot.ts not found"
fi

# Remove compiled files
if [ -f "dist/bot.js" ]; then
  rm dist/bot.js
  echo "✅ Removed dist/bot.js"
else
  echo "⚠️  dist/bot.js not found"
fi

if [ -f "dist/bot.d.ts" ]; then
  rm dist/bot.d.ts
  echo "✅ Removed dist/bot.d.ts"
else
  echo "⚠️  dist/bot.d.ts not found"
fi

if [ -f "dist/bot.d.ts.map" ]; then
  rm dist/bot.d.ts.map
  echo "✅ Removed dist/bot.d.ts.map"
else
  echo "⚠️  dist/bot.d.ts.map not found"
fi

if [ -f "dist/bot.js.map" ]; then
  rm dist/bot.js.map
  echo "✅ Removed dist/bot.js.map"
else
  echo "⚠️  dist/bot.js.map not found"
fi

echo ""
echo "=== Rebuild and commit ==="

cd ..

# Rebuild
cd telegram-bot
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

echo "✅ Build successful"

cd ..

# Commit
git add telegram-bot/
git status

echo ""
echo "Ready to commit? Run:"
echo "  git commit -m \"fix: remove duplicate bot.ts file causing duplicate notifications\""
echo "  git push"
