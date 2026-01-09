# Issue Analysis - January 9, 2026

## Issues Reported

1. **SOL Distribution Issue**: System may be distributing ALL SOL from wallet instead of only SOL from swaps
2. **Telegram Bot Stopped**: Bot stopped sending notifications last night during update

---

## Issue 1: SOL Distribution Analysis

### Current State

Checked `backend/reward-state.json`:
```json
{
  "lastRewardRun": 1765729159685,
  "holderRewards": {},
  "retryCounts": {}
}
```

**❌ PROBLEM FOUND**: No `taxState` property exists in the state file!

### What This Means

The `taxState` object should contain:
- `totalSolDistributed` - Total SOL distributed to holders
- `totalSolToTreasury` - Total SOL sent to treasury  
- `lastSwapTx` - Last swap transaction signature
- `taxDistributions` - Array of distribution history

**Without this data, we cannot verify:**
1. How much SOL has been distributed
2. Whether distributions match swap proceeds
3. If the fix from `CRITICAL_FIX_ACCUMULATED_REWARDS.md` is actually deployed

### Root Cause Analysis

There are THREE possible scenarios:

#### Scenario A: Backend Not Running New Code ⚠️
The critical fix from January 8, 2026 may not be deployed to production.

**Evidence:**
- `reward-state.json` has no `taxState` property
- The fix specifically adds `taxState` tracking to `backend/src/services/taxService.ts`
- File shows `lastRewardRun` timestamp but no tax processing

**Impact:**
- If old code is running, it may still have the accumulated rewards bug
- System could be distributing from wallet balance instead of swap proceeds

#### Scenario B: No Tax Collected Yet ℹ️
The backend is running but no tax has been collected/processed yet.

**Evidence:**
- State file exists with `lastRewardRun` timestamp
- But no `taxState` means `processWithheldTax()` hasn't run successfully

**Impact:**
- System is idle, no distributions happening
- Not a bug, just waiting for tax to accumulate

#### Scenario C: Tax Below Threshold 🔄
Tax is being collected but hasn't met the minimum threshold for harvesting.

**Evidence:**
- The fix includes threshold checks: `checkMinimumTaxThreshold()`
- If threshold not met, harvest is skipped and tax rolls over

**Impact:**
- Tax is accumulating in Token-2022 mint
- Will be harvested when threshold is met
- This is correct behavior

### The Fix (From January 8, 2026)

The fix in `CRITICAL_FIX_ACCUMULATED_REWARDS.md` changed:

**BEFORE (Bug):**
```typescript
// Calculate total: current reward + accumulated reward
const totalRewardLamports = currentRewardLamports + accumulatedRewardLamports;

if (totalRewardLamports >= thresholdLamports) {
  rewardsToPay.push({
    pubkey: holder.owner,
    amountLamports: totalRewardLamports,  // ← PAID BOTH! ❌
    wasAccumulated: accumulatedRewardLamports > 0n,
  });
}
```

**AFTER (Fixed):**
```typescript
// Check if current reward meets threshold (ignore accumulated rewards)
if (currentRewardLamports >= thresholdLamports) {
  // Pay ONLY the current reward from swap
  rewardsToPay.push({
    pubkey: holder.owner,
    amountLamports: currentRewardLamports,  // ← ONLY swap proceeds ✅
    wasAccumulated: false,
  });
}
```

**Key Changes:**
1. Lines 130-197 in `backend/src/services/solDistributionService.ts`
2. Lines 308-337: Removed accumulated reward clearing
3. Now ONLY distributes SOL from current NUKE swap

### Verification Steps Needed

To determine which scenario we're in:

1. **Check if backend is running:**
   ```bash
   # On production server (Render)
   # Check logs for recent activity
   ```

