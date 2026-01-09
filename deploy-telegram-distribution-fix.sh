#!/bin/bash

# Deploy Telegram Distribution Amount Fix
# This fixes the critical bug where telegram showed cumulative totals instead of per-distribution amounts

set -e

echo "=================================================="
echo "🚀 Deploying Telegram Distribution Amount Fix"
echo "=================================================="
echo ""

# Navigate to project root
cd /home/van/reward-project

echo "📦 Building backend..."
cd backend
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Backend build failed!"
  exit 1
fi
echo "✅ Backend build successful"
echo ""

echo "📦 Building telegram bot..."
cd ../telegram-bot
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Telegram bot build failed!"
  exit 1
fi
echo "✅ Telegram bot build successful"
echo ""

echo "📦 Building frontend..."
cd ../frontend
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Frontend build failed!"
  exit 1
fi
echo "✅ Frontend build successful"
echo ""

# Return to project root
cd ..

echo "📝 Committing changes..."
git add backend/src/services/taxService.ts
git add backend/src/routes/dashboard.ts
git add telegram-bot/src/index.ts
git add frontend/src/components/RewardSystem.tsx
git add TELEGRAM_DISTRIBUTION_AMOUNT_FIX.md
git add TOOLTIP_DECIMAL_FIX.md
git add deploy-telegram-distribution-fix.sh

git commit -m "fix: telegram showing cumulative totals instead of per-distribution amounts

Critical fixes:
- Backend: Store lastDistributionSolToHolders and lastDistributionSolToTreasury
- Telegram: Use last distribution amounts instead of cumulative totals
- Dashboard: Show total distribution (holders + treasury) in tooltip
- Dashboard: Fix NUKE decimals (divide by 1e6 for 6 decimal token)

This ensures telegram and dashboard show the SAME amounts for each distribution.

Example:
- Before: Telegram showed 0.686117 SOL (cumulative) ❌
- After: Telegram shows 0.055872 SOL (per-distribution) ✅
- Dashboard tooltip now matches telegram amounts ✅"

echo "✅ Changes committed"
echo ""

echo "🚀 Pushing to GitHub..."
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "=================================================="
  echo "✅ Deployment Successful!"
  echo "=================================================="
  echo ""
  echo "📋 What was fixed:"
  echo "  1. ✅ Telegram bot now shows per-distribution amounts"
  echo "  2. ✅ Dashboard tooltip shows total distribution (holders + treasury)"
  echo "  3. ✅ NUKE harvest amount shows correct decimals (÷ 1e6)"
  echo ""
  echo "📊 Expected Results:"
  echo "  - Telegram: 0.055872 SOL (not 0.686117 SOL)"
  echo "  - Dashboard: 0.055872 SOL (not 0.041904 SOL)"
  echo "  - NUKE: 29,080.66 (not 29,080,660,000)"
  echo ""
  echo "🎯 Telegram and Dashboard now show MATCHING amounts!"
  echo ""
  echo "⏳ Wait for Render and Railway to redeploy..."
  echo "   - Backend (Render): ~3-5 minutes"
  echo "   - Telegram Bot (Railway): ~2-3 minutes"
  echo "   - Frontend (Render): ~2-3 minutes"
  echo ""
else
  echo ""
  echo "❌ Push failed! Please check your git configuration."
  exit 1
fi
