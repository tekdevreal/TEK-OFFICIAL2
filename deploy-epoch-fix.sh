#!/bin/bash

echo "=== Deploying Epoch Number Fix ==="
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

echo "Step 3: Committing and pushing..."
git add backend/src/routes/dashboard.ts
git add backend/dist/
git add telegram-bot/src/index.ts
git add telegram-bot/dist/
git add EPOCH_NUMBER_FIX.md
git add deploy-epoch-fix.sh

git status

git commit -m "fix: show epoch number instead of date in telegram messages

Backend Changes:
- Added epochNumber field to /dashboard/cycles/current API
- Calculate epochNumber by counting all epochs in state
- Returns both epoch (date) and epochNumber (sequential number)

Telegram Bot Changes:
- Updated to use epochNumber for display
- Epoch now shows as 1, 2, 3... instead of date string
- Updated both notification and /rewards command

Message format:
💰 *NUKE Rewards Distributed*
*Epoch:* 1 (not date!)
*Cycle:* 141 / 288
*Time:* 2026-01-09 11:39:14

Both Render (backend) and Railway (telegram bot) will auto-deploy."

if [ $? -ne 0 ]; then
  echo "⚠️  Commit may have failed or already committed"
fi

echo ""
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Successfully pushed to GitHub!"
  echo ""
  echo "Deployment status:"
  echo "  - Render (backend): deploying... (~2 min)"
  echo "  - Railway (telegram bot): deploying... (~2 min)"
  echo ""
  echo "Next distribution should show:"
  echo "  Epoch: 1 (number, not date!)"
  echo "  Cycle: 141 / 288"
  echo "  Time: 2026-01-09 11:39:14"
else
  echo "❌ Push failed"
  exit 1
fi