2. **Check backend logs for:**
   - `[INFO] Tax distribution complete` - Confirms tax processing
   - `[INFO] NUKE swapped to SOL successfully` - Confirms swaps happening
   - `[INFO] SOL distributed to holders` - Confirms distributions
   - `[INFO] Only SOL from NUKE swap distributed` - Confirms fix is deployed

3. **Check reward wallet balance:**
   ```
   Wallet: 6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
   Network: Devnet
   Check: https://solscan.io/account/6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo?cluster=devnet
   ```

4. **Check if fix is deployed:**
   ```bash
   # On production server
   git log --oneline -5
   # Should show: "fix: only distribute SOL from NUKE swaps, not wallet balance"
   ```

### Recommended Actions

**IMMEDIATE:**
1. ✅ Check Render deployment logs
2. ✅ Verify latest commit is deployed
3. ✅ Check reward wallet balance on Solscan
4. ✅ Review backend logs for tax processing

**IF OLD CODE IS RUNNING:**
1. Deploy the fix immediately
2. Monitor reward wallet balance
3. Add 0.5-1 SOL for operational costs only

**IF NEW CODE IS RUNNING:**
1. Wait for tax to accumulate and meet threshold
2. Monitor next distribution cycle
3. Verify logs show "Only SOL from NUKE swap distributed"

---

## Issue 2: Telegram Bot Not Sending Messages

### Problem

Bot stopped with error:
```
409 Conflict: terminated by other getUpdates request; 
make sure that only one bot instance is running
```

Last log entry: `Killed`

### Root Cause

**Multiple bot instances running simultaneously** with the same bot token.

Telegram's API only allows ONE active connection per bot token. When a second instance tries to connect, it terminates the first one with a 409 error.

### Where Multiple Instances Could Be

1. **Local machine** (WSL/Ubuntu):
   - Running in a terminal
   - Running in background with `&`
   - Running via PM2 or systemd

2. **Render/Production**:
   - Deployed telegram-bot service
   - Auto-restarted after crash

3. **Multiple terminals**:
   - Old terminal session still running
   - Multiple `npm start` commands

### Current Bot Configuration

From `telegram-bot/src/index.ts`:
- **Mode**: Webhook (not polling)
- **Port**: 3000 (or from `PORT` env var)
- **Webhook URL**: From `TELEGRAM_WEBHOOK_URL` or Railway URL
- **Polling Interval**: 60000ms (1 minute) for checking backend API

The bot uses webhook mode but also has a polling loop for checking the backend API for new distributions.

### The Fix

**Step 1: Kill All Running Instances**

```bash
# On local machine (WSL)
pkill -f "node.*telegram-bot"

# Verify no instances running
ps aux | grep telegram-bot

# Check Render dashboard
# - Find telegram-bot service
# - Check if it's running
# - Temporarily suspend if needed
```

**Step 2: Clear Telegram Webhook**

The webhook might be stuck pointing to an old/dead instance:

```bash
# Use Telegram Bot API to clear webhook
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook?drop_pending_updates=true
```

**Step 3: Start ONE Instance**

```bash
cd /home/van/reward-project/telegram-bot
npm run build
npm start
```

**Step 4: Verify**

```bash
# Check logs
tail -f telegram-bot/bot.log

# Should see:
# [Bot] Webhook registered successfully
# [Bot] Express server listening
# NO 409 errors
```

### Prevention

To prevent this from happening again:

1. **Use a process manager:**
   ```bash
   npm install -g pm2
   pm2 start npm --name "telegram-bot" -- start
   pm2 save
   pm2 startup  # Auto-start on reboot
   ```

2. **Add startup lockfile check:**
   ```typescript
   // In telegram-bot/src/index.ts
   const lockFile = '/tmp/telegram-bot.lock';
   if (fs.existsSync(lockFile)) {
     console.error('Bot is already running!');
     process.exit(1);
   }
   fs.writeFileSync(lockFile, process.pid.toString());
   
   process.on('SIGINT', () => {
     fs.unlinkSync(lockFile);
     process.exit(0);
   });
   ```

