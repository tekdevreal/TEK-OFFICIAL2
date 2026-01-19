# Fix Railway Duplicate Telegram Bot Messages

## Problem
Receiving **4 messages total** (2 in group chat + 2 in private chat) with 1-minute delay between duplicates.

## Root Cause
Railway likely has **2 instances** of the telegram bot running:
- Old deployment still active
- New deployment from last night's update
- Both instances send notifications independently
- Result: 2x messages to each chat ID

## Solution Steps

### Step 1: Check Railway Dashboard

1. Go to https://railway.app
2. Select your project
3. Click on **telegram-bot** service
4. Click **Deployments** tab

**What to look for:**
- Multiple deployments with "Active" status
- Two or more running instances

### Step 2: Stop Old Deployments

**Option A: Via Dashboard**
1. In Deployments tab, find old/duplicate deployments
2. Click the **3-dot menu** on old deployment
3. Select **Remove**
4. Keep only the LATEST deployment

**Option B: Via Settings**
1. Go to **Settings** tab
2. Scroll to **Danger Zone**
3. Click **Restart Service** (this will kill all instances and start fresh)

### Step 3: Verify Single Instance

After stopping old deployments:

1. Check **Deployments** tab shows only ONE active deployment
2. Check **Logs** tab for startup messages
3. You should see only ONE "[Bot] Express server listening" message

### Step 4: Test

1. Wait for next reward distribution (5 minutes)
2. You should receive **exactly 2 messages** (1 per chat ID)
3. No duplicates with 1-minute delay

## Diagnostic: Add Deployment ID Logging

If you're still unsure, add deployment ID logging to identify instances:

### 1. Apply the Patch

Edit `telegram-bot/src/index.ts` and add after line 177:

```typescript
const DEPLOYMENT_ID = process.env.RAILWAY_DEPLOYMENT_ID 
  || process.env.RAILWAY_REPLICA_ID 
  || crypto.randomBytes(8).toString('hex');

console.log('='.repeat(80));
console.log('[Bot] 🚀 STARTING TELEGRAM BOT');
console.log('[Bot] Deployment ID:', DEPLOYMENT_ID);
console.log('[Bot] Railway Service:', process.env.RAILWAY_SERVICE_NAME || 'N/A');
console.log('='.repeat(80));
```

### 2. Add to Notification Logs

In `tickAutomaticRewards` function (line 244), modify:

```typescript
console.log('[AutoRewards] New swap + distribution detected', {
  deploymentId: DEPLOYMENT_ID,  // ADD THIS
  lastSwapTx,
  authorizedChatIds,
});
```

And at line 252:

```typescript
console.log('[AutoRewards] Sent notification', { 
  deploymentId: DEPLOYMENT_ID,  // ADD THIS
  chatId 
});
```

### 3. Deploy and Check Logs

```bash
cd telegram-bot
npm run build
git add .
git commit -m "debug: add deployment ID logging"
git push
```

Then check Railway logs for:
```
[Bot] Deployment ID: abc123  <-- Instance 1
[Bot] Deployment ID: xyz789  <-- Instance 2 (DUPLICATE!)
```

If you see **2 different deployment IDs**, you have 2 instances running.

## Alternative: Railway CLI

If you prefer command line:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# List services
railway status

# Check deployments
railway logs telegram-bot

# Restart service (kills all instances)
railway restart telegram-bot
```

## Prevention

To prevent this in the future:

### 1. Use Railway's Built-in Deployment Strategy

In Railway project settings:
- **Deployment Strategy**: "Replace" (not "Blue-Green")
- This ensures old deployments are stopped before new ones start

### 2. Add Health Check

Add to `telegram-bot/src/index.ts`:

```typescript
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    deploymentId: DEPLOYMENT_ID,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
```

Then configure Railway health check:
- Path: `/health`
- Interval: 30s
- Timeout: 10s

### 3. Add Graceful Shutdown

Add to `telegram-bot/src/index.ts`:

```typescript
process.on('SIGTERM', () => {
  console.log('[Bot] SIGTERM received, shutting down gracefully');
  clearInterval(tickInterval);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Bot] SIGINT received, shutting down gracefully');
  clearInterval(tickInterval);
  process.exit(0);
});
```

## Expected Result

After fix:
- ✅ 1 message to group chat
- ✅ 1 message to private chat
- ✅ Total: 2 messages per distribution
- ✅ No 1-minute delayed duplicates

## Troubleshooting

### Still seeing duplicates after stopping old deployments?

1. **Check Railway Replicas**
   - Settings → Replicas
   - Should be set to 1 (not 2 or auto-scale)

2. **Check Environment Variables**
   - Verify `TELEGRAM_CHAT_IDS` has exactly 2 chat IDs
   - Format: `-1001234567890,-9876543210`
   - No duplicates in the list

3. **Clear Railway Cache**
   - Settings → Danger Zone → Clear Build Cache
   - Then redeploy

4. **Nuclear Option: Recreate Service**
   - Delete telegram-bot service entirely
   - Create new service from GitHub repo
   - Configure environment variables
   - Deploy

## Questions to Check

1. **How many deployments are active on Railway?**
   - Should be: 1
   - If 2+: Stop old ones

2. **How many replicas are configured?**
   - Should be: 1
   - If 2+: Reduce to 1

3. **What does TELEGRAM_CHAT_IDS contain?**
   - Should be: 2 unique chat IDs
   - Format: `ID1,ID2`

4. **Are there any other telegram bot services running?**
   - Check all Railway projects
   - Check for accidentally duplicated services
