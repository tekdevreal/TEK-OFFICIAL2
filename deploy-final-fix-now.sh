#!/bin/bash

echo "=== Deploying Final Telegram Bot Fix ==="
echo ""

cd "$(dirname "$0")"

echo "Building telegram bot..."
cd telegram-bot
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed - check for TypeScript errors"
  exit 1
fi

echo "✅ Build successful"
echo ""

cd ..

echo "Committing changes..."
git add telegram-bot/src/index.ts
git add telegram-bot/src/state/notificationState.ts
git add telegram-bot/dist/
git add BATCH_SPLITTING_FIX.md
git add FINAL_BATCH_FIX.md

git commit -m "fix: final telegram duplicate fix - use distribution hash

- Track distribution data hash instead of just timestamp
- Prevents duplicate notifications when backend runs multiple cycles
- Works correctly with batch splitting (4 swaps = 1 notification)
- Hash based on: totalSolDistributed + totalSolToTreasury + distributionCount
- Persisted to disk to survive bot restarts

This is the final fix for duplicate telegram notifications!"

if [ $? -ne 0 ]; then
  echo "⚠️  Commit failed (may already be committed)"
fi

echo ""
echo "Pushing to GitHub..."
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Successfully pushed to GitHub!"
  echo ""
  echo "Railway will auto-deploy in ~2 minutes"
  echo ""
  echo "Expected Railway logs after deployment:"
  echo "  [Bot] Loaded last known distribution time from state: ..."
  echo "  [AutoRewards] New distribution detected"
  echo "  distributionHash: 'abc123...'"
  echo ""
  echo "You should receive exactly 2 messages (1 per chat), no duplicates!"
else
  echo "❌ Push failed"
  exit 1
fi
