# Cycle Number Fix for Telegram Notifications

## Problem

The Telegram bot was reporting incorrect cycle numbers in distribution notifications.

**Example:**
- **Cycle 174** (2:20-2:25 PM): Distribution occurred → 0.703065 SOL
- **Telegram notification** (2:27 PM): Reported "Cycle 175" ❌ (should be 174)
- **Cycle 175** (2:30-2:35 PM): Rolled over (insufficient tax)
- **Dashboard**: Correctly shows Cycle 175 as "Rolled Over" ✅

**Root Cause:**
The telegram bot fetched the **current** cycle number at notification time, not the cycle when distribution occurred. Due to polling delays, the current cycle had already advanced.

---

## Solution

Store the cycle number and epoch WITH the distribution data, so telegram always reports the accurate cycle.

---

## Changes Made

### 1. Backend: Tax Service (`backend/src/services/taxService.ts`)

**Added new fields to `TaxState` interface:**
```typescript
interface TaxState {
  // ... existing fields ...
  lastDistributionCycleNumber: number | null; // NEW: Cycle number when distribution occurred
  lastDistributionEpoch: string | null; // NEW: Epoch when distribution occurred
  // ... rest of fields ...
}
```

**Updated `processWithheldTax` to accept cycle info:**
```typescript
static async processWithheldTax(epoch?: string, cycleNumber?: number): Promise<TaxDistributionResult | null>
```

**Store cycle info when distribution occurs:**
```typescript
taxState.lastDistributionCycleNumber = cycleNumber || null;
taxState.lastDistributionEpoch = epoch || null;
```

**Updated `getTaxStatistics` to return new fields:**
```typescript
static getTaxStatistics(): {
  // ... existing fields ...
  lastDistributionCycleNumber: number | null;
  lastDistributionEpoch: string | null;
  // ... rest of fields ...
}
```

---

### 2. Backend: Scheduler (`backend/src/scheduler/rewardScheduler.ts`)

**Pass cycle info to tax service:**
```typescript
taxResult = await TaxService.processWithheldTax(epoch, cycleNumber);
```

---

### 3. Backend: Dashboard API (`backend/src/routes/dashboard.ts`)

**Include new fields in `/dashboard/rewards` response:**
```typescript
tax: {
  // ... existing fields ...
  lastDistributionCycleNumber: taxStats.lastDistributionCycleNumber,
  lastDistributionEpoch: taxStats.lastDistributionEpoch,
  lastDistributionEpochNumber: taxStats.lastDistributionEpoch 
    ? (getAllEpochStates().findIndex(e => e.epoch === taxStats.lastDistributionEpoch) + 1) || null
    : null,
  // ... rest of fields ...
}
```

---

### 4. Telegram Bot (`telegram-bot/src/index.ts`)

**Updated `RewardApiResponse` type:**
```typescript
tax?: {
  // ... existing fields ...
  lastDistributionCycleNumber: number | null;
  lastDistributionEpoch: string | null;
  lastDistributionEpochNumber: number | null;
  // ... rest of fields ...
};
```

**Use stored cycle number instead of current:**
```typescript
// Use the stored cycle number from when distribution occurred, not current cycle
const distributionCycleNumber = rewards.tax.lastDistributionCycleNumber || cycleInfo.cycleNumber;
const distributionEpochNumber = rewards.tax.lastDistributionEpochNumber || cycleInfo.epochNumber;

// In notification message:
messageLines.push(`*Epoch:* ${distributionEpochNumber}`);
messageLines.push(`*Cycle:* ${distributionCycleNumber} / ${cycleInfo.cyclesPerEpoch}`);
```

---

## How It Works

### Before (Incorrect):
1. **2:27 PM:** Distribution happens in Cycle 174
2. **2:27 PM:** `lastTaxDistribution` timestamp updated
3. **2:27 PM:** Telegram bot polls and detects new distribution
4. **2:27 PM:** Bot calls `/dashboard/cycles/current` → Returns Cycle 175 (already started at 2:25 PM)
5. **2:27:57 PM:** Bot sends notification with **Cycle 175** ❌

### After (Correct):
1. **2:27 PM:** Distribution happens in Cycle 174
2. **2:27 PM:** `lastTaxDistribution` timestamp updated
3. **2:27 PM:** `lastDistributionCycleNumber` = **174** stored ✅
4. **2:27 PM:** `lastDistributionEpoch` = "2026-01-09" stored ✅
5. **2:27 PM:** Telegram bot polls and detects new distribution
6. **2:27 PM:** Bot reads `lastDistributionCycleNumber` = **174**
7. **2:27:57 PM:** Bot sends notification with **Cycle 174** ✅

---

## Testing

After deployment, verify:

1. **Wait for next distribution** (when tax threshold is met)
2. **Check Telegram notification:**
   - Cycle number should match the actual cycle when distribution occurred
   - Epoch number should be correct
3. **Check Dashboard:**
   - The cycle shown as "Distributed" should match telegram notification
   - No more mismatches between dashboard and telegram

---

## Deployment Steps

```bash
cd /home/van/reward-project

# Build backend
cd backend
npm run build

# Build telegram bot
cd ../telegram-bot
npm run build

# Commit and push
cd ..
git add backend/src/services/taxService.ts
git add backend/src/scheduler/rewardScheduler.ts
git add backend/src/routes/dashboard.ts
git add telegram-bot/src/index.ts
git add CYCLE_NUMBER_FIX.md
git add CYCLE_MISMATCH_ANALYSIS.md

git commit -m "fix: telegram bot now reports correct cycle number for distributions

- Store cycle number and epoch when distribution occurs
- Telegram uses stored cycle number instead of current cycle
- Fixes mismatch where telegram reported wrong cycle due to polling delay
- Example: Cycle 174 distributed, telegram now correctly shows 174 (not 175)

Resolves cycle number mismatch between dashboard and telegram notifications"

git push
```

---

## Files Modified

1. `backend/src/services/taxService.ts` - Store cycle info with distribution
2. `backend/src/scheduler/rewardScheduler.ts` - Pass cycle info to tax service
3. `backend/src/routes/dashboard.ts` - Include cycle info in API response
4. `telegram-bot/src/index.ts` - Use stored cycle number for notifications

---

## Backward Compatibility

✅ **Fully backward compatible**
- New fields are optional (`|| null`)
- Existing distributions without stored cycle will fall back to current cycle
- No breaking changes to API or state files
- Old state files will automatically upgrade with new fields on next distribution

---

## Summary

**Before:** Telegram showed whatever cycle was current at notification time
**After:** Telegram shows the exact cycle when distribution occurred

This ensures perfect accuracy and eliminates confusion between dashboard and telegram notifications! 🎯
