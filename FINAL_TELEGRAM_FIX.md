# Final Telegram Duplicate Fix

## Root Cause Identified!

The Railway logs show the telegram bot is detecting **TWO DIFFERENT** swap transaction hashes **1 minute apart**:

1. First: `5ML8L6ExLcbTMCTcvdGUYsTANjXjgkEFgiCdPfpLocrK1qBkxrh1zMPLwJkzE4so69pCfx6Efbyn9dRGmRn4B3pz`
2. Second: `2uXmiEb2YPghssXaMfXkQzi57VHvn6yKkX6mpd5QnY6jR6vWvvt1xpFoWs5LZRLRZaaaUHkTRADWzvzTsti2mFHc`

These are **TWO ACTUAL SEPARATE DISTRIBUTIONS** happening close together!

## Why This Happens

Looking at the backend configuration:

- **Backend scheduler interval:** 5 minutes (300 seconds)
- **Telegram bot polling interval:** 60 seconds (1 minute)
- **Batch harvest enabled:** Splits large amounts into 4 batches with 10-second delays

### Scenario

1. **Time 0:00** - Backend cycle 1 starts
2. **Time 0:05** - Backend cycle 1 completes, saves `lastSwapTx = '5ML8L6...'`
3. **Time 0:06** - Telegram bot polls → sees new swap → sends notification ✅
4. **Time 1:00** - Backend cycle 2 starts (5 minutes after cycle 1)
5. **Time 1:05** - Backend cycle 2 completes, saves `lastSwapTx = '2uXmiEb...'`
6. **Time 1:07** - Telegram bot polls → sees new swap → sends notification ✅

**Result:** User receives 2 messages per chat, 1 minute apart, because there are **2 legitimate distributions happening**!

## The Real Question

**Why are 2 distributions happening so close together?**

### Possibility 1: Render Environment Has Multiple Instances

Render might have auto-scaled or has 2 backend instances running:
- Instance 1 runs distribution at Time 0
- Instance 2 runs distribution at Time 1 (1 minute later)
- Result: 2 distributions within 5 minutes instead of every 5 minutes

**How to check:**
- Log into Render dashboard
- Check if multiple backend instances are running
- Look for "replicas" or "instances" setting

### Possibility 2: Backend Restarted During Distribution

If the backend restarted, it might have lost the `isRunning` flag:
- Backend starts distribution
- Backend crashes or restarts
- `isRunning` flag resets to `false`
- Backend starts ANOTHER distribution immediately
- Result: 2 distributions close together

### Possibility 3: Race Condition in Scheduler

The scheduler has a guard:
```typescript
if (isRunning) {
  logger.debug('Reward scheduler already running, skipping');
  return;
}
```

But if there's a race condition, two cycles could start simultaneously.

## Immediate Solutions

### Solution 1: Increase Backend Scheduler Interval (TEMPORARY FIX)

Change the backend to run less frequently:

```typescript
// backend/src/config/constants.ts
export const REWARD_CONFIG = {
  SCHEDULER_INTERVAL: 10 * 60 * 1000, // 10 minutes instead of 5
  MIN_REWARD_INTERVAL: 10 * 60 * 1000, // 10 minutes
  ...
}
```

This reduces the chance of overlapping cycles.

### Solution 2: Add Distributed Lock (PROPER FIX)

Implement a distributed lock using the reward-state.json file:

```typescript
// backend/src/scheduler/rewardScheduler.ts

interface LockState {
  isLocked: boolean;
  lockTime: number;
  lockId: string;
}

function acquireLock(): boolean {
  const state = loadState();
  const now = Date.now();
  const lockTimeout = 10 * 60 * 1000; // 10 minutes
  
  // Check if lock exists and is not expired
  if (state.lock && state.lock.isLocked) {
    if (now - state.lock.lockTime < lockTimeout) {
      return false; // Lock is held by another process
    }
    // Lock expired, can acquire
  }
  
  // Acquire lock
  state.lock = {
    isLocked: true,
    lockTime: now,
    lockId: crypto.randomBytes(8).toString('hex'),
  };
  
  saveState(state);
  return true;
}

function releaseLock(): void {
  const state = loadState();
  if (state.lock) {
    state.lock.isLocked = false;
  }
  saveState(state);
}

// In processRewards():
async function processRewards(): Promise<void> {
  // Try to acquire lock
  if (!acquireLock()) {
    logger.debug('Another instance is processing rewards, skipping');
    return;
  }
  
  try {
    // ... existing reward processing logic ...
  } finally {
    releaseLock();
  }
}
```

### Solution 3: Check Render Instance Count

1. Log into Render
2. Go to your backend service
3. Check "Instance Count" or "Replicas"
4. **Ensure it's set to 1, not 2 or auto-scale**

## Expected Behavior After Fix

- ✅ Backend runs every 5-10 minutes (single instance)
- ✅ Only ONE distribution per cycle
- ✅ Telegram sends 2 messages per distribution (1 per chat)
- ✅ No duplicates 1 minute apart

## Testing

After applying the fix:

1. Check Render logs for `[INFO] 🔄 Starting cycle execution`
2. Count how many times this appears in a 10-minute window
3. Should see: **1 time every 5-10 minutes**
4. Not: **2-3 times in a short period**

## Current Diagnosis Summary

**The telegram bot is working correctly!** It's detecting two legitimate backend distributions. The issue is:

1. **Either:** Backend has multiple instances running (check Render)
2. **Or:** Backend has a race condition causing double execution
3. **Or:** Backend configuration is causing rapid successive cycles

**Next Step:** Check Render dashboard for instance count!
