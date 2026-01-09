# Cycle 175 Mismatch Analysis

## The Problem

**Dashboard shows:**
- Cycle 175
- Status: "Rolled Over (Insufficient Tax)"
- Time: 2:32 PM UTC
- Epoch: Jan 9, 2026

**Telegram shows:**
- Cycle 175
- Status: "💰 NUKE Rewards Distributed"
- Time: 14:27:57 (2:27 PM UTC)
- Total: 0.703065 SOL distributed

**Mismatch:** Same cycle number, different status, 5 minutes apart

---

## Root Cause Analysis

### Code Flow

**File:** `backend/src/scheduler/rewardScheduler.ts` (lines 108-143)

```typescript
taxResult = await TaxService.processWithheldTax();

if (taxResult) {
  // DISTRIBUTED: Successful harvest + distribution
  cycleResult.state = CycleState.DISTRIBUTED;
  // ... log success
} else {
  // ROLLED_OVER: Minimum tax not met
  cycleResult.state = CycleState.ROLLED_OVER;
  // ... log rollover
}

recordCycleResult(cycleResult); // Save to cycle-state.json
```

**File:** `backend/src/services/taxService.ts` (lines 765-774)

```typescript
const thresholdMet = await TaxService.checkMinimumTaxThreshold(totalAvailable, decimals);

if (!thresholdMet) {
  logger.info('Tax below minimum threshold, rolling over');
  return null; // → Causes ROLLED_OVER state
}
// If threshold met, continue with harvest → Causes DISTRIBUTED state
```

**File:** `telegram-bot/src/index.ts` (lines 89-111)

```typescript
// Telegram tracks lastTaxDistribution timestamp
if (!rewards.tax || !rewards.tax.lastTaxDistribution) {
  return { message: null, lastDistributionTime: null };
}

// If timestamp changed, send notification
if (currentDistributionTimeRounded !== lastKnownDistributionTimeRounded) {
  // Send "NUKE Rewards Distributed" message
}
```

---

## The Hypothesis

### Scenario 1: Two Different Cycles (Most Likely)

**Cycle 174 or earlier (around 2:27 PM):**
- Tax threshold WAS met
- Distribution occurred → 0.703065 SOL distributed
- `lastTaxDistribution` timestamp updated
- Telegram bot saw this and sent notification
- **But:** Telegram incorrectly reported this as "Cycle 175"

**Cycle 175 (at 2:32 PM):**
- Tax threshold was NOT met
- No distribution occurred
- Cycle marked as ROLLED_OVER
- Dashboard correctly shows Cycle 175 as "Rolled Over"

**Problem:** Telegram bot's cycle number detection is off by one or more cycles.

---

### Scenario 2: Cycle State Overwrite (Less Likely)

**At 2:27 PM:**
- Cycle 175 was processed
- Distribution occurred
- Telegram notified

**At 2:32 PM:**
- Same cycle 175 was processed AGAIN
- This time, rolled over
- State was overwritten in `cycle-state.json`

**Problem:** The scheduler ran twice for the same cycle, which shouldn't happen.

---

## Evidence to Check

### 1. Check Render Logs for Cycle 175

Look for:
```
[INFO] 🔄 Starting cycle execution {"epoch":"2026-01-09","cycleNumber":175,...}
```

Should show:
- Did cycle 175 run once or twice?
- What was the actual state recorded?
- What was the timestamp?

### 2. Check `lastTaxDistribution` Timestamp

The telegram notification at 2:27:57 means `lastTaxDistribution` was updated at that time.

Check:
- What cycle number was being executed when `lastTaxDistribution` was set to 2:27 PM?
- Was it cycle 174, 175, or another?

### 3. Check Cycle Number Calculation

**File:** `backend/src/services/cycleService.ts` (lines 73-82)

```typescript
function getCurrentCycleNumber(): number {
  const now = new Date();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  // Each cycle is 5 minutes
  const cycleNumber = Math.floor(totalMinutes / 5) + 1;
  return Math.min(cycleNumber, 288);
}
```

At **2:27 PM** (14:27 UTC):
- totalMinutes = 14 * 60 + 27 = 867
- cycleNumber = floor(867 / 5) + 1 = 173 + 1 = **174**

At **2:32 PM** (14:32 UTC):
- totalMinutes = 14 * 60 + 32 = 872
- cycleNumber = floor(872 / 5) + 1 = 174 + 1 = **175**

**This confirms:**
- At 2:27 PM → Should be Cycle 174
- At 2:32 PM → Should be Cycle 175

