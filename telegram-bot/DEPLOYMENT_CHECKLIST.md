# Telegram Bot Render Deployment Checklist

## Pre-Deployment

- [ ] Telegram bot token obtained from @BotFather
- [ ] Telegram chat ID determined (@channel, @group, or numeric ID)
- [ ] Backend deployed on Render and accessible
- [ ] Backend URL confirmed: `https://nukerewards-backend.onrender.com`
- [ ] Repository pushed to GitHub: `Millionaireguardian/nukerewards`

## Deployment Steps

### Step 1: Create Worker on Render

- [ ] Go to: https://dashboard.render.com
- [ ] Click "New +" → "Background Worker"
- [ ] Connect repository: `Millionaireguardian/nukerewards`
- [ ] Select branch: `main`

### Step 2: Configure Worker

- [ ] **Name**: `nukerewards-telegram-bot`
- [ ] **Environment**: `Node`
- [ ] **Region**: `Oregon` (or closest)
- [ ] **Branch**: `main`
- [ ] **Root Directory**: `telegram-bot`
- [ ] **Build Command**: `npm install && npm run build`
- [ ] **Start Command**: `npm start`
- [ ] **Instance Type**: `Free`

### Step 3: Set Environment Variables

**Required Variables:**
- [ ] `NODE_ENV` = `production`
- [ ] `TELEGRAM_BOT_TOKEN` = `(your bot token)` ⚠️ Mark as secret
- [ ] `TELEGRAM_CHAT_ID` = `@nukerewards` (or your chat ID)
- [ ] `BACKEND_URL` = `https://nukerewards-backend.onrender.com`

**Optional Variables (with defaults):**
- [ ] `POLLING_INTERVAL_MS` = `60000` (optional, default: 60000)
- [ ] `RETRY_ATTEMPTS` = `3` (optional, default: 3)
- [ ] `RETRY_DELAY_MS` = `1000` (optional, default: 1000)

### Step 4: Deploy

- [ ] Click "Create Background Worker"
- [ ] Wait for build to complete (2-5 minutes)
- [ ] Check build logs for errors

## Post-Deployment Verification

### 1. Check Logs

- [ ] Go to Render Dashboard → Worker → Logs
- [ ] Look for: `[Bot] Starting Reward System Telegram Bot...`
- [ ] Look for: `[Bot] Backend URL: https://nukerewards-backend.onrender.com`
- [ ] Look for: `[Bot] Bot is running!`
- [ ] No error messages

### 2. Test Bot Commands

Test these commands in Telegram:

- [ ] `/help` - Should return list of commands
- [ ] `/rewards` - Should return current reward status
- [ ] `/payouts` - Should return pending payouts
- [ ] `/summary` - Should return reward summary
- [ ] `/holders` - Should return holder count (if implemented)

### 3. Test Auto-Notifications

- [ ] Wait for next reward cycle (or trigger manually)
- [ ] Bot should send notification to configured chat
- [ ] Check logs for: `[Bot] ✅ New reward run detected`
- [ ] Check logs for: `[Bot] Notification sent`

### 4. Verify Backend Connection

- [ ] Check logs for successful API calls
- [ ] Look for: `[API] GET /dashboard/rewards`
- [ ] Look for: `[API] GET /dashboard/payouts`
- [ ] No connection errors

## Troubleshooting

### Bot Not Starting
- [ ] Verify `TELEGRAM_BOT_TOKEN` is correct
- [ ] Check token is valid (not expired)
- [ ] Review logs for specific error messages

### No Notifications
- [ ] Verify `TELEGRAM_CHAT_ID` is correct
- [ ] Ensure bot is added to channel/group (if applicable)
- [ ] Check `BACKEND_URL` is correct
- [ ] Verify backend is running

### Backend Connection Errors
- [ ] Test backend health: `https://nukerewards-backend.onrender.com/health`
- [ ] Verify `BACKEND_URL` matches backend service URL
- [ ] Check backend logs for errors
- [ ] Verify CORS is configured (if needed)

### Bot Keeps Restarting
- [ ] Check logs for crash errors
- [ ] Verify all required environment variables are set
- [ ] Check backend is accessible
- [ ] Verify Telegram API is reachable

## Quick Test Commands

After deployment, test these in Telegram:

```
/help
/rewards
/payouts
/summary
```

Expected responses:
- `/help` → List of available commands
- `/rewards` → Current reward cycle status
- `/payouts` → Pending payouts list
- `/summary` → Reward summary with statistics

## Success Indicators

✅ **Bot is working if:**
- Logs show: `[Bot] Bot is running!`
- Commands respond correctly
- Auto-notifications are sent
- No errors in logs
- Backend API calls succeed

## Support Resources

- **Deployment Guide**: `telegram-bot/RENDER_DEPLOY.md`
- **Render Dashboard**: https://dashboard.render.com
- **Bot Logs**: Render Dashboard → Worker → Logs
- **Backend Health**: `https://nukerewards-backend.onrender.com/health`

