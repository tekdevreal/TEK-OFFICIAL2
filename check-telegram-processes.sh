#!/bin/bash

# Check for ALL Telegram Bot Processes

echo "=== Checking for Telegram Bot Processes ==="
echo ""

echo "1. Checking local processes..."
PROCS=$(ps aux | grep -E "telegram-bot|node.*dist/index" | grep -v grep)
if [ -z "$PROCS" ]; then
    echo "   ✅ No local telegram bot processes found"
else
    echo "   ⚠️  Found local processes:"
    echo "$PROCS"
    echo ""
    echo "   Killing them..."
    pkill -9 -f "telegram-bot"
    pkill -9 -f "node.*dist/index.js"
    sleep 2
    echo "   ✅ Killed"
fi

echo ""
echo "2. Checking PM2 processes..."
if command -v pm2 &> /dev/null; then
    PM2_PROCS=$(pm2 list 2>/dev/null | grep telegram)
    if [ -z "$PM2_PROCS" ]; then
        echo "   ✅ No PM2 telegram processes"
    else
        echo "   ⚠️  Found PM2 processes:"
        pm2 list
        echo ""
        echo "   To kill: pm2 delete telegram-bot"
    fi
else
    echo "   ℹ️  PM2 not installed"
fi

echo ""
echo "3. Verification..."
sleep 1
REMAINING=$(ps aux | grep -E "telegram-bot|node.*dist/index" | grep -v grep)
if [ -z "$REMAINING" ]; then
    echo "   ✅ All local bot processes stopped"
else
    echo "   ❌ Still running:"
    echo "$REMAINING"
fi

echo ""
echo "=== Railway Check ==="
echo ""
echo "The duplicate messages are likely from Railway."
echo ""
echo "To fix:"
echo "  1. Go to: https://railway.app/dashboard"
echo "  2. Find your telegram-bot service"
echo "  3. Check the 'Deployments' tab"
echo "  4. Look for MULTIPLE active deployments"
echo "  5. Delete/stop all but one"
echo ""
echo "OR:"
echo "  1. Go to Settings → Replicas"
echo "  2. Ensure it's set to 1 (not 2+)"
echo ""
echo "Common causes of duplicates on Railway:"
echo "  - Multiple deployments active (old one didn't stop)"
echo "  - Replica count > 1"
echo "  - Multiple services with same bot token"
echo "  - Webhook and polling both active"
