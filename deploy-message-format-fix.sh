#!/bin/bash

echo "=== Deploying Telegram Message Format Fix ==="
echo ""

cd /home/van/reward-project

echo "Step 1: Building telegram bot..."
cd telegram-bot
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

echo "✅ Build successful"
echo ""

cd ..

echo "Step 2: Committing changes..."
git add telegram-bot/src/index.ts
git add TELEGRAM_MESSAGE_FORMAT_FIX.md
git add deploy-message-format-fix.sh

git commit -m "fix: telegram message formatting - bold titles and correct epoch/cycle

- Fetch cycle info from /dashboard/cycles/current API
- Display epoch number (e.g., 1) instead of timestamp
- Display cycle as 'X / 288' format
- Made titles bold using Telegram markdown (*text*)
- Added parse_mode: 'Markdown' to sendMessage calls
- Renamed timestamp field to 'Time' for clarity
- Updated /rewards command with same formatting

Message format:
💰 *NUKE Rewards Distributed*

*Total:* 0.603291 SOL
*Holders:* 0.452375 SOL
*Treasury:* 0.150916 SOL
*Epoch:* 1
*Cycle:* 141 / 288
*Time:* 2026-01-09 11:39:14

Improves message readability and shows correct cycle information."

if [ $? -ne 0 ]; then
  echo "⚠️  Commit failed (may already be committed)"
fi

echo ""
echo "Step 3: Pushing to GitHub..."
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Successfully pushed to GitHub!"
  echo ""
  echo "Railway will auto-deploy in ~2 minutes"
  echo ""
  echo "Expected message format:"
  echo "💰 NUKE Rewards Distributed (bold)"
  echo ""
  echo "Total: 0.603291 SOL (bold title, normal value)"
  echo "Holders: 0.452375 SOL"
  echo "Treasury: 0.150916 SOL"
  echo "Epoch: 1"
  echo "Cycle: 141 / 288"
  echo "Time: 2026-01-09 11:39:14"
else
  echo "❌ Push failed"
  exit 1
fi
