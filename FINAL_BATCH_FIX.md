# Final Fix for Batch Splitting Duplicate Notifications

## Problem

The telegram bot was still sending duplicate notifications even after tracking `lastTaxDistribution` timestamp. This happened because:

1. Backend runs multiple distribution cycles close together (every 5 minutes)
2. Each cycle has a different timestamp
3. Bot sees different timestamps and thinks they're new distributions
4. Result: Multiple notifications for what appears to be the same distribution amounts

## Root Cause

The bot was ONLY checking if the **timestamp changed**, but not if the **distribution data itself changed**.

**Scenario:**
- Time 10:00 - Distribution 1: 0.5 SOL to holders, 0.15 SOL to treasury
- Time 10:05 - Distribution 2: 0.5 SOL to holders, 0.15 SOL to treasury (SAME amounts!)
- Bot sees different timestamps → sends 2 notifications
- But the amounts are the SAME → user sees "duplicates"

## Solution

Added **distribution hash** to detect true duplicates:

```typescript
// Create unique hash of distribution data
const distributionHash = crypto.createHash('sha256')
  .update(`${totalSolDistributed}-${totalSolToTreasury}-${distributionCount}`)
  .digest('hex')
  .substring(0, 16);

// Check if we've already notified about this EXACT distribution
if (lastDistributionHash === distributionHash) {
  // Skip - already notified
  return;
}
```

**How it works:**
- Hash includes: `totalSolDistributed`, `totalSolToTreasury`, `distributionCount`
- If these values are IDENTICAL, hash is the same → skip notification
- If ANY value changes, hash is different → send notification

## Changes Made

### 1. Added crypto import
```typescript
import crypto from 'crypto';
```

### 2. Generate distribution hash
```typescript
const distributionHash = crypto.createHash('sha256')
  .update(`${rewards.tax.totalSolDistributed}-${rewards.tax.totalSolToTreasury}-${rewards.tax.distributionCount}`)
  .digest('hex')
  .substring(0, 16);
```

### 3. Check hash before notifying
```typescript
if (lastState.lastDistributionHash === distributionHash) {
  console.log('[AutoRewards] Skipping - already notified about this distribution');
  return { message: null, lastDistributionTime: currentDistributionTime };
}
```

### 4. Save hash to state
```typescript
updateState({ 
  lastDistributionTime,
  lastDistributionHash: distributionHash 
});
```

### 5. Added to state interface
```typescript
interface NotificationState {
  lastDistributionTime?: number;
  lastDistributionHash?: string; // NEW
}
```

## How It Works With Batch Splitting

**Batch splitting (4 swaps):**
1. Backend harvests 50,000 NUKE
2. Splits into 4 batches
3. Swaps all 4 batches → gets total 2.5 SOL
4. Distributes 1.875 SOL to holders, 0.625 SOL to treasury
5. Sets `totalSolDistributed = 1875000000`, `totalSolToTreasury = 625000000`
6. Bot creates hash: `sha256("1875000000-625000000-9")` = `abc123...`
7. Bot checks: `lastHash !== "abc123..."` → NEW distribution!
8. Bot sends notification ✅
9. Bot saves hash: `"abc123..."`

**Next poll (1 minute later):**
1. Bot fetches data again
2. Still shows: `totalSolDistributed = 1875000000`, `totalSolToTreasury = 625000000`
3. Bot creates hash: `sha256("1875000000-625000000-9")` = `abc123...`
4. Bot checks: `lastHash === "abc123..."` → ALREADY NOTIFIED!
5. Bot skips notification ✅

## Expected Behavior

- ✅ **1 notification per unique distribution** (based on amounts, not timestamp)
- ✅ **2 messages total** (1 group + 1 private)
- ✅ **No duplicates** even if backend runs multiple cycles with same amounts
- ✅ **Works with batch splitting** (4 batches = 1 notification)
- ✅ **Survives bot restarts** (hash persisted to disk)

## Deployment

```bash
cd /home/van/reward-project

git add telegram-bot/src/index.ts
git add telegram-bot/src/state/notificationState.ts
git add FINAL_BATCH_FIX.md

git commit -m "fix: use distribution hash to prevent duplicate notifications

- Added distribution data hash (totalSolDistributed + totalSolToTreasury + distributionCount)
- Bot now checks if distribution DATA changed, not just timestamp
- Prevents duplicate notifications when backend runs multiple cycles with same amounts
- Works correctly with batch splitting (4 swaps = 1 notification)
- Hash persisted to disk to survive bot restarts

Final fix for duplicate telegram notifications issue."

git push
```

## Testing

After deployment:

1. Wait for distribution
2. Check Railway logs:
   ```
   [AutoRewards] New distribution detected
   distributionHash: 'abc123...'
   [AutoRewards] Sent notification (2 messages)
   ```

3. Wait 1 minute (next poll)
4. Check logs:
   ```
   [AutoRewards] Skipping - already notified about this distribution
   distributionHash: 'abc123...'
   ```

5. **No duplicate messages!** ✅

## Why This Is The Final Fix

This approach is **bulletproof** because:

1. ✅ **Ignores timestamp changes** (backend can run multiple cycles)
2. ✅ **Detects actual data changes** (new distribution = new hash)
3. ✅ **Works with batch splitting** (multiple swaps, one hash)
4. ✅ **Persists across restarts** (hash saved to disk)
5. ✅ **Simple and reliable** (no complex timing logic)

The bot now asks: "Have the distribution AMOUNTS changed?" instead of "Has the timestamp changed?"

This is the correct question to ask! 🎉
