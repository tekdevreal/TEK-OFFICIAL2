#!/bin/bash

# Responsive Design & Mobile Menu Deployment Script
# Run this script to build frontend and push all changes to GitHub

set -e

echo "========================================="
echo "  NUKE Dashboard - Responsive Updates"
echo "========================================="
echo ""

# Change to project directory
cd /home/van/reward-project

# Build frontend
echo "🔨 Building frontend..."
cd frontend
npm run build
echo "✅ Frontend build complete"
cd ..

# Git operations
echo ""
echo "📝 Preparing Git commit..."

# Add all modified and new files
git add frontend/src/index.css
git add frontend/src/responsive.css
git add frontend/src/components/TopNav.tsx
git add frontend/src/components/TopNav.css
git add frontend/src/pages/Dashboard.css
git add frontend/src/pages/HarvestingPage.css
git add frontend/src/pages/DistributionPage.css
git add frontend/src/pages/DocumentationPage.tsx
git add frontend/src/pages/DocumentationPage-responsive.css
git add frontend/src/components/Table.css

# Add documentation files
git add RESPONSIVE_DESIGN_IMPLEMENTATION.md
git add RESPONSIVE_VISUAL_GUIDE.md
git add MOBILE_MENU_IMPLEMENTATION_COMPLETE.md
git add MOBILE_BURGER_MENU_STATUS.md

# Add build output
git add frontend/dist/

echo "✅ Files staged for commit"

# Commit changes
echo ""
echo "💾 Committing changes..."
git commit -m "feat: Add comprehensive responsive design and mobile burger menu

- Implemented mobile-first responsive design system (responsive.css)
- Created professional mobile/tablet burger menu navigation
- Added responsive breakpoints: Mobile (<640px), Tablet (640-1024px), Desktop (>1024px)
- Enhanced all dashboard pages for mobile/tablet devices
- Updated Documentation page with responsive styles
- All tables now scrollable/swipeable on mobile
- Touch-optimized interactions (44px touch targets)
- Animated burger menu with slide-out panel
- Auto-close menu on route change and ESC key
- Body scroll lock when menu open
- Theme-aware styling for light/dark modes
- Zero breaking changes to existing functionality

Pages Updated:
- Main Dashboard
- Harvesting Data
- Distribution Data
- Documentation
- All table components

New Files:
- responsive.css (933 lines)
- TopNav mobile burger menu
- DocumentationPage-responsive.css
- Documentation files

Technical Improvements:
- CSS-only responsive solutions
- GPU-accelerated animations
- Smooth touch scrolling
- Safe area support for notched devices
- Utility classes for responsive visibility"

echo "✅ Changes committed"

# Push to GitHub
echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "========================================="
echo "  ✅ Deployment Complete!"
echo "========================================="
echo ""
echo "Changes pushed to GitHub successfully!"
echo ""
echo "Summary:"
echo "- ✅ Frontend built"
echo "- ✅ Responsive design implemented"
echo "- ✅ Mobile burger menu added"
echo "- ✅ All changes committed"
echo "- ✅ Pushed to GitHub"
echo ""
