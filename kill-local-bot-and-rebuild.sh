#!/bin/bash

echo "=== Killing Local Bot and Rebuilding for Railway ==="
echo ""

cd "$(dirname "$0")"

echo "Step 1: Killing local bot process (PID 14617)..."
kill 14617 2>/dev/null && echo "✅ Killed PID 14617" || echo "⚠️  PID 14617 not found (may have already stopped)"

# Kill any other node processes running the telegram bot
echo ""
echo "Step 2: Killing any other telegram bot processes..."
pkill -f "telegram.*bot" 2>/dev/null && echo "✅ Killed telegram bot processes" || echo "ℹ️  No other telegram bot processes found"
pkill -f "node.*dist/index.js" 2>/dev/null && echo "✅ Killed node dist/index.js processes" || echo "ℹ️  No node dist/index.js processes found"

echo ""
echo "Step 3: Verifying no bot processes are running..."
sleep 2
if ps aux | grep -E "node.*dist/index|telegram.*bot" | grep -v grep > /dev/null; then
  echo "❌ Bot processes still running:"
  ps aux | grep -E "node.*dist/index|telegram.*bot" | grep -v grep
  echo ""
  echo "Please manually kill these processes and run this script again"
  exit 1
else
  echo "✅ No bot processes running"
fi

echo ""
echo "Step 4: Rebuilding telegram bot with NEW code..."
cd telegram-bot
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed - check for TypeScript errors"
  exit 1
fi

echo "✅ Build successful"
echo ""

cd ..

echo "Step 5: Committing and pushing dist files..."
git add telegram-bot/dist/
git status

echo ""
read -p "Commit and push? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  git commit -m "build: rebuild telegram bot dist files with distribution hash fix

- Rebuilt TypeScript to JavaScript with latest code
- Includes distribution hash tracking to prevent duplicates
- Works correctly with batch splitting (4 swaps = 1 notification)

This will trigger Railway auto-deploy with the correct code."

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
else
  echo "Skipped commit/push"
  echo ""
  echo "To manually commit and push:"
  echo "  git add telegram-bot/dist/"
  echo "  git commit -m 'build: rebuild telegram bot dist files'"
  echo "  git push"
fi

echo ""
echo "=== Done ==="
echo ""
echo "Next steps:"
echo "1. Wait for Railway to redeploy (~2 minutes)"
echo "2. Check Railway logs for 'distributionHash' messages"
echo "3. Wait for next distribution (5 minutes)"
echo "4. Verify you receive ONLY 2 messages (1 group + 1 private)"
