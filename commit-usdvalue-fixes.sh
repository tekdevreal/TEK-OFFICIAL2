#!/bin/bash

# Script to commit usdValue null safety fixes

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add backend/src/routes/dashboard.ts
git add frontend/src/components/HoldersTable.tsx
git add frontend/src/pages/HoldersPage.tsx
git add frontend/src/components/HoldersValueChart.tsx
git add frontend/src/services/api.ts

echo ""
echo "📝 Committing changes..."
git commit -m "Fix usdValue null safety to prevent dashboard crash

Backend Changes:
- Add defensive checks in /dashboard/holders endpoint
- Ensure usdValue is always a number before calling toFixed()
- Validate all holder fields before returning response
- Default usdValue to 0 if null/undefined/NaN

Frontend Changes:
- Add holder validation in fetchHolders API service
- Filter out null/invalid holders
- Add null checks for usdValue in HoldersTable
- Add null checks for usdValue in HoldersPage
- Add null checks for usdValue in HoldersValueChart
- Use Number() conversion with validation before toFixed()

Purpose:
- Fix 'Cannot read properties of undefined (reading usd)' error
- Prevent crashes when holder data is incomplete
- Ensure all numeric operations are safe

Files changed:
- backend/src/routes/dashboard.ts: Holder response validation
- frontend/src/services/api.ts: Holder array validation
- frontend/src/components/HoldersTable.tsx: usdValue null checks
- frontend/src/pages/HoldersPage.tsx: usdValue null checks
- frontend/src/components/HoldersValueChart.tsx: usdValue null checks"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

