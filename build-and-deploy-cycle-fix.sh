#!/bin/bash

set -e

echo "🔧 Building Cycle Number Fix..."
echo ""

# Build backend
echo "📦 Building backend..."
cd backend
npm run build
cd ..

# Build telegram bot
echo "📦 Building telegram bot..."
cd telegram-bot
npm run build
cd ..

echo ""
echo "✅ Build complete!"
echo ""
echo "📤 Committing and pushing to GitHub..."

# Add files
git add backend/src/services/taxService.ts
git add backend/src/scheduler/rewardScheduler.ts
git add backend/src/routes/dashboard.ts
git add telegram-bot/src/index.ts
git add CYCLE_NUMBER_FIX.md
git add CYCLE_MISMATCH_ANALYSIS.md

# Commit
git commit -m "fix: telegram bot now reports correct cycle number for distributions

- Store cycle number and epoch when distribution occurs
- Telegram uses stored cycle number instead of current cycle
- Fixes mismatch where telegram reported wrong cycle due to polling delay
- Example: Cycle 174 distributed, telegram now correctly shows 174 (not 175)

Resolves cycle number mismatch between dashboard and telegram notifications"

# Push
git push

echo ""
echo "✅ Deployed to GitHub!"
echo ""
echo "🚀 Render and Railway will auto-deploy the changes."
echo ""
echo "📋 Next Steps:"
echo "1. Wait for Render backend to redeploy (~2-3 minutes)"
echo "2. Wait for Railway telegram bot to redeploy (~1-2 minutes)"
echo "3. Wait for next distribution to test"
echo "4. Verify telegram notification shows correct cycle number"
echo ""
echo "✨ Fix complete!"
