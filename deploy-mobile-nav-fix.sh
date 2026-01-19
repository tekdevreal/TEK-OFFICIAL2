#!/bin/bash

set -e

echo "======================================"
echo "Deploying Mobile Responsive Updates"
echo "======================================"

# Navigate to project root
cd /home/van/reward-project

# Add ALL modified files
echo "Adding modified files..."
git add frontend/src/components/SecondaryNav.tsx
git add frontend/src/components/SecondaryNav.css
git add frontend/src/components/TopNav.css
git add frontend/src/components/TopNav.tsx
git add frontend/src/components/Tabs.css
git add frontend/src/App.tsx
git add frontend/src/responsive.css
git add frontend/src/pages/AnalyticsPage.css
git add frontend/src/pages/SystemStatusPage.css
git add frontend/src/pages/DocumentationPage.css
git add frontend/src/pages/DocumentationPage-responsive.css
git add frontend/src/pages/DistributionPage.css
git add frontend/src/pages/HarvestingPage.css
git add frontend/src/pages/LiquidityPoolsPage.css
git add frontend/src/pages/HoldersPage.css
git add frontend/src/pages/Dashboard.css

# Build frontend
echo "Building frontend..."
cd frontend
npm run build

# Return to root
cd ..

# Commit changes
echo "Committing changes..."
git commit -m "Fix: Complete responsive overhaul - Perfect mobile/tablet experience

🎯 DESKTOP (>768px) - UNCHANGED:
✅ TopNav + SecondaryNav both visible  
✅ All 8 menu items in SecondaryNav
✅ Normal spacing (10rem top padding)
✅ Standard max-width containers

📱 MOBILE/TABLET (≤768px) - COMPLETELY FIXED:
✅ Minimal spacing below TopNav (4.75rem / 4.5rem)
✅ All pages use FULL WIDTH (100%)
✅ Burger menu with all 8 navigation items
✅ SecondaryNav hidden on mobile

🔧 CRITICAL FIXES:
1. SPACING - Removed huge gap below TopNav on ALL pages
   - Desktop: 10rem (TopNav 5rem + SecondaryNav 4rem)
   - Tablet (≤768px): 4.75rem (TopNav 4rem + 0.75rem)
   - Mobile (≤480px): 4.5rem (TopNav 3.75rem + 0.75rem)

2. CONTAINERS - All pages now full width on mobile
   - Dashboard, Harvesting, Distribution, Liquidity Pools
   - Treasury (Holders), System Status, Analytics, Documentation
   - No more squeezed small containers!

3. ANALYTICS CHARTS - Fixed squeezed diagrams
   - Charts properly responsive with 100% width
   - No more compression on mobile
   - Grids: 2 columns tablet, 1 column mobile

4. DOCUMENTATION - Perfect spacing and scrollable tabs
   - Top padding fixed (was using 10rem, now 4.75rem)
   - Tabs horizontally scrollable on mobile
   - Full width content

📊 RESPONSIVE IMPROVEMENTS:
- Stats grids: 4→2→1 columns (desktop→tablet→mobile)
- Charts: Full width, proper min-height
- Tables: Horizontal scroll with touch optimization
- Buttons: Proper tap targets (44px minimum)
- Typography: Scaled for readability

✨ All pages now have perfect spacing and layout on mobile/tablet!"

# Push to GitHub
echo "Pushing to GitHub..."
git push origin main

echo "======================================"
echo "✅ Deployment Complete!"
echo "======================================"
echo ""
echo "🌐 Changes pushed to GitHub"
echo "📱 Clear your browser cache to see updates:"
echo "   - Chrome/Edge: Ctrl+Shift+Delete"
echo "   - Or hard refresh: Ctrl+F5"
echo "======================================"