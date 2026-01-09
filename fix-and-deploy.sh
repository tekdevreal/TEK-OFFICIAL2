#!/bin/bash

set -e

echo "🔧 Building and deploying cycle number fix..."
echo ""

# Navigate to project root
cd /home/van/reward-project

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
echo "✅ Build successful!"
echo ""

# Add all changes
echo "📤 Adding files to git..."
git add backend/src/services/taxService.ts
git add backend/src/scheduler/rewardScheduler.ts
git add backend/src/routes/dashboard.ts
git add telegram-bot/src/index.ts
git add CYCLE_NUMBER_FIX.md
git add CYCLE_MISMATCH_ANALYSIS.md
git add build-and-deploy-cycle-fix.sh
git add DEPLOY_CYCLE_FIX_NOW.md
git add fix-and-deploy.sh

# Commit
echo "💾 Committing changes..."
git commit -m "fix: telegram bot now reports correct cycle number for distributions

- Store cycle number and epoch when distribution occurs
- Telegram uses stored cycle number instead of current cycle
- Fixes mismatch where telegram reported wrong cycle due to polling delay
- Example: Cycle 174 distributed, telegram now correctly shows 174 (not 175)

Resolves cycle number mismatch between dashboard and telegram notifications"

# Push
echo "🚀 Pushing to GitHub..."
git push

echo ""
echo "✅ Deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Wait for Render backend to redeploy (~2-3 minutes)"
echo "2. Wait for Railway telegram bot to redeploy (~1-2 minutes)"
echo "3. Wait for next distribution to test"
echo "4. Verify telegram shows correct cycle number"
echo ""
echo "✨ Done!"
