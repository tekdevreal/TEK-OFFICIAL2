# Telegram Bot Fix for Batch Splitting

## Problem

When the backend performs **batch splitting** for large harvests (4 batches with 10-second delays), it creates **multiple swap transactions** but only **ONE distribution**.

The telegram bot was tracking `lastSwapTx` (swap transaction hash), so it detected each batch as a "new" distribution and sent duplicate notifications.

**Example:**
- Backend harvests 50,000 NUKE tokens
- Splits into 4 batches: 12,500 each
- Creates 4 swap transactions: `tx1`, `tx2`, `tx3`, `tx4`
- Bot sees `tx1` → sends notification ✅
- Bot sees `tx2` → sends notification ❌ (duplicate!)
- Bot sees `tx3` → sends notification ❌ (duplicate!)
- Bot sees `tx4` → sends notification ❌ (duplicate!)

**Result:** 4 messages per chat instead of 1!

## Solution

Changed the bot to track **`lastTaxDistribution` timestamp** instead of `lastSwapTx` hash.

**Why this works:**
- The backend sets `lastTaxDistribution` **ONCE** after ALL batches complete
- Even with 4 swap transactions, there's only ONE distribution timestamp
- Bot now sees ONE distribution event, not 4 swap events

**After fix:**
- Backend harvests 50,000 NUKE tokens
- Splits into 4 batches: `tx1`, `tx2`, `tx3`, `tx4`
- Sets `lastTaxDistribution = 2026-01-09T10:00:00Z` (ONCE)
- Bot sees new timestamp → sends notification ✅ (ONCE)

## Changes Made

### 1. `telegram-bot/src/index.ts`

**Changed from:**
```typescript
// Track by swap transaction hash
let lastKnownSwapTx: string | null = getLastState().lastSwapTx || null;

const { message, lastSwapTx } = await fetchSwapDistributionNotification(backendUrl, lastKnownSwapTx);

if (currentSwapTx === lastKnownSwapTx) {
  return { message: null, lastSwapTx: currentSwapTx };
}
```

**Changed to:**
```typescript
// Track by distribution timestamp
let lastKnownDistributionTime: number | null = getLastState().lastDistributionTime || null;

const { message, lastDistributionTime } = await fetchSwapDistributionNotification(backendUrl, lastKnownDistributionTime);

if (currentDistributionTime === lastKnownDistributionTime) {
  return { message: null, lastDistributionTime: currentDistributionTime };
}
```

### 2. `telegram-bot/src/state/notificationState.ts`

Added `lastDistributionTime` field:

```typescript
interface NotificationState {
  lastRewardRunId?: string;
  lastPayoutId?: string;
  lastSwapTx?: string; // Legacy (deprecated)
  lastDistributionTime?: number; // NEW: Handles batch splitting correctly
}
```

## How It Works Now

1. **Backend completes distribution** (may include 4 batch swaps)
2. **Backend saves** `lastTaxDistribution = 1736422800000` (timestamp)
3. **Telegram bot polls** every 60 seconds
4. **Bot compares** `1736422800000` !== `null` → NEW distribution!
5. **Bot sends** notification (ONCE)
6. **Bot saves** `lastDistributionTime = 1736422800000`
7. **Next poll:** `1736422800000` === `1736422800000` → No new distribution
8. **No duplicate notifications!**

## Expected Behavior After Fix

- ✅ **1 notification per distribution** (regardless of batch count)
- ✅ **2 messages total** (1 group chat + 1 private chat)
- ✅ **No duplicates** even with batch splitting
- ✅ **Works for any batch size** (2, 4, 10 batches, etc.)

## Testing

After deploying:

1. Wait for a large harvest (triggers batch splitting)
2. Check Railway logs for:
   ```
   [AutoRewards] New distribution detected
   [AutoRewards] Sent distribution notification { chatId: '...' }
   [AutoRewards] Sent distribution notification { chatId: '...' }
   ```
3. Should see **exactly 2 sends** (one per chat)
4. No additional sends 1 minute later

## Deployment

```bash
cd /home/van/reward-project

git add telegram-bot/src/index.ts
git add telegram-bot/src/state/notificationState.ts
git add BATCH_SPLITTING_FIX.md

git commit -m "fix: telegram bot now tracks distribution timestamp instead of swap tx

- Changed from tracking lastSwapTx to lastTaxDistribution timestamp
- Prevents duplicate notifications when batch splitting occurs
- Backend can now split large harvests into multiple swaps without
  triggering duplicate telegram notifications
- Bot sends exactly 1 notification per distribution (2 messages total)

Fixes issue where batch splitting (4 swaps) caused 4 duplicate
notifications per chat instead of 1."

git push
```

## Why This Is Better

### Old Approach (lastSwapTx)
- ❌ Tracks individual swap transactions
- ❌ Multiple swaps = multiple notifications
- ❌ Doesn't understand batch splitting concept
- ❌ Causes duplicates with batch harvesting

### New Approach (lastTaxDistribution)
- ✅ Tracks distribution events (not individual swaps)
- ✅ Multiple swaps = ONE distribution = ONE notification
- ✅ Understands batch splitting correctly
- ✅ No duplicates regardless of batch count

## Backend Compatibility

This fix requires the backend to expose `lastTaxDistribution` in the API response, which it already does:

```typescript
// backend/src/services/taxService.ts (line 1235)
taxState.lastTaxDistribution = Date.now();
```

The backend already sets this timestamp ONCE after all batches complete, making it the perfect indicator for distribution events!
