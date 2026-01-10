#!/bin/bash

echo "=== Deploying Harvesting & Distribution Stats Updates + Epoch Fixes ==="
echo ""

cd /home/van/reward-project

echo "Step 1: Building backend..."
cd backend
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Backend build failed"
  exit 1
fi

echo "✅ Backend build successful"
echo ""

cd ..

echo "Step 2: Building frontend..."
cd frontend
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Frontend build failed"
  exit 1
fi

echo "✅ Frontend build successful"
echo ""

cd ..

echo "Step 3: Building telegram bot..."
cd telegram-bot
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Telegram bot build failed"
  exit 1
fi

echo "✅ Telegram bot build successful"
echo ""

cd ..

echo "Step 4: Committing changes..."
git add backend/src/services/raydiumService.ts
git add backend/src/routes/dashboard.ts
git add frontend/src/types/api.ts
git add frontend/src/services/api.ts
git add frontend/src/hooks/useApiData.ts
git add frontend/src/pages/HarvestingPage.tsx
git add frontend/src/pages/DistributionPage.tsx
git add frontend/src/pages/Dashboard.tsx
git add frontend/src/pages/DistributionPage.tsx
git add frontend/src/components/RewardSystem.tsx
git add telegram-bot/src/index.ts
git add EPOCH_TELEGRAM_DISTRIBUTION_FIXES.md
git add EPOCH_PERSISTENCE_EXPLAINED.md
git add HARVESTING_DISTRIBUTION_STATS_UPDATE.md
git add deploy-all-updates.sh

git commit -m "feat: update harvesting/distribution stats + fix epoch calculation

Harvesting Page Updates:
- Replace 'Next Harvesting' with 'Allocated SOL'
- Replace 'Last Harvesting' with 'Allocated USD' (SOL × price)
- Replace 'Estimated SOL' with 'Last Harvesting' (time only)

Distribution Page Updates:
- Replace 'Next Distribution' with 'Distribution USD Value' (SOL × price)
- Replace 'Last Distribution' with 'Next Distribution: 5 Minutes'
- Replace 'Estimated SOL' with 'Last Distribution' (time only)

Epoch Fixes:
- Use epochNumber from API for correct epoch counting on dashboard
- Fix Reward System tooltip to use epochNumber from API
- Format telegram times in CET timezone without seconds
- Change 'Total NUKE Sold' to 'Total SOL Distributed' on distribution page

Backend:
- Export getSOLPriceUSD function from raydiumService
- Add GET /dashboard/sol-price endpoint
- Fetches SOL/USD price from Jupiter API (mainnet reference)

Frontend:
- Add SolPriceResponse type and fetchSolPrice function
- Add useSolPrice hook for real-time SOL price
- Update Harvesting & Distribution pages with new stat calculations
- Time displays show HH:MM format only"

if [ $? -ne 0 ]; then
  echo "⚠️  Commit failed (may already be committed)"
fi

echo ""
echo "Step 5: Pushing to GitHub..."
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
  echo "📊 Harvesting Page:"
  echo "   1. Total NUKE Harvested: (unchanged)"
  echo "   2. Allocated SOL: X.XXXXXX SOL"
  echo "   3. Allocated USD: \$X,XXX.XX"
  echo "   4. Last Harvesting: HH:MM"
  echo ""
  echo "📊 Distribution Page:"
  echo "   1. Total SOL Distributed: (unchanged)"
  echo "   2. Distribution USD Value: \$X,XXX.XX"
  echo "   3. Next Distribution: 5 Minutes"
  echo "   4. Last Distribution: HH:MM"
  echo ""
  echo "🔢 Dashboard Epoch:"
  echo "   - Processing section shows correct epoch number"
  echo "   - Distributions header shows same epoch number"
  echo "   - Reward System tooltips show correct epoch"
  echo ""
  echo "💬 Telegram Messages:"
  echo "   - Time format: MM/DD/YYYY, HH:MM CET (no seconds)"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "❌ Push failed"
  exit 1
fi
