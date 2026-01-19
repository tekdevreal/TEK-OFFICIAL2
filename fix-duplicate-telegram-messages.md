# Fix: Telegram Bot Sending Duplicate Messages

## Problem

The telegram bot is sending **two messages** for each distribution notification.

## Root Cause

There are likely **two bot instances running**:
1. **Local instance** (started by fix-telegram-bot.sh) - PID 14617
2. **Railway instance** (running on Railway production)

Both instances are:
- Polling the backend every 60 seconds
- Detecting the same `lastSwapTx` change
- Sending notifications to the same chat IDs

## Evidence from Logs

From your terminal output:
```
Bot started with PID: 14617
[Bot] Express server listening {
  webhookUrl: 'https://nukerewards-telegram-bot-production.up.railway.app/telegram/webhook',
  backendUrl: 'https://nukerewards-backend.onrender.com',
  pollingIntervalMs: 60000
}
```

The bot is configured to use Railway webhook, suggesting a Railway instance is also running.

## Solution

### Option 1: Stop Local Instance (Recommended)

Since Railway is handling the bot, stop the local instance:

```bash
# Kill the local bot
kill 14617

# Verify it's stopped
ps aux | grep telegram-bot | grep -v grep

# If still running, force kill
pkill -9 -f "node.*telegram-bot"
```

**Then rely solely on Railway for the telegram bot.**

### Option 2: Stop Railway Instance

If you want to run the bot locally instead:

1. **Suspend Railway service:**
   - Log into Railway dashboard
   - Find telegram-bot service
   - Click "Settings" → "Suspend"

2. **Keep local instance running** (PID 14617)

### Option 3: Deduplicate Messages in Code

If you want both instances (not recommended), add deduplication:

**File:** `telegram-bot/src/index.ts`

Add a distributed lock mechanism:

```typescript
// Track processed swap transactions globally
const processedSwapTxs = new Set<string>();

const tickAutomaticRewards = async () => {
  const { message, lastSwapTx } = await fetchSwapDistributionNotification(backendUrl, lastKnownSwapTx);
  
  if (!message || !lastSwapTx) {
    return;
  }

  // Deduplication: Check if already processed by another instance
  if (processedSwapTxs.has(lastSwapTx)) {
    console.log('[AutoRewards] Swap tx already processed, skipping', { lastSwapTx });
    lastKnownSwapTx = lastSwapTx;
    return;
  }

  // Mark as processed
  processedSwapTxs.add(lastSwapTx);
  
  // Broadcast notification
  for (const chatId of authorizedChatIds) {
    await bot.sendMessage(chatId, message);
  }

  lastKnownSwapTx = lastSwapTx;
  
  // Clean up old entries (keep last 100)
  if (processedSwapTxs.size > 100) {
    const txArray = Array.from(processedSwapTxs);
    processedSwapTxs.clear();
    txArray.slice(-50).forEach(tx => processedSwapTxs.add(tx));
  }
};
```

**Note:** This only works if both instances share the same process/memory, which they don't. For true distributed deduplication, you'd need Redis or a database.

## Recommended Action

**Stop the local bot and use Railway only:**

```bash
# Stop local bot
kill 14617

# Verify
ps aux | grep telegram-bot
```

**Advantages:**
- Railway handles restarts automatically
- No manual management needed
- No duplicate messages
- Always running (even when local machine is off)

## Verification

After stopping the local instance:

1. **Wait for next distribution** (5 minutes)
2. **Check Telegram** - should receive only ONE message
3. **Check bot logs** on Railway dashboard

Expected message format:
```
💰 NUKE Rewards Distributed

• Total: 5.097211 SOL
• Holders: 3.822909 SOL
• Treasury: 1.274303 SOL
• Epoch: 2026-01-09 08:40:47
```

## If Issue Persists

If you still get duplicate messages after stopping local bot:

1. **Check Railway dashboard:**
   - Ensure only ONE telegram-bot service is running
   - Check if there are multiple deployments

2. **Check webhook conflicts:**
   ```bash
   # Clear webhook
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook?drop_pending_updates=true"
   
   # Check webhook info
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
   ```

3. **Check authorized chat IDs:**
   - Ensure chat ID is not listed twice in `TELEGRAM_CHAT_IDS`
   - Check environment variable in Railway

## Current Setup

Based on your logs:
- **Backend**: Render (✓ working)
- **Telegram Bot**: Railway + Local (causing duplicates)
- **Webhook URL**: `https://nukerewards-telegram-bot-production.up.railway.app/telegram/webhook`

**Recommendation:** Stop local bot, use Railway only.
