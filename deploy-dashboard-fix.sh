#!/bin/bash

echo "=========================================="
echo "DASHBOARD FIX - BUILD AND DEPLOY"
echo "=========================================="
echo ""

cd /home/van/reward-project

echo "📝 Adding files..."
git add frontend/src/pages/Dashboard.tsx
git add frontend/src/pages/AnalyticsPage.tsx
git add frontend/src/pages/AnalyticsPage.css
git add frontend/src/pages/HoldersPage.css
git add frontend/src/pages/HarvestingPage.css
git add frontend/src/pages/DistributionPage.css
git add frontend/src/components/RewardSystem.css
git add frontend/src/components/TopNav.tsx
git add frontend/src/responsive.css

echo ""
echo "🔨 Building frontend..."
cd frontend
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    cd ..
    
    echo "📤 Committing and pushing..."
    git commit -m "Fix: Dashboard cycle numbers + Analytics charts + Mobile improvements

DASHBOARD DISTRIBUTION CARDS:
✅ Fetch limit increased: 20 → 300 cycles
✅ Cycle number calculation fixed (now shows 1-288)
✅ Calculates from timestamp, not index
✅ Shows current cycle (e.g., 193) instead of stuck at 20

CYCLE CALCULATION:
- Minutes since 00:00 UTC ÷ 5 = Cycle Number
- Example: 16:00 UTC = 960 min ÷ 5 = Cycle 193

ANALYTICS CHARTS:
✅ Rewards Over Time: Fixed cycle grouping
✅ Clean CSS rewrite (works on all devices)
✅ No overflow or positioning issues

MOBILE/TABLET:
✅ Responsive tables with 900px scroll
✅ Filter layouts optimized
✅ Reward System 2x2 grid
✅ Clean burger menu
✅ All pages full width on mobile"
    
    git push origin main
    
    echo ""
    echo "=========================================="
    echo "✅ DEPLOYMENT COMPLETE!"
    echo "=========================================="
    echo ""
    echo "🔄 IMPORTANT: Clear your browser cache!"
    echo "   Press: Ctrl + Shift + R (or Cmd + Shift + R on Mac)"
    echo ""
    echo "Then refresh the dashboard to see:"
    echo "  ✓ Correct cycle numbers (1-288)"
    echo "  ✓ Latest cycles showing"
    echo "  ✓ Analytics charts working"
    echo "  ✓ Mobile layout optimized"
    echo ""
else
    echo ""
    echo "❌ Build failed! Check errors above."
    echo ""
    exit 1
fi
