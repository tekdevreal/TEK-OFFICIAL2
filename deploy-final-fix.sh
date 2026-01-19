#!/bin/bash

echo "=========================================="
echo "FINAL DASHBOARD FIX - BUILD AND DEPLOY"
echo "=========================================="
echo ""

cd /home/van/reward-project

echo "📝 Adding files..."
git add frontend/src/pages/Dashboard.tsx
git add frontend/src/components/DistributionCard.tsx
git add frontend/src/components/RewardSystem.tsx
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
    git commit -m "Fix: Use actual harvested NUKE data for both RewardSystem & Dashboard cards

DASHBOARD DISTRIBUTION CARDS:
✅ Now uses actual harvested NUKE from epoch data (not estimates)
✅ Matches RewardSystem tooltip data exactly
✅ Fetches epoch data to get cycle.taxResult.nukeHarvested
✅ Maps cycle numbers to actual NUKE values
✅ No more proportional calculations

REWARD SYSTEM TOOLTIP:
✅ Shows total distributed (holders + treasury)
✅ Converted to SOL properly (/1e9)
✅ Matches dashboard cards

CYCLE NUMBERS:
✅ Shows actual cycle 1-288 (no leading zeros)
✅ Displays as '195' instead of '0195'
✅ Calculated from timestamp correctly

DATA CONSISTENCY:
Both Dashboard cards and RewardSystem tooltip now show:
- Same harvested NUKE (actual from taxResult)
- Same distributed SOL (from API)
- Same cycle numbers (1-288)

ALSO INCLUDED:
✅ Analytics charts fixed (all devices)
✅ Mobile improvements
✅ Filter layouts optimized
✅ Clean responsive design"
    
    git push origin main
    
    echo ""
    echo "=========================================="
    echo "✅ DEPLOYMENT COMPLETE!"
    echo "=========================================="
    echo ""
    echo "🔄 IMPORTANT: Clear your browser cache!"
    echo "   Press: Ctrl + Shift + R (or Cmd + Shift + R on Mac)"
    echo ""
    echo "Then you'll see:"
    echo "  ✓ Dashboard cards show ACTUAL harvested NUKE"
    echo "  ✓ RewardSystem tooltip shows same data"
    echo "  ✓ Cycle numbers: 195 (no leading zeros)"
    echo "  ✓ All data consistent between views"
    echo ""
else
    echo ""
    echo "❌ Build failed! Check errors above."
    echo ""
    exit 1
fi
