#!/bin/bash

# Fix Telegram Bot - Kill Multiple Instances and Restart
# This script fixes the 409 Conflict error by ensuring only one bot instance runs

echo "=== Telegram Bot Fix Script ==="
echo ""

# Step 1: Kill all running instances
echo "Step 1: Killing all running bot instances..."
pkill -f "node.*telegram-bot" 2>/dev/null || echo "No bot processes found"
pkill -f "npm.*telegram-bot" 2>/dev/null || echo "No npm processes found"
sleep 2

# Step 2: Verify no instances running
echo ""
echo "Step 2: Verifying no bot instances are running..."
RUNNING=$(ps aux | grep -E "node.*telegram-bot|npm.*telegram-bot" | grep -v grep | wc -l)
if [ "$RUNNING" -gt 0 ]; then
    echo "⚠️  WARNING: $RUNNING bot process(es) still running!"
    echo "Processes:"
    ps aux | grep -E "node.*telegram-bot|npm.*telegram-bot" | grep -v grep
    echo ""
    echo "Attempting force kill..."
    pkill -9 -f "node.*telegram-bot" 2>/dev/null
    pkill -9 -f "npm.*telegram-bot" 2>/dev/null
    sleep 2
else
    echo "✅ No bot instances running"
fi

# Step 3: Clear webhook (optional - requires bot token)
echo ""
echo "Step 3: Clear Telegram webhook (optional)..."
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "⚠️  TELEGRAM_BOT_TOKEN not set, skipping webhook clear"
    echo "To manually clear webhook, run:"
    echo "curl https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook?drop_pending_updates=true"
else
    echo "Clearing webhook..."
    RESPONSE=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true")
    echo "Response: $RESPONSE"
fi

# Step 4: Build and start bot
echo ""
echo "Step 4: Building and starting bot..."
cd /home/van/reward-project/telegram-bot || exit 1

echo "Building..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful"
echo ""
echo "Starting bot..."
npm start > bot.log 2>&1 &
BOT_PID=$!

echo "Bot started with PID: $BOT_PID"
echo "Waiting 5 seconds for startup..."
sleep 5

# Step 5: Verify bot is running
echo ""
echo "Step 5: Verifying bot is running..."
if ps -p $BOT_PID > /dev/null; then
    echo "✅ Bot is running (PID: $BOT_PID)"
    echo ""
    echo "Checking logs for errors..."
    tail -n 20 bot.log
    
    # Check for 409 errors
    if grep -q "409 Conflict" bot.log; then
        echo ""
        echo "❌ ERROR: Bot still getting 409 errors!"
        echo "This means another instance is running somewhere else."
        echo "Check:"
        echo "  1. Render dashboard (if deployed there)"
        echo "  2. Other terminals"
        echo "  3. PM2 processes: pm2 list"
    else
        echo ""
        echo "✅ No 409 errors detected"
        echo ""
        echo "=== Bot Fix Complete ==="
        echo ""
        echo "To monitor logs:"
        echo "  tail -f /home/van/reward-project/telegram-bot/bot.log"
        echo ""
        echo "To stop bot:"
        echo "  kill $BOT_PID"
        echo ""
        echo "To test bot:"
        echo "  Send /rewards command in Telegram"
    fi
else
    echo "❌ Bot failed to start!"
    echo "Check logs:"
    cat bot.log
    exit 1
fi
