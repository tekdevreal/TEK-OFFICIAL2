#!/bin/bash

# Script to commit and push dashboard white screen and price fixes

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add frontend/src/components/RewardTrendsChart.tsx
git add frontend/src/components/PayoutStatusChart.tsx
git add frontend/src/components/HolderDistributionChart.tsx
git add frontend/src/components/HoldersValueChart.tsx
git add backend/src/services/priceService.ts
git add backend/src/routes/dashboard.ts
git add DASHBOARD_AND_PRICE_FIX.md

echo ""
echo "📝 Committing changes..."
git commit -m "Fix dashboard white screen and improve Raydium price error handling

Frontend Fixes:
- Add null safety checks to all chart components
- Add optional chaining for nested properties (statistics, summary)
- Add fallback values to prevent toFixed() on null errors
- Fix RewardTrendsChart, PayoutStatusChart, HolderDistributionChart
- Fix HoldersValueChart to handle null usdValue

Backend Fixes:
- Enhanced error logging in priceService.ts
- Changed warnings to errors for critical issues
- Added detailed diagnostic information
- Better error messages for missing RAYDIUM_POOL_ID
- Log all vault balances and amounts for debugging

Changes:
- RewardTrendsChart.tsx: Added null checks and optional chaining
- PayoutStatusChart.tsx: Added optional chaining for summary.totalSOL
- HolderDistributionChart.tsx: Added null checks for statistics
- HoldersValueChart.tsx: Added null check for usdValue
- priceService.ts: Enhanced error logging and diagnostics
- dashboard.ts: Added price diagnostics to diagnostics endpoint

Fixes:
- Dashboard no longer shows white screen
- All charts render safely with null data
- Better error messages for price fetch failures
- Diagnostic endpoint shows price fetch status"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

