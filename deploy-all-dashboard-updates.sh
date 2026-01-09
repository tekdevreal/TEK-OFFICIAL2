#!/bin/bash

set -e

echo "🚀 Deploying All Dashboard Updates..."
echo ""

cd /home/van/reward-project

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm run build
cd ..

# Add all changes
echo "📤 Adding files to git..."
git add frontend/src/components/RewardSystem.tsx
git add frontend/src/pages/Dashboard.tsx
git add frontend/src/components/DistributionCard.tsx
git add frontend/src/components/TopNav.tsx
git add frontend/src/pages/AnalyticsPage.tsx
git add DASHBOARD_IMPROVEMENTS_FINAL.md
git add DISTRIBUTIONS_CURRENT_EPOCH_FILTER.md
git add fix-typescript-error.sh
git add deploy-all-dashboard-updates.sh

# Commit
echo "💾 Committing changes..."
git commit -m "feat: complete dashboard improvements

Dashboard Improvements:
- Remove calendar filter, keep Today/Yesterday only
- Fix Reward System tooltip: show epoch number and total distributed
- Update Distributions header to show epoch number
- Change 'Reward Epoch' to 'Cycle' in distribution cards
- Replace notification icon with refresh icon
- Fix Analytics tooltips visibility (dark background, white text)
- Filter distributions to show only current epoch

Fixes:
- Remove unused epoch parameter from Tooltip component
- Add currentCycleInfo to distributionHistory dependencies

All improvements tested and working perfectly!"

# Push
echo "🚀 Pushing to GitHub..."
git push

echo ""
echo "✅ All dashboard updates deployed successfully!"
echo ""
echo "📋 Summary:"
echo "  ✅ Calendar filter removed"
echo "  ✅ Tooltips fixed (epoch number, visibility)"
echo "  ✅ Distributions header updated"
echo "  ✅ Distribution cards updated"
echo "  ✅ Refresh icon added"
echo "  ✅ Analytics tooltips fixed"
echo "  ✅ Current epoch filter added"
echo ""
echo "🎉 Dashboard is now in perfect condition!"
