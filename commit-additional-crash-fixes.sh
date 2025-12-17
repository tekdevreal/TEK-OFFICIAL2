#!/bin/bash

# Script to commit and push additional crash fixes

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add frontend/src/pages/HistoricalRewardsPage.tsx
git add frontend/src/components/PayoutStatusChart.tsx
git add frontend/src/components/PayoutsTable.tsx
git add frontend/src/components/HoldersValueChart.tsx
git add frontend/src/components/Notifications.tsx
git add frontend/src/pages/HoldersPage.tsx
git add frontend/src/services/api.ts
git add ADDITIONAL_CRASH_FIXES.md

echo ""
echo "📝 Committing changes..."
git commit -m "Additional crash fixes - data structure safety improvements

Fix remaining null safety issues found after token price removal:
- Fix chart formatters calling .toFixed() on null values
- Add missing summary object checks
- Fix array access without null checks
- Fix sort functions accessing null properties

Changes:
- HistoricalRewardsPage.tsx: Fix chart formatter null safety
- PayoutStatusChart.tsx: Add summary existence check
- PayoutsTable.tsx: Fix summary initialization and access
- HoldersValueChart.tsx: Fix holders array and sort null safety
- Notifications.tsx: Fix summary access with optional chaining
- HoldersPage.tsx: Fix sort function null safety
- api.ts: Add hasMore field and ensure summary always exists

Pattern applied:
- Safe property access: data.summary?.pending || 0
- Safe array access: response.holders || []
- Safe object initialization: response.summary || { ... }

Fixes:
- Dashboard should now load without crashing
- All components handle null/undefined data gracefully
- Charts render safely even with missing data
- No more 'Cannot read properties of null' errors"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

