#!/bin/bash

echo "=== Deploying Epoch, Telegram, and Distribution Page Fixes ==="
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

echo "Step 2: Building telegram bot..."
cd telegram-bot
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Telegram bot build failed"
  exit 1
fi

echo "✅ Telegram bot build successful"
echo ""

cd ..

echo "Step 3: Committing changes..."
git add frontend/src/pages/Dashboard.tsx
git add frontend/src/pages/DistributionPage.tsx
git add frontend/src/components/RewardSystem.tsx
git add frontend/src/types/api.ts
git add frontend/src/services/api.ts
git add telegram-bot/src/index.ts
git add EPOCH_TELEGRAM_DISTRIBUTION_FIXES.md
git add deploy-epoch-telegram-fixes.sh

git commit -m "fix: epoch calculation, telegram time format, and distribution page label

- Use epochNumber from API for correct epoch counting on dashboard
- Show epoch count in both Processing section and Distributions header
- Fix Reward System tooltip to use epochNumber from API instead of calculation
- Format telegram times in CET timezone without seconds
- Change 'Total NUKE Sold' to 'Total SOL Distributed' on distribution page
- Update stat to show actual SOL distributed instead of estimated NUKE
- Add epochNumber to CurrentCycleInfo type definition

Fixes:
1. Epoch now correctly counts (1, 2, 3...) instead of miscalculating from dates
2. Reward System tooltips show correct epoch number from API
3. Telegram messages show time like '01/10/2026, 08:17 CET'
4. Distribution page correctly labels and calculates total SOL distributed
5. TypeScript types updated to include epochNumber field"

if [ $? -ne 0 ]; then
  echo "⚠️  Commit failed (may already be committed)"
fi

echo ""
echo "Step 4: Pushing to GitHub..."
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Successfully pushed to GitHub!"
  echo ""
  echo "Railway/Render will auto-deploy in ~2 minutes"
  echo ""
  echo "Expected results:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "1. Dashboard Processing Section:"
  echo "   Epoch: 2 (or current epoch number)"
  echo ""
  echo "2. Distributions Section Header:"
  echo "   Distributions Epoch: 2"
  echo ""
  echo "3. Telegram Bot Messages:"
  echo "   Time: 01/10/2026, 08:17 CET"
  echo "   (No seconds, includes CET timezone)"
  echo ""
  echo "4. Distribution Page:"
  echo "   Label: 'Total SOL Distributed'"
  echo "   Shows actual SOL distributed in filtered period"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "❌ Push failed"
  exit 1
fi
