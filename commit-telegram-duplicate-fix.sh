#!/bin/bash

echo "=== Committing Telegram Duplicate Notification Fix ==="
echo ""

# Navigate to project root
cd "$(dirname "$0")"

# Add the modified files
git add telegram-bot/src/state/notificationState.ts
git add telegram-bot/src/index.ts
git add backend/src/services/taxService.ts
git add FIX_TELEGRAM_DUPLICATE_STATE.md

# Show what will be committed
echo "Files to be committed:"
echo ""
git status

echo ""
echo "=== Creating commit ==="
git commit -m "fix: telegram bot duplicate notifications - persist lastSwapTx to disk

- Add lastSwapTx to NotificationState interface
- Load lastSwapTx from persistent state on bot startup
- Save lastSwapTx to disk after each notification
- Prevents duplicate notifications after bot restarts/redeployments
- Add disk flush to taxService.saveTaxState for cloud environments
- Add detailed logging for state persistence

Fixes issue where bot would send duplicate notifications for old
distributions after Railway redeployments because lastSwapTx was
only stored in memory.

Root cause: Bot used in-memory variable that reset to null on restart,
causing it to treat old distributions as new ones.
"

if [ $? -eq 0 ]; then
  echo "✅ Commit created successfully"
else
  echo "❌ Commit failed"
  exit 1
fi

echo ""
echo "=== Pushing to GitHub ==="
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Successfully pushed to GitHub!"
  echo ""
  echo "=== Next Steps ==="
  echo ""
  echo "1. Railway will auto-deploy the fix"
  echo "2. Wait for next distribution (5 minutes)"
  echo "3. You should receive ONLY 2 messages:"
  echo "   - 1 message in group chat"
  echo "   - 1 message in private chat"
  echo "4. No more duplicates!"
  echo ""
  echo "The bot will now persist the lastSwapTx to:"
  echo "  telegram-bot/data/notification-state.json"
  echo ""
  echo "Check Railway logs for:"
  echo "  [Bot] Loaded last known swap tx from state: <tx_hash>"
  echo "  [AutoRewards] Updated persistent state with lastSwapTx: <tx_hash>"
else
  echo "❌ Push failed"
  exit 1
fi
