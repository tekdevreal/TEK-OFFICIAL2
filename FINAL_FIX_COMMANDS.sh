#!/bin/bash

echo "=== FINAL FIX: Kill Local Bot + Rebuild + Deploy ==="
echo ""

# Kill local bot
echo "Step 1: Killing local bot (PID 14630)..."
kill 14630 2>/dev/null
sleep 2

# Verify it's killed
if ps aux | grep "node dist/index.js" | grep -v grep > /dev/null; then
  echo "❌ Bot still running. Trying force kill..."
  pkill -9 -f "node dist/index.js"
  sleep 2
fi

if ps aux | grep "node dist/index.js" | grep -v grep > /dev/null; then
  echo "❌ Failed to kill bot. Please run: pkill -9 -f 'node dist/index.js'"
  exit 1
else
  echo "✅ Local bot stopped"
fi

# Rebuild
echo ""
echo "Step 2: Rebuilding telegram bot..."
cd /home/van/reward-project/telegram-bot
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

echo "✅ Build successful"

# Commit source files (dist is in .gitignore)
echo ""
echo "Step 3: Committing source files..."
cd /home/van/reward-project
git add telegram-bot/src/index.ts
git add telegram-bot/src/state/notificationState.ts
git add FINAL_BATCH_FIX.md
git add BUILD_AND_REDEPLOY.md

git commit -m "fix: final typescript errors in telegram bot distribution hash

- Fixed return type to include distributionHash
- Fixed null vs undefined type mismatch
- Ready for Railway deployment

This completes the fix for duplicate telegram notifications."

git push

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Successfully pushed to GitHub!"
  echo ""
  echo "🚀 Railway will auto-deploy in ~2 minutes"
  echo ""
  echo "Expected behavior after deployment:"
  echo "  - Railway logs: 'distributionHash: abc123...'"
  echo "  - You receive ONLY 2 messages (1 group + 1 private)"
  echo "  - No more duplicates!"
  echo ""
  echo "Monitor Railway logs at:"
  echo "  https://railway.app/dashboard"
else
  echo "❌ Push failed"
  exit 1
fi
