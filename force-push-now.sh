#!/bin/bash

echo "=== Force Push Epoch Fix ==="
echo ""

cd /home/van/reward-project

echo "Step 1: Check git diff..."
git diff backend/src/routes/dashboard.ts
git diff telegram-bot/src/index.ts

echo ""
echo "Step 2: Force add files..."
git add -f backend/src/routes/dashboard.ts
git add -f telegram-bot/src/index.ts
git add -f EPOCH_NUMBER_FIX.md
git add -f TELEGRAM_MESSAGE_FORMAT_FIX.md
git add -f PUSH_EPOCH_FIX_NOW.md

echo ""
echo "Step 3: Check status..."
git status

echo ""
echo "Step 4: Commit..."
git commit -m "fix: telegram shows epoch number instead of date

Backend:
- Added epochNumber to /dashboard/cycles/current API
- Calculates sequential epoch number from state

Telegram Bot:
- Use epochNumber for display (shows 1, 2, 3...)
- Shows cycle info correctly (141 / 288)
- Bold formatting with Telegram markdown

Message format:
💰 *NUKE Rewards Distributed*
*Epoch:* 1 (not date!)
*Cycle:* 141 / 288
*Time:* 2026-01-09 11:39:14"

echo ""
echo "Step 5: Push..."
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Pushed successfully!"
  echo ""
  echo "Wait 2-3 minutes for deployment:"
  echo "  - Render (backend)"
  echo "  - Railway (telegram bot)"
else
  echo "❌ Push failed or already up to date"
fi
