# Complete Epoch Counting Fix - January 11, 2026

## Problem Summary

The epoch counter was displaying incorrectly in **BOTH** the dashboard and Telegram bot, even though a partial fix was previously applied. While the current epoch number on the dashboard was fixed, the **distribution epoch number** in Telegram notifications remained broken.

---

## Root Cause Analysis

There were **TWO separate places** in the code calculating epoch numbers, but only ONE was fixed:

### Location 1: Current Epoch Number ✅ PREVIOUSLY FIXED

**File:** `backend/src/routes/dashboard.ts` (Lines 881-885)  
**Endpoint:** `GET /dashboard/cycles/current`

```typescript
// FIXED CODE (was updated earlier)
const allEpochs = getAllEpochStates();
const sortedOldestFirst = allEpochs.sort((a, b) => a.epoch.localeCompare(b.epoch));
const epochNumber = sortedOldestFirst.findIndex(e => e.epoch === epochInfo.epoch) + 1;
```

This correctly sorts epochs **oldest-first** before calculating the epoch number.

### Location 2: Last Distribution Epoch Number ❌ WAS STILL BROKEN

**File:** `backend/src/routes/dashboard.ts` (Lines 267-269)  
**Endpoint:** `GET /dashboard/rewards`

```typescript
// OLD CODE (BUGGY) - before this fix
lastDistributionEpochNumber: taxStats.lastDistributionEpoch 
  ? (getAllEpochStates().findIndex(e => e.epoch === taxStats.lastDistributionEpoch) + 1) || null
  : null,
```

**Why it failed:**

1. `getAllEpochStates()` returns epochs sorted **newest first** (descending):
   ```typescript
   // From cycleService.ts
   return Object.values(state.epochs).sort((a, b) => 
     b.epoch.localeCompare(a.epoch) // Newest first
   );
   ```

2. Example with 3 days of data:
   - Day 1: `2026-01-09`
   - Day 2: `2026-01-10`
   - Day 3: `2026-01-11` (current)

3. Array returned: `["2026-01-11", "2026-01-10", "2026-01-09"]`

4. When the last distribution was in epoch `2026-01-11`:
   - `findIndex` finds it at position **0**
   - Adding 1: `0 + 1 = 1` ❌
   - **Should be 3** ✅

---

## The Complete Fix

```typescript
// NEW CODE (FIXED)
lastDistributionEpochNumber: taxStats.lastDistributionEpoch 
  ? (() => {
      const allEpochs = getAllEpochStates();
      const sortedOldestFirst = allEpochs.sort((a, b) => a.epoch.localeCompare(b.epoch));
      return sortedOldestFirst.findIndex(e => e.epoch === taxStats.lastDistributionEpoch) + 1;
    })() || null
  : null,
```

**What changed:**

1. Wrapped in an IIFE (Immediately Invoked Function Expression) to keep the logic contained
2. Gets all epochs
3. **Sorts oldest-first** (ascending): `["2026-01-09", "2026-01-10", "2026-01-11"]`
4. Finds the index of the last distribution epoch
5. Adds 1 to convert from 0-based index to 1-based epoch number

**Now the calculation works:**
- Array: `["2026-01-09", "2026-01-10", "2026-01-11"]`
- `findIndex("2026-01-11")` = **2**
- Add 1: `2 + 1 = 3` ✅

---

## How Epochs Work (Reminder)

### What is an Epoch?
An epoch represents one full day (24 hours) in UTC time:
- Starts at **00:00 UTC**
- Ends at **23:59 UTC**
- Numbered sequentially (Epoch 1, Epoch 2, etc.)

### What are Cycles?
Within each epoch, there are **288 cycles**:
- Each cycle lasts **5 minutes**
- Calculation: 24 hours × 60 minutes ÷ 5 minutes = 288 cycles
- Cycles are numbered 1-288 within each epoch

### Example
If you check at **14:35 UTC on Day 3**:
- **Epoch:** 3 (third day since launch)
- **Cycle:** 175 / 288 (approximately 14.5 hours into the day)
- **Calculation:** `floor(14 × 60 + 35) ÷ 5) + 1 = floor(875 ÷ 5) + 1 = 175`

---

## Impact of This Bug

### Before the Fix

1. **Dashboard Current Epoch:** ✅ Correctly showed Epoch 3 (was fixed earlier)
2. **Telegram Distribution Messages:** ❌ Showed "Epoch: 1" (still broken)
3. **Telegram `/rewards` Command:** ❌ Showed "Current Epoch: 1" (still broken)

