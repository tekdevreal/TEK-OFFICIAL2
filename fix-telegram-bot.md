# Telegram Bot Fix - Multiple Instances Issue

## Problem

The Telegram bot stopped sending messages with error:
```
409 Conflict: terminated by other getUpdates request; make sure that only one bot instance is running
```

This error occurs when **multiple bot instances** are trying to poll Telegram's servers with the same bot token simultaneously.

## Root Cause

The current bot (`telegram-bot/src/index.ts`) uses **webhook mode**, but there's likely another bot instance running somewhere (either locally, on Render, or in another terminal) that's also trying to connect.

## Solutions

### Option 1: Kill All Running Bot Instances (Immediate Fix)

1. **On local machine:**
   ```bash
   # Find all node processes running the bot
   ps aux | grep telegram-bot
   
   # Kill them
   pkill -f telegram-bot
   
   # Or use the kill script
   cd telegram-bot
   bash kill-all-bots.sh
   ```

2. **On Render (if deployed):**
   - Go to Render dashboard
   - Find the telegram-bot service
   - Click "Manual Deploy" → "Clear build cache & deploy"
   - Or temporarily suspend the service

3. **Restart the bot:**
   ```bash
   cd telegram-bot
   npm run build
   npm start
   ```

### Option 2: Use Webhook Mode Properly (Recommended)

The bot is already configured for webhook mode, but we need to ensure only ONE instance is running.

**Update the bot to properly manage webhooks:**

1. **On startup, clear any existing webhooks:**
   ```typescript
   // Delete any existing webhook first
   await bot.deleteWebHook({ drop_pending_updates: true });
   
   // Then set the new webhook
   await bot.setWebHook(webhookUrl);
   ```

2. **Add process management:**
   - Use PM2 or similar to ensure only one instance runs
   - Add a lockfile to prevent multiple starts

### Option 3: Switch to Polling Mode (Alternative)

If webhook mode continues to have issues, you can switch to polling:

```typescript
const bot = new TelegramBot(token, { 
  polling: {
    interval: 1000,
    autoStart: true,
    params: {
      timeout: 10
    }
  } 
});

// Remove webhook setup
// bot.setWebHook(webhookUrl) <- REMOVE THIS

// Remove express webhook endpoint
// app.post('/telegram/webhook', ...) <- REMOVE THIS
```

## Immediate Steps to Fix

1. **Kill all running instances:**
   ```bash
   # On WSL/Linux
   pkill -f "node.*telegram-bot"
   
   # Verify no instances running
   ps aux | grep telegram-bot
   ```

2. **Check Render:**
   - Log into Render dashboard
   - Check if telegram-bot service is running
   - If yes, temporarily suspend it or check logs

3. **Start ONE instance:**
   ```bash
   cd /home/van/reward-project/telegram-bot
   npm run build
   npm start > bot.log 2>&1 &
   ```

4. **Verify it's working:**
   ```bash
   tail -f telegram-bot/bot.log
   
   # You should see:
   # [Bot] Webhook registered successfully
   # [Bot] Express server listening
   # NO 409 errors
   ```

## Prevention

To prevent this from happening again:

1. **Use a process manager (PM2):**
   ```bash
   npm install -g pm2
   pm2 start npm --name "telegram-bot" -- start
   pm2 save
   ```

2. **Add a startup check:**
   ```typescript
   // Check if another instance is running
   const lockFile = '/tmp/telegram-bot.lock';
   if (fs.existsSync(lockFile)) {
     console.error('Bot is already running!');
     process.exit(1);
   }
   fs.writeFileSync(lockFile, process.pid.toString());
   ```

3. **Proper shutdown handling:**
   ```typescript
   process.on('SIGINT', () => {
     console.log('Shutting down bot...');
     bot.stopPolling();
     fs.unlinkSync(lockFile);
     process.exit(0);
   });
   ```

## Verification

After fixing, verify the bot is working:

1. **Check logs for successful startup:**
   ```
   [Bot] Webhook registered successfully
   [Bot] Express server listening
   ```

2. **Send a test command:**
   - In Telegram, send `/rewards` to the bot
   - You should get a response with current reward statistics

3. **Wait for automatic notification:**
   - Wait for the next reward cycle (5 minutes)
   - Bot should automatically send notification when swap+distribution occurs

## Current Bot Configuration

- **Mode:** Webhook (not polling)
- **Polling Interval:** 60000ms (1 minute) for checking backend API
- **Webhook URL:** Set via `TELEGRAM_WEBHOOK_URL` or Railway URL
- **Port:** 3000 (or from `PORT` env var)

## Environment Variables Needed

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_IDS=chat_id_1,chat_id_2
BACKEND_URL=https://your-backend-url.com
TELEGRAM_WEBHOOK_URL=https://your-bot-webhook-url.com
PORT=3000
POLLING_INTERVAL_MS=60000
```
