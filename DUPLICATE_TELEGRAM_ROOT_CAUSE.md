# Root Cause: Duplicate Telegram Notifications

## Problem
Receiving **4 total messages** (2 duplicates in group chat + 2 duplicates in private chat) with a **1-minute delay** between duplicates.

## Root Cause Analysis

### What We Found

The telegram bot has **ONE `setInterval` loop** in `telegram-bot/src/index.ts` that:
1. Polls the backend every `POLLING_INTERVAL_MS` (default: 60000ms = 1 minute)
2. Sends notifications to **all authorized chat IDs**

```typescript
// Line 265 in telegram-bot/src/index.ts
setInterval(tickAutomaticRewards, pollingIntervalMs);
```

The `tickAutomaticRewards` function:
```typescript
for (const chatId of authorizedChatIds) {
  await bot.sendMessage(chatId, message);
}
```

### Why 1-Minute Delay?

The **1-minute delay** between duplicates matches the `POLLING_INTERVAL_MS` setting. This suggests:

**Theory 1: Railway Has TWO Instances Running**
- Railway may have deployed the bot twice (old + new deployment)
- Each instance runs its own `setInterval` loop
- Both instances poll the backend and send notifications
- Result: 2 messages to each chat ID (4 total)

**Theory 2: Railway Auto-Scaling**
- Railway may have auto-scaled to 2 instances
- Each instance independently sends notifications
- Result: 2 messages to each chat ID (4 total)

**Theory 3: Webhook + Polling Conflict**
- The bot uses webhooks for commands
- But ALSO uses polling for automatic notifications
- There may be a conflict causing duplicate sends

## Evidence

1. ✅ **Local bot is KILLED** (confirmed in terminal logs)
2. ✅ **Only ONE bot implementation is active** (`index.ts`)
3. ✅ **1-minute delay matches POLLING_INTERVAL_MS**
4. ✅ **Duplicates started after "last night's update"**

## Solution

### Option 1: Check Railway Deployments (RECOMMENDED)

1. Go to Railway dashboard
2. Check if there are **multiple deployments** of telegram-bot service
3. Look for:
   - Old deployment still running
   - Multiple instances/replicas
   - Auto-scaling enabled

**How to Fix:**
- Delete old deployments
- Ensure only ONE instance is running
- Disable auto-scaling if enabled

### Option 2: Add Deployment ID to Logs

Modify `telegram-bot/src/index.ts` to log a unique deployment ID:

```typescript
const DEPLOYMENT_ID = process.env.RAILWAY_DEPLOYMENT_ID || crypto.randomBytes(8).toString('hex');

console.log('[Bot] Starting with deployment ID:', DEPLOYMENT_ID);

// In tickAutomaticRewards:
console.log('[AutoRewards] Sending notification', { 
  deploymentId: DEPLOYMENT_ID,
  chatId,
  lastSwapTx 
});
```

This will help identify if multiple instances are running.

### Option 3: Use Distributed Lock

Implement a distributed lock using the backend to ensure only ONE bot instance sends notifications:

```typescript
// Before sending notifications:
const lockAcquired = await backendClient.acquireNotificationLock(lastSwapTx);
if (!lockAcquired) {
  console.log('[AutoRewards] Another instance is handling this notification');
  return;
}
```

## Verification Steps

1. **Check Railway Dashboard**
   - Services → telegram-bot
   - Deployments tab
   - Count active deployments

2. **Check Railway Logs**
   - Look for duplicate "[Bot] Express server listening" messages
   - Each message = one bot instance starting

3. **Check Environment Variables**
   - Verify `TELEGRAM_CHAT_IDS` has exactly 2 chat IDs (group + private)
   - No duplicates in the list

## Expected Behavior

With 2 chat IDs configured:
- ✅ 1 message to group chat
- ✅ 1 message to private chat
- ✅ Total: 2 messages per distribution

## Current Behavior

- ❌ 2 messages to group chat (1 minute apart)
- ❌ 2 messages to private chat (1 minute apart)
- ❌ Total: 4 messages per distribution

## Next Steps

1. **Immediate:** Check Railway for multiple deployments
2. **Short-term:** Add deployment ID logging
3. **Long-term:** Implement distributed lock for production reliability
