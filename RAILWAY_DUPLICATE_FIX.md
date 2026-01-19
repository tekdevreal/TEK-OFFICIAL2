# Fix: Telegram Bot Duplicates on Railway

## Problem

Still receiving **two telegram messages** per distribution, even though local bot is killed.

## Root Cause

**Railway has multiple bot instances running**. This can happen when:
1. Multiple deployments are active (old deployment didn't stop)
2. Replica count is set to 2+ instead of 1
3. Multiple services exist with the same bot token
4. Both webhook and polling are active

## Solution

### Step 1: Check Railway Dashboard

1. **Go to Railway:**
   - https://railway.app/dashboard
   
2. **Find your telegram-bot service**

3. **Check Deployments Tab:**
   - Look for multiple "Active" deployments
   - You should only have ONE active deployment
   - If you see 2+, that's the problem!

### Step 2: Fix Multiple Deployments

**Option A: Delete Old Deployments**
1. In Deployments tab
2. Find the OLD deployment (earlier timestamp)
3. Click "..." menu → "Remove"
4. Keep only the LATEST deployment

**Option B: Redeploy Fresh**
1. Click "Deploy" → "Redeploy"
2. Wait for new deployment to start
3. Delete all old deployments

### Step 3: Check Replica Count

1. Go to **Settings** tab
2. Check **"Replicas"** or **"Instances"** setting
3. **Must be set to 1** (not 2+)
4. If it's 2+, change to 1
5. Save and redeploy

### Step 4: Check for Duplicate Services

1. In Railway dashboard, check ALL services
2. Look for multiple services that might be running the bot:
   - `telegram-bot`
   - `telegram-bot-production`
   - `bot`
   - etc.
3. If you find duplicates, delete the ones you don't need

### Step 5: Verify Webhook Configuration

1. Check if bot is using webhook mode (it should be)
2. Ensure only ONE webhook URL is set
3. Clear any old webhooks:

```bash
# Get your bot token from Railway env vars
curl "https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook?drop_pending_updates=true"

# Verify webhook info
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://nukerewards-telegram-bot-production.up.railway.app/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

If you see **multiple URLs** or **old URLs**, that's a problem.

## Quick Fix: Nuclear Option

If you can't figure out which instance is duplicate:

### Option 1: Suspend and Restart
1. Go to Railway → telegram-bot service
2. Click "Settings" → "Suspend Service"
3. Wait 30 seconds
4. Click "Resume Service"
5. This will kill ALL instances and start fresh with ONE

### Option 2: Clear Webhook and Restart
1. Get your bot token from Railway env vars
2. Clear webhook:
```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook?drop_pending_updates=true"
```
3. Go to Railway → Click "Redeploy"
4. Bot will re-register webhook on startup

### Option 3: Environment Variable Check
1. Check Railway env vars for `TELEGRAM_CHAT_IDS`
2. Make sure each chat ID appears ONCE:
   - ✅ Good: `TELEGRAM_CHAT_IDS=123456789,987654321`
   - ❌ Bad: `TELEGRAM_CHAT_IDS=123456789,123456789` (duplicate!)

## Verification

After fixing:

1. **Wait for next distribution** (5 minutes)
2. **Check Telegram** - should receive ONLY ONE message
3. **Check Railway logs:**
   ```
   [Bot] Express server listening { port: 3000, ... }
   [Bot] Webhook registered successfully
   [AutoRewards] New swap + distribution detected
   [AutoRewards] Sent swap/distribution notification { chatId: '...' }
   ```
4. Should see **ONE log entry** per notification, not two

## Common Railway Issues

### Issue 1: Old Deployment Still Running
**Symptoms:** Two deployments shown as "Active"

**Fix:**
1. Deployments tab
2. Delete the older one
3. Keep only latest

### Issue 2: Replica Count > 1
**Symptoms:** Multiple instances in Metrics

**Fix:**
1. Settings → Replicas
2. Set to 1
3. Save

### Issue 3: Auto-Redeploy Conflicts
**Symptoms:** New deployment starts before old one stops

**Fix:**
1. Settings → Check "Restart Policy"
2. Ensure graceful shutdown is enabled
3. Or manually suspend before deploying

### Issue 4: Multiple Services
**Symptoms:** Multiple services in dashboard

**Fix:**
1. Check ALL services
2. Delete duplicates
3. Keep only one

## Expected Railway Configuration

**Correct Setup:**
- **Services:** 1 telegram-bot service only
- **Deployments:** 1 active deployment
- **Replicas:** 1 instance
- **Webhook:** 1 URL registered
- **Chat IDs:** Each ID appears once in env vars

**Result:** ONE message per distribution ✓

## If Issue Persists

If you still get duplicates after checking Railway:

1. **Check bot token:**
   - Ensure only ONE service uses this token
   - No local processes using same token
   - No other servers (Render, Heroku, etc.) using same token

2. **Check Telegram webhook:**
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
   ```
   - Should show ONE webhook URL
   - `pending_update_count` should be 0
   - If multiple webhooks, delete all and restart

3. **Check Railway metrics:**
   - Go to Metrics tab
   - Check "Instances" graph
   - Should show 1 instance, not 2+

4. **Check for cron jobs:**
   - Ensure no cron jobs starting the bot
   - Check Railway cron settings
   - Check any external monitoring that might restart bot

## Contact

If you need the bot token to check webhook:
- Find it in Railway → telegram-bot → Variables → `TELEGRAM_BOT_TOKEN`

## Current Status

- ✅ Local bot killed (verified)
- ❌ Still getting 2 messages
- 🔍 Check Railway for multiple instances/deployments