**So the telegram notification saying "Cycle: 175" at 2:27 PM is WRONG!**

---

## The Actual Issue

### Telegram Bot Cycle Number Detection is Incorrect

**File:** `telegram-bot/src/index.ts` (line 176)

```typescript
// Fetch current cycle info for epoch and cycle number
const cycleInfoResponse = await axios.get<CurrentCycleInfoResponse>(
  `${backendUrl}/dashboard/cycles/current`, 
  { timeout: 30000 }
);
const cycleInfo = cycleInfoResponse.data;

messageLines.push(`*Cycle:* ${cycleInfo.cycleNumber} / ${cycleInfo.cyclesPerEpoch}`);
```

**The Problem:**
The telegram bot fetches `/dashboard/cycles/current` which returns the **CURRENT** cycle number at the time of the API call, NOT the cycle number when the distribution occurred.

**Timeline:**
1. **2:27 PM:** Distribution happens in Cycle 174, `lastTaxDistribution` updated
2. **2:27 PM:** Telegram bot polls and sees new `lastTaxDistribution`
3. **2:27 PM:** Bot calls `/dashboard/cycles/current` to get cycle info
4. **2:27:57 PM:** By now, it's already Cycle 175 (started at 2:25 PM)
5. **2:27:57 PM:** Bot sends notification with Cycle 175 (wrong!)

**Actual Distribution:**
- Happened in Cycle 174 (2:20-2:25 PM range)
- Telegram incorrectly reported as Cycle 175

**Dashboard:**
- Cycle 175 (2:25-2:30 PM) correctly shown as "Rolled Over"

---

## The Fix

### Option 1: Store Cycle Number with Distribution

**Modify:** `backend/src/services/taxService.ts`

When updating `taxState.lastTaxDistribution`, also store the cycle number:

```typescript
taxState.lastTaxDistribution = Date.now();
taxState.lastDistributionCycleNumber = currentCycleNumber; // NEW
```

**Modify:** `telegram-bot/src/index.ts`

Use the stored cycle number instead of fetching current:

```typescript
const distributionCycleNumber = rewards.tax.lastDistributionCycleNumber || cycleInfo.cycleNumber;
messageLines.push(`*Cycle:* ${distributionCycleNumber} / ${cycleInfo.cyclesPerEpoch}`);
```

### Option 2: Calculate Cycle from Timestamp

**Modify:** `telegram-bot/src/index.ts`

Calculate the cycle number from the distribution timestamp:

```typescript
function getCycleNumberFromTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  return Math.floor(totalMinutes / 5) + 1;
}

const distributionCycleNumber = getCycleNumberFromTimestamp(currentDistributionTime);
messageLines.push(`*Cycle:* ${distributionCycleNumber} / 288`);
```

### Option 3: Use Last Distribution from Cycle State (Recommended)

**Modify:** `telegram-bot/src/index.ts`

Instead of using `/dashboard/cycles/current`, fetch the last DISTRIBUTED cycle from `/dashboard/cycles/{epoch}` and use that cycle number.

```typescript
// Fetch epoch cycles to find the last DISTRIBUTED cycle
const epochResponse = await axios.get(`${backendUrl}/dashboard/cycles/${epochInfo.epoch}`);
const cycles = epochResponse.data.cycles;

// Find the most recent DISTRIBUTED cycle
const lastDistributed = cycles
  .filter(c => c.state === 'DISTRIBUTED')
  .sort((a, b) => b.timestamp - a.timestamp)[0];

if (lastDistributed) {
  messageLines.push(`*Cycle:* ${lastDistributed.cycleNumber} / 288`);
}
```

---

## Recommendation

**Implement Option 1** (Store Cycle Number with Distribution) as it's:
- ✅ Most accurate
- ✅ Simplest implementation
- ✅ No additional API calls needed
- ✅ No timing issues

This ensures the telegram notification always shows the correct cycle number that the distribution occurred in, not the current cycle at notification time.

---

## Summary

**What Happened:**
- Cycle 174 (around 2:27 PM): Distribution occurred → 0.703065 SOL
- Telegram bot saw this and sent notification
- But telegram fetched "current cycle" which was already 175
- Telegram incorrectly reported "Cycle 175" distributed

- Cycle 175 (2:32 PM): No distribution, rolled over
- Dashboard correctly shows Cycle 175 as "Rolled Over"

**The Fix:**
Store the cycle number when the distribution occurs, so telegram can report the accurate cycle number.
