# Epoch Number Fix - January 11, 2026

## Problem Summary

The epoch counter was stuck at **Epoch 1** on both the dashboard and Telegram, even after running for multiple days. The cycles were counting correctly (1-288), but the epoch number wasn't incrementing when a new UTC day started.

## Root Cause

The bug was in `backend/src/routes/dashboard.ts` at the epoch number calculation logic.

### The Issue

```typescript
// OLD CODE (BUGGY)
const allEpochs = getAllEpochStates();
const epochNumber = allEpochs.findIndex(e => e.epoch === epochInfo.epoch) + 1;
```

**Why it failed:**

1. `getAllEpochStates()` returns epochs sorted **newest first** (descending order):
   ```typescript
   // From cycleService.ts
   return Object.values(state.epochs).sort((a, b) => 
     b.epoch.localeCompare(a.epoch) // Newest first
   );
   ```

2. Example: If you have 3 days of data:
   - Day 1: `2026-01-09`
   - Day 2: `2026-01-10`
   - Day 3: `2026-01-11` (current)

3. The array becomes: `["2026-01-11", "2026-01-10", "2026-01-09"]`

4. When searching for current epoch "2026-01-11":
   - `findIndex` finds it at position **0**
   - Adding 1 gives: `0 + 1 = 1` ❌
   - But it should be: **3** ✅

## The Fix

```typescript
// NEW CODE (FIXED)
const allEpochs = getAllEpochStates();
const sortedOldestFirst = allEpochs.sort((a, b) => a.epoch.localeCompare(b.epoch));
const epochNumber = sortedOldestFirst.findIndex(e => e.epoch === epochInfo.epoch) + 1;
```

**How it works now:**

1. Sort epochs **oldest first** (ascending order): `["2026-01-09", "2026-01-10", "2026-01-11"]`
2. Find current epoch "2026-01-11" → position **2**
3. Add 1: `2 + 1 = 3` ✅

## How Epochs Work (For Reference)

### Epoch Creation

Epochs are automatically created in `cycleService.ts`:

```typescript
function initializeEpoch(state: CycleServiceState): void {
  const currentEpoch = getCurrentEpoch(); // e.g., "2026-01-11"
  const currentCycleNumber = getCurrentCycleNumber(); // 1-288

  // Check if we need to reset to a new epoch
  if (shouldResetEpoch(state.currentEpoch)) {
    logger.info('🔄 Epoch reset detected', {
      previousEpoch: state.currentEpoch,
      newEpoch: currentEpoch,
      cycleNumber: currentCycleNumber,
    });

    // Initialize new epoch
    state.currentEpoch = currentEpoch;
    state.currentCycleNumber = 1; // Reset to cycle 1 at epoch start

    // Create new epoch state if it doesn't exist
    if (!state.epochs[currentEpoch]) {
      state.epochs[currentEpoch] = {
        epoch: currentEpoch,
        cycles: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
  }
}
```

### Epoch Reset Logic

```typescript
function shouldResetEpoch(currentEpoch: string | null): boolean {
  if (currentEpoch === null) {
    return true; // First run
  }
  const nowEpoch = getCurrentEpoch(); // Gets current UTC date as "YYYY-MM-DD"
  return nowEpoch !== currentEpoch; // Reset if date changed
}
```

### Current Epoch Detection

```typescript
function getCurrentEpoch(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // e.g., "2026-01-11"
}
```

## Verification

After deploying this fix:

1. **If you have multiple epochs in `cycle-state.json`:**
   - The epoch number will immediately show the correct count (2, 3, 4, etc.)

2. **If you only have one epoch:**
   - The epoch number will correctly show 1 for the first day
   - Tomorrow at 00:00 UTC, it will automatically increment to 2

3. **What to check:**
   - Dashboard: Look for "Epoch: X" in the Processing section
   - Telegram: Distribution messages show "Epoch: X"
   - Both should match and increment daily

## How to Verify State File

To see how many epochs you currently have stored:

```bash
# On your server
cd /home/van/reward-project
cat cycle-state.json | jq '.epochs | keys'
```

Example output:
```json
[
  "2026-01-09",
  "2026-01-10",
  "2026-01-11"
]
```

This would mean you have 3 epochs stored, so the epoch number should display **3**.

## Expected Behavior

| UTC Date | Epoch String | Epoch Number | Cycle Numbers |
|----------|--------------|--------------|---------------|
| 2026-01-09 | `2026-01-09` | 1 | 1-288 |
| 2026-01-10 | `2026-01-10` | 2 | 1-288 |
| 2026-01-11 | `2026-01-11` | 3 | 1-288 |
| 2026-01-12 | `2026-01-12` | 4 | 1-288|

## Files Modified

- ✅ `backend/src/routes/dashboard.ts` - Fixed epochNumber calculation

## Deployment

After committing this fix, restart your backend:

```bash
cd /home/van/reward-project/backend
npm run build
pm2 restart reward-backend
```

The Telegram bot and frontend don't need changes - they already consume the corrected `epochNumber` from the API.

## Testing

You can test the epoch number immediately by checking:

1. **Dashboard API:**
   ```bash
   curl http://localhost:3000/api/dashboard/cycles/current | jq
   ```

2. **Expected Response:**
   ```json
   {
     "epoch": "2026-01-11",
     "epochNumber": 3,  // Should match the number of epochs in state file
     "cycleNumber": 145,
     "nextCycleIn": 120000,
     "nextCycleInSeconds": 120,
     "cyclesPerEpoch": 288
   }
   ```

## Notes

- ✅ The epoch **date** was always working correctly (changing daily at 00:00 UTC)
- ✅ The cycle counting was always working correctly (1-288 per day)
- ❌ Only the epoch **number** display was broken (stuck at 1)
- ✅ This fix corrects the epoch number calculation without affecting any other functionality

---

**Status:** ✅ FIXED
**Date:** 2026-01-11
**Impact:** Dashboard and Telegram will now show correct epoch numbers
