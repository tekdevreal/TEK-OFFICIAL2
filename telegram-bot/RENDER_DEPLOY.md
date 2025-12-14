# Telegram Bot Render Worker Deployment Guide

## Overview

Deploy the Telegram bot as a Render Worker service to run 24/7 and send automatic notifications about reward cycles and payouts.

## Deployment Methods

### Method 1: Render Dashboard (Recommended)

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com
   - Sign in with GitHub

2. **Create New Worker:**
   - Click "New +" → "Background Worker"
   - Connect repository: `Millionaireguardian/nukerewards`
   - Branch: `main`

3. **Configure Worker:**
   - **Name**: `nukerewards-telegram-bot`
   - **Environment**: `Node`
   - **Region**: `Oregon` (or closest)
   - **Branch**: `main`
   - **Root Directory**: `telegram-bot`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` (or upgrade for production)

4. **Environment Variables (CRITICAL):**
   Add these in Render Dashboard → Environment:
   
   **Required:**
   ```
   NODE_ENV=production
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=@nukerewards
   BACKEND_URL=https://nukerewards-backend.onrender.com
   ```
   
   **Optional (with defaults):**
   ```
   POLLING_INTERVAL_MS=60000
   RETRY_ATTEMPTS=3
   RETRY_DELAY_MS=1000
   ```

5. **Create Worker:**
   - Click "Create Background Worker"
   - Wait for build and deployment (2-5 minutes)

6. **Verify Deployment:**
   - Check logs in Render dashboard
   - Look for: `[Bot] Starting Reward System Telegram Bot...`
   - Look for: `[Bot] Bot is running!`

### Method 2: Render Blueprint (render.yaml)

1. Go to: https://dashboard.render.com
2. Click "New +" → "Blueprint"
3. Connect repository: `Millionaireguardian/nukerewards`
4. Render will detect `render.yaml` and create both services
5. Add environment variables in dashboard for the worker
6. Deploy!

## Environment Variables Setup

### Getting Telegram Bot Token

1. **Create Bot:**
   - Message @BotFather on Telegram
   - Send: `/newbot`
   - Follow prompts to create bot
   - Copy the bot token

2. **Get Chat ID:**
   - For channel: Add bot as admin, then use channel username (e.g., `@nukerewards`)
   - For group: Add bot to group, message @userinfobot to get group ID
   - For personal: Message @userinfobot to get your chat ID

3. **Add to Render:**
   - Go to Worker → Environment
   - Add `TELEGRAM_BOT_TOKEN` (mark as secret)
   - Add `TELEGRAM_CHAT_ID` (e.g., `@nukerewards` or numeric ID)
   - Add `BACKEND_URL` (your Render backend URL)

## Post-Deployment Verification

### 1. Check Logs
- Go to Render Dashboard → Worker → Logs
- Look for successful startup:
  ```
  [Bot] Starting Reward System Telegram Bot...
  [Bot] Backend URL: https://nukerewards-backend.onrender.com
  [Bot] Notification Chat ID: @nukerewards
  [Bot] Bot is running!
  ```

### 2. Test Bot Commands
Send these commands to your bot on Telegram:
- `/help` - List available commands
- `/rewards` - Get current reward status
- `/payouts` - Get pending payouts
- `/summary` - Get reward summary

### 3. Test Auto-Notifications
- Wait for next reward cycle (or trigger manually)
- Bot should send notification to configured chat
- Check logs for: `[Bot] ✅ New reward run detected`

### 4. Verify Backend Connection
- Check logs for successful API calls
- Look for: `[API] GET /dashboard/rewards`
- No errors about backend connection

## Troubleshooting

### Bot Not Starting
- **Check**: `TELEGRAM_BOT_TOKEN` is set correctly
- **Check**: Token is valid (not expired)
- **Check**: Logs for error messages

### No Notifications
- **Check**: `TELEGRAM_CHAT_ID` is correct
- **Check**: Bot is added to channel/group (if applicable)
- **Check**: `BACKEND_URL` is correct and accessible
- **Check**: Backend is running and responding

### Backend Connection Errors
- **Verify**: `BACKEND_URL` points to correct Render service
- **Verify**: Backend is deployed and running
- **Check**: CORS is configured in backend (if needed)
- **Check**: Backend health endpoint: `https://nukerewards-backend.onrender.com/health`

### Bot Keeps Restarting
- **Check**: Logs for crash errors
- **Check**: Environment variables are all set
- **Check**: Backend is accessible
- **Check**: Telegram API is reachable

## Important Notes

⚠️ **Free Tier Limitations:**
- Worker runs 24/7 on free tier (unlike web services)
- No spin-down for workers
- Perfect for Telegram bots!

⚠️ **Secrets:**
- Never commit `TELEGRAM_BOT_TOKEN` to git
- Use Render's environment variables (marked as secret)
- Rotate token if exposed

⚠️ **State Persistence:**
- Worker filesystem is ephemeral (resets on deploy)
- Notification state (`data/notification-state.json`) will reset on redeploy
- This is fine - bot will resume from current backend state

⚠️ **Logs:**
- Check Render logs for debugging
- Notification logs are also saved to `logs/notifications.log` (local to worker)
- Logs rotate daily

## Monitoring

### Key Metrics to Watch:
- Bot startup success
- API call success rate
- Notification send success
- Error frequency

### Log Patterns:
- `[Bot] ✅ New reward run detected` - Working correctly
- `[Bot] ⏭️ Duplicate reward run skipped` - Deduplication working
- `[API] Error` - Backend connection issues
- `[Bot] Error` - Bot-specific errors

## Support

If issues persist:
1. Check Render worker logs
2. Verify all environment variables
3. Test backend API directly
4. Test bot token with @BotFather
5. Check Telegram chat ID format

