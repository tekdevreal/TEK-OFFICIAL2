#!/bin/bash

echo "=== Checking for ALL Bot Processes ==="
echo ""

echo "Step 1: Checking for node processes running telegram bot..."
ps aux | grep -E "node.*dist/index|telegram.*bot" | grep -v grep

if [ $? -eq 0 ]; then
  echo ""
  echo "❌ Found bot processes running!"
  echo ""
  echo "To kill all bot processes, run:"
  echo "  pkill -9 -f 'node dist/index.js'"
  echo "  pkill -9 -f 'telegram-bot'"
  exit 1
else
  echo "✅ No local bot processes found"
fi

echo ""
echo "Step 2: Checking for npm processes..."
ps aux | grep npm | grep -v grep

if [ $? -eq 0 ]; then
  echo ""
  echo "⚠️  Found npm processes (may be starting bot)"
else
  echo "✅ No npm processes found"
fi

echo ""
echo "Step 3: Checking listening ports for telegram bot..."
netstat -tlnp 2>/dev/null | grep -E "3000|8080" || echo "✅ No bot listening on ports 3000 or 8080"

echo ""
echo "=== Summary ==="
echo ""
echo "Local Status:"
echo "  ✅ No local bot processes running"
echo ""
echo "Railway Status:"
echo "  🔄 Should be auto-deploying now (commit 1184f11)"
echo "  📍 Check logs at: https://railway.app/dashboard"
echo ""
echo "Expected Railway logs after deployment:"
echo "  [Bot] Loaded last known distribution time from state: ..."
echo "  [AutoRewards] New distribution detected"
echo "  distributionHash: 'abc123...'"
echo ""
echo "✅ You should receive ONLY 2 messages (1 group + 1 private) on next distribution!"