### Why This Mattered

The Telegram bot uses the `/dashboard/rewards` endpoint to display:
- Distribution notifications (when rewards are sent)
- The `/rewards` command (check current status)

Both of these use `lastDistributionEpochNumber`, which was still calculated incorrectly.

### User Experience Impact

**What users saw:**
```
🎉 Reward Distribution Complete!

💰 Total SOL: 0.123456
📊 Distributions: 15
*Epoch:* 1         ← WRONG!
*Cycle:* 145 / 288 ← Correct
*Time:* 2026-01-11 12:15:00 UTC
```

**What users should see (after fix):**
```
🎉 Reward Distribution Complete!

💰 Total SOL: 0.123456
📊 Distributions: 15
*Epoch:* 3         ← NOW CORRECT!
*Cycle:* 145 / 288 ← Correct
*Time:* 2026-01-11 12:15:00 UTC
```

---

## Files Modified

### 1. `backend/src/routes/dashboard.ts`

**Location:** Lines 265-273

**Change:** Updated the calculation of `lastDistributionEpochNumber` to sort epochs oldest-first before finding the index.

---

## Testing the Fix

### Step 1: Check Current State File

```bash
cd /home/van/reward-project
cat cycle-state.json | jq '.epochs | keys'
```

This shows all epoch dates stored. Count them to know what epoch number to expect.

**Example output:**
```json
[
  "2026-01-09",
  "2026-01-10",
  "2026-01-11"
]
```
→ Current epoch should be **3**

### Step 2: Rebuild and Restart Backend

```bash
cd /home/van/reward-project/backend
npm run build
pm2 restart nuke-backend
```

### Step 3: Test Dashboard API

```bash
# Test current epoch endpoint
curl http://localhost:3001/dashboard/cycles/current | jq '.epochNumber'

# Test rewards endpoint (for telegram)
curl http://localhost:3001/dashboard/rewards | jq '.tax.lastDistributionEpochNumber'
```

Both should return the same epoch number (e.g., 3).

### Step 4: Test Telegram Bot

Restart the bot and check the `/rewards` command:

```bash
pm2 restart nuke-telegram-bot
```

In Telegram, send `/rewards` and verify the epoch number is correct.

### Step 5: Wait for Next Distribution

When the next cycle executes and distributes rewards, check the Telegram notification. It should show the correct epoch number.

---

## Why Both Calculations Were Needed

You might wonder: "Why not just use `getCurrentEpochInfo().epochNumber` everywhere?"

**Answer:** They serve different purposes:

1. **Current Epoch Number** (`/cycles/current`):
   - Shows what epoch we're in **right now**
   - Used by dashboard to display "Current Epoch"
   - Always shows today's epoch

2. **Last Distribution Epoch Number** (`/rewards`):
   - Shows what epoch the **last distribution** occurred in
   - Could be today, yesterday, or never
   - Important for historical tracking in Telegram

**Example scenario:**
- Current time: `2026-01-11 02:00 UTC` (Epoch 3, Cycle 24)
- Last distribution: `2026-01-10 23:55 UTC` (Epoch 2, Cycle 288)

Dashboard would show:
- Current Epoch: **3** ← from `/cycles/current`
- Last Distribution in Epoch: **2** ← from `/rewards`

---

## Verification Checklist

After deploying this fix, verify:

- [ ] Dashboard shows correct current epoch number
- [ ] Telegram `/rewards` command shows correct current epoch number
- [ ] Telegram distribution notifications show correct epoch number
- [ ] Epoch number increments at 00:00 UTC when crossing midnight
- [ ] Epoch number matches the count of epochs in `cycle-state.json`

---

## Summary

**What was fixed:**
- The `lastDistributionEpochNumber` calculation in the `/dashboard/rewards` endpoint

**Why it matters:**
- Telegram bot now correctly displays epoch numbers in all messages

**Impact:**
- Users can now properly track which epoch distributions occurred in
- Historical data makes more sense
- System appears more professional and trustworthy

**Deployment:**
```bash
cd /home/van/reward-project/backend
npm run build
pm2 restart nuke-backend
pm2 restart nuke-telegram-bot
```

---

## Related Documentation

- `EPOCH_NUMBER_FIX_2026_01_11.md` - Previous fix for current epoch number
- `EPOCH_NUMBER_VISUAL_EXPLANATION.md` - Visual explanation of how epochs work
- `EPOCH_PERSISTENCE_EXPLAINED.md` - How epoch data is stored