3. **Proper webhook management:**
   ```typescript
   // Delete any existing webhook first
   await bot.deleteWebHook({ drop_pending_updates: true });
   
   // Then set the new webhook
   await bot.setWebHook(webhookUrl);
   ```

### Bot Notification Logic

The bot checks for new distributions every 60 seconds:

```typescript
// From telegram-bot/src/index.ts lines 230-262
let lastKnownSwapTx: string | null = null;

const tickAutomaticRewards = async () => {
  const { message, lastSwapTx } = await fetchSwapDistributionNotification(backendUrl, lastKnownSwapTx);
  
  if (!message) {
    // No new swap/distribution detected
    return;
  }

  // New swap detected - broadcast to all authorized chats
  for (const chatId of authorizedChatIds) {
    await bot.sendMessage(chatId, message);
  }

  lastKnownSwapTx = lastSwapTx;
};

setInterval(tickAutomaticRewards, pollingIntervalMs);
```

**Key Points:**
- Bot only sends notifications when `lastSwapTx` changes
- This requires `taxState.lastSwapTx` to exist in backend state
- **If backend has no `taxState`, bot will never send notifications!**

### Connection Between Issues

**CRITICAL INSIGHT**: The two issues are related!

1. Backend has no `taxState` → No `lastSwapTx` value
2. Bot checks `lastSwapTx` to detect new distributions
3. Without `taxState`, bot sees `lastSwapTx: null` every time
4. Bot thinks no new distributions occurred
5. **Bot never sends notifications**

**This means:**
- Even if we fix the 409 error, bot won't send messages
- We MUST ensure backend is running the new code with `taxState` tracking
- Only then will bot detect new distributions and send notifications

---

## Summary & Action Plan

### Issue 1: SOL Distribution
**Status**: ⚠️ Cannot verify - missing `taxState` in state file

**Actions Needed:**
1. ✅ Check if backend is running latest code
2. ✅ Verify fix is deployed to production
3. ✅ Check backend logs for tax processing
4. ✅ Monitor reward wallet balance
5. ✅ Wait for next distribution and verify logs

**Expected Outcome:**
- Backend logs show "Only SOL from NUKE swap distributed"
- Reward wallet balance stays ~0.5-1 SOL for operations
- `taxState` appears in `reward-state.json`

### Issue 2: Telegram Bot
**Status**: ❌ Confirmed - multiple instances + missing taxState

**Actions Needed:**
1. ✅ Kill all running bot instances
2. ✅ Clear Telegram webhook
3. ✅ Start ONE bot instance
4. ✅ Verify backend has `taxState` (required for notifications)
5. ✅ Test with `/rewards` command
6. ✅ Wait for next distribution to test automatic notifications

**Expected Outcome:**
- Bot starts without 409 errors
- `/rewards` command works
- Automatic notifications sent when swap+distribution occurs

### Critical Dependencies

```
Backend Running Latest Code
    ↓
Tax Processing Creates taxState
    ↓
Bot Detects lastSwapTx Changes
    ↓
Bot Sends Notifications
```

**Without the first step, nothing else works!**

---

## Files to Check

1. **Backend State**: `backend/reward-state.json`
   - Should have `taxState` property
   - Should have `lastSwapTx` value

2. **Backend Logs**: Check Render logs for:
   - Tax processing
   - Swap transactions
   - Distribution logs
   - Error messages

3. **Telegram Bot Logs**: `telegram-bot/bot.log`
   - Check for 409 errors
   - Check for webhook registration
   - Check for notification attempts

4. **Reward Wallet**: Check Solscan
   - Current balance
   - Recent transactions
   - Distribution amounts

---

## Next Steps

1. **Check Render deployment status**
2. **Review backend logs**
3. **Fix telegram bot (kill duplicates)**
4. **Verify backend code is latest version**
5. **Monitor next reward cycle**
6. **Confirm notifications working**
