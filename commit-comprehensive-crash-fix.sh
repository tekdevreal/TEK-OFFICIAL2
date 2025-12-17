#!/bin/bash

# Script to commit and push comprehensive dashboard crash fix

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add frontend/src/components/RewardSummary.tsx
git add frontend/src/components/PayoutsTable.tsx
git add frontend/src/components/Notifications.tsx
git add frontend/src/pages/DistributionPage.tsx
git add frontend/src/components/charts/HistoricalRewardChart.tsx
git add frontend/src/components/HoldersValueChart.tsx
git add COMPREHENSIVE_DASHBOARD_CRASH_FIX.md

echo ""
echo "📝 Committing changes..."
git commit -m "Comprehensive dashboard crash fix - add null safety for all toFixed calls

Fix white screen crash caused by calling .toFixed() on null/undefined values:
- Add fallback values (|| 0) before all .toFixed() calls
- Fix sort functions to handle null values
- Fix chart formatters to handle null values
- Ensure all numeric operations have null safety

Changes:
- RewardSummary.tsx: Fix tokenPrice.sol access with fallback
- PayoutsTable.tsx: Fix rewardSOL access and sort function
- Notifications.tsx: Fix totalSOL access with fallback
- DistributionPage.tsx: Fix totalSOL calculation and access
- HistoricalRewardChart.tsx: Fix formatter values
- HoldersValueChart.tsx: Fix formatter values

Pattern applied:
All .toFixed() calls now use: (value || 0).toFixed(n)

Fixes:
- Dashboard no longer crashes with white screen
- All components handle null/undefined values safely
- Charts render correctly even with missing data
- No more 'Cannot read properties of null' errors
- Works during initial load when data isn't available

Error fixed:
Uncaught TypeError: Cannot read properties of null (reading 'toFixed')"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

