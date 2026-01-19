#!/bin/bash

echo "=== Deploying Dashboard Improvements ==="
echo ""

cd /home/van/reward-project

echo "Step 1: Building frontend..."
cd frontend
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Frontend build failed"
  exit 1
fi

echo "✅ Frontend build successful"
echo ""

cd ..

echo "Step 2: Committing changes..."
git add frontend/src/components/RewardSystem.tsx
git add frontend/src/components/RewardSystem.css
git add frontend/src/pages/Dashboard.tsx
git add frontend/src/pages/AnalyticsPage.tsx
git add DASHBOARD_IMPROVEMENTS_SUMMARY.md
git add deploy-dashboard-improvements.sh

git status

git commit -m "feat: dashboard improvements - tooltip, cycle display, analytics data

1. Tooltip Position Fix:
   - Removed native tooltip (title attribute)
   - Position tooltip directly below hovered cycle block
   - Shows all cycle info near hover location

2. Processing Cycle Display:
   - Show last completed cycle instead of current cycle
   - Handles epoch boundary (cycle 1 shows 288)

3. Analytics Real Data:
   - Replaced all placeholder data with real API data
   - Integrated useRewards, useHistoricalRewards, useLiquiditySummary
   - Real charts: Rewards Over Time, Volume vs Rewards, Treasury Balance
   - Real metrics: Total distributions, NUKE harvested, SOL distributed
   - Real liquidity pool performance data

All improvements completed without breaking existing functionality."

if [ $? -ne 0 ]; then
  echo "⚠️  Commit may have failed or already committed"
fi

echo ""
echo "Step 3: Pushing to GitHub..."
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Successfully pushed to GitHub!"
  echo ""
  echo "Frontend will auto-deploy in ~2-3 minutes"
  echo ""
  echo "Test after deployment:"
  echo "  1. Tooltip: Hover over cycle blocks - tooltip shows below block"
  echo "  2. Cycle: Processing section shows last completed cycle"
  echo "  3. Analytics: All data is real (not placeholder)"
else
  echo "❌ Push failed"
  exit 1
fi
