# Cycle Counting vs Epoch Counting - Complete Explanation

## Quick Answer

**Cycles work DIFFERENTLY from epochs:**

| Aspect | Epochs | Cycles |
|--------|--------|--------|
| **Storage** | ✅ Stored in file | ⚠️ Calculated from time |
| **Persists across restarts** | ✅ YES | ✅ YES (auto-calculated) |
| **Counter can drift** | ❌ NO | ❌ NO (based on clock) |
| **Can be manually adjusted** | ✅ YES | ❌ NO (auto-calculated) |

---

## How Cycle Counting Works

### Cycles Are CALCULATED, Not Counted

**File:** `backend/src/services/cycleService.ts` (Lines 85-94)

```typescript
function getCurrentCycleNumber(): number {
  const now = new Date();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  // Each cycle is 5 minutes
  const cycleNumber = Math.floor(totalMinutes / 5) + 1;
  return Math.min(cycleNumber, CYCLES_PER_EPOCH); // Cap at 288
}
```

**How it works:**

```
Current UTC Time: 12:35
Total minutes since midnight: 12 × 60 + 35 = 755 minutes
Cycle number: floor(755 ÷ 5) + 1 = 151 + 1 = 152

Result: Cycle 152 / 288
```

### Key Characteristics

✅ **Always accurate** - Based on system clock, not a counter  
✅ **Never drifts** - Recalculated every time it's needed  
✅ **Survives restarts** - Automatically correct after restart  
✅ **Self-correcting** - If server was down, resumes at correct cycle  

---

## What IS Stored in cycle-state.json

### Structure

```json
{
  "epochs": {
    "2026-01-11": {
      "epoch": "2026-01-11",
      "cycles": [
        {
          "epoch": "2026-01-11",
          "cycleNumber": 1,              ← Individual cycle result
          "state": "DISTRIBUTED",
          "timestamp": 1736553600000,
          "taxResult": { ... }
        },
        {
          "epoch": "2026-01-11",
          "cycleNumber": 2,              ← Individual cycle result
          "state": "ROLLED_OVER",
          "timestamp": 1736553900000
        }
        // ... more cycle results ...
      ],
      "createdAt": 1736553600000,
      "updatedAt": 1736640000000
    }
  },
  "currentEpoch": "2026-01-11",
  "currentCycleNumber": 152,            ← Cached, but recalculated on read
  "lastCycleTimestamp": 1736640000000
}
```

### What Each Field Means

1. **`epochs[date].cycles[]`** - ✅ **Historical cycle RESULTS**
   - Stores what happened in each executed cycle
   - Includes: cycle number, state, timestamp, tax results
   - Kept for analysis and display

2. **`currentCycleNumber`** - ⚠️ **Cached value (recalculated)**
   - Stored, but NOT trusted
   - Always recalculated from UTC time on startup
   - Used as a hint, not source of truth

3. **`lastCycleTimestamp`** - ✅ **Last execution time**
   - Timestamp of last cycle execution
   - Used to prevent duplicate executions
   - Persists across restarts

---

## Restart Scenarios

### Scenario 1: Restart During Same Cycle

**Before Restart:**
```
Time: 12:35 UTC
Epoch: 2026-01-11 (Epoch 3)
Cycle: 152 / 288
```

**Service Restarts at 12:37 UTC:**
```
1. Reads cycle-state.json ✅
2. getCurrentEpoch() = "2026-01-11" ✅
3. getCurrentCycleNumber() = floor((12*60 + 37) / 5) + 1 = 152 ✅
4. Resumes at: Epoch 3, Cycle 152 ✅
```

**Result:** Same cycle! No cycles missed.

---

### Scenario 2: Restart in Next Cycle

**Before Restart:**
```
Time: 12:33 UTC
Cycle: 151 / 288
Last execution: 12:30 UTC (Cycle 151)
```

**Service Down from 12:33 - 12:38**

**Restart at 12:38 UTC:**
```
1. Reads cycle-state.json ✅
2. getCurrentCycleNumber() = floor((12*60 + 38) / 5) + 1 = 152 ✅
3. Sees Cycle 152 hasn't been executed yet
4. Scheduler will execute Cycle 152 at next interval ✅
```

**Result:** Missed Cycle 151 execution (already passed), will execute Cycle 152.

---

### Scenario 3: Down for Multiple Cycles

**Before Shutdown:**
```
Time: 12:00 UTC
Cycle: 145 / 288
Last execution: 12:00 UTC
```

**Down from 12:00 - 14:00 UTC**

**Restart at 14:00 UTC:**
```
1. getCurrentCycleNumber() = floor((14*60) / 5) + 1 = 169 ✅
2. Missed cycles: 145, 146, 147, ... 168 (23 cycles)
3. Resumes at Cycle 169
4. Historical data will show gaps ⚠️
```

**Result:** System resumes at current cycle. Missed cycles are NOT backfilled.

---

## Cycle Results Storage

### What Gets Stored

Each time a cycle executes successfully, it records:

```typescript
export interface CycleResult {
  epoch: string;              // "2026-01-11"
  cycleNumber: number;        // 152
  state: CycleState;          // "DISTRIBUTED" | "ROLLED_OVER" | "FAILED"
  timestamp: number;          // 1736640000000
  error?: string;             // If failed
  taxResult?: {
    nukeHarvested: string;
    solToHolders: string;
    solToTreasury: string;
    distributedCount: number;
    swapSignature?: string;
  };
}
```

**Storage Code** (Lines 186-228):

```typescript
export function recordCycleResult(result: CycleResult): void {
  const state = loadCycleState();
  initializeEpoch(state);
  
  const currentEpoch = state.currentEpoch!;
  const epochState = state.epochs[currentEpoch];
  
  // Add cycle result ✅
  epochState.cycles.push(result);
  epochState.updatedAt = Date.now();
  state.lastCycleTimestamp = result.timestamp;
  
  // Keep only last 288 cycles per epoch (one full day)
  if (epochState.cycles.length > CYCLES_PER_EPOCH) {
    epochState.cycles = epochState.cycles.slice(-CYCLES_PER_EPOCH);
  }
  
  saveCycleState(state);
}
```

**Key Points:**
- ✅ Every executed cycle is recorded
- ✅ Results include cycle number, state, and tax data
- ✅ Limited to 288 cycles per epoch (one day)
- ✅ Persists across restarts

---

## Why Cycles Are Calculated Instead of Counted

### Advantages of Time-Based Calculation

1. **Never Drifts** ✅
   - A counter can increment incorrectly
   - Time-based calculation is always accurate

2. **Self-Healing** ✅
   - If server crashes and restarts, cycle number is correct
   - No need to "catch up" or adjust

3. **No Race Conditions** ✅
   - Multiple processes can't increment the same counter
   - Each process calculates independently

4. **Deterministic** ✅
   - Any observer can calculate the same cycle number
   - Based on objective UTC time, not state

### Example of Counter Problems (What We AVOID)

```
❌ If we used a counter:

Cycle counter: 150
Server crashes at 12:33 UTC

Restart at 14:00 UTC:
Counter still says 150
But it should be 169!
Result: Wrong cycle number ❌

✅ With time-based calculation:

Restart at 14:00 UTC:
getCurrentCycleNumber() = 169
Always correct! ✅
```

---

## Comparison Table

| Feature | Epochs | Cycles |
|---------|--------|--------|
| **How determined** | UTC date (YYYY-MM-DD) | UTC time (HH:MM) |
| **Calculation** | Count of dates in file | `floor(minutes / 5) + 1` |
| **Stored in file** | Yes (as keys) | Yes (as results) |
| **Current value stored** | Yes (currentEpoch) | Yes (currentCycleNumber) |
| **Trust stored value** | ⚠️ Recalculated | ⚠️ Recalculated |
| **Source of truth** | File + UTC date | UTC time only |
| **Resets daily** | No (increments) | Yes (at 00:00 UTC) |
| **Range** | 1, 2, 3, ... ∞ | 1-288 (repeats daily) |
| **Manual adjustment** | ✅ Possible | ❌ Auto-calculated |
| **Survives restarts** | ✅ Yes | ✅ Yes |
| **Can have gaps** | ✅ No gaps | ⚠️ Can have gaps if down |

---

## What Happens If System Is Down

### Epoch Handling

```
System down Jan 10 - Jan 12

Restart Jan 13:
- Reads file: Has epochs for Jan 9
- getCurrentEpoch() = "2026-01-13"
- Creates new epoch for Jan 13
- Epochs Jan 10, 11, 12 are MISSING
- Result: Epoch numbers will skip ⚠️
  
Epoch 1: Jan 9
Epoch 2: Jan 13  ← Gap!
```

**To fix:** Manually add missing epochs (see EPOCH_PERSISTENCE_LOGIC.md)

### Cycle Handling

```
System down 12:00 - 14:00 UTC

Restart:
- getCurrentCycleNumber() = 169
- Last recorded cycle: 145
- Cycles 146-168 are MISSING
- Result: Continue from Cycle 169 ✅
- Historical data has gaps ⚠️
```

**Cannot be backfilled** - Those cycles were never executed

---

## Monitoring Cycle Execution

### Check for Gaps

```bash
# Get cycle results for current epoch
curl https://nukerewards.imgprotocol.com/dashboard/cycles/epoch/2026-01-11 | jq '.cycles | length'

# Should have up to 288 cycles per epoch
# If less, some cycles haven't executed yet or were missed
```

### Check Last Execution

```bash
curl https://nukerewards.imgprotocol.com/dashboard/cycles/epoch/2026-01-11 | jq '.cycles[-1]'

# Shows last executed cycle:
{
  "epoch": "2026-01-11",
  "cycleNumber": 152,
  "state": "DISTRIBUTED",
  "timestamp": 1736640000000,
  ...
}
```

---

## Summary

### Epochs (Date-Based Counter)

- ✅ Stored in file as keys
- ✅ Count of epochs = epoch number
- ✅ Persists across restarts
- ✅ Can be manually adjusted
- ⚠️ Can have date gaps if system was down

### Cycles (Time-Based Calculator)

- ✅ **Current cycle = Calculated from UTC time**
- ✅ **Cycle results = Stored in file**
- ✅ **Always accurate after restart**
- ❌ **Cannot be manually adjusted**
- ⚠️ **Can have gaps if system was down during cycles**

### Both Together

```json
{
  "currentEpoch": "2026-01-11",        ← Date string (determines epoch number)
  "currentCycleNumber": 152,           ← Time-based (auto-calculated)
  "epochs": {
    "2026-01-11": {
      "cycles": [
        { "cycleNumber": 1, ... },     ← Historical results stored
        { "cycleNumber": 2, ... },
        ...
        { "cycleNumber": 152, ... }
      ]
    }
  }
}
```

**Key Insight:**
- **Epoch NUMBER** = Count of dates in file
- **Cycle NUMBER** = Calculated from time
- **Cycle RESULTS** = Stored in file

Both persist across restarts, but in different ways! ✅

---

## Final Answer

**Q: Does cycle counting also persist and get stored with epoch?**

**A: YES and NO (it's smarter than that!):**

✅ **Cycle RESULTS persist** - Every executed cycle is recorded in the file  
✅ **Cycle NUMBER persists** - But as a calculation, not a counter  
✅ **Survives restarts** - Always correct because it's calculated from UTC time  
❌ **Cannot manually adjust** - Always based on current time  
⚠️ **Can have gaps** - If system was down during cycles  

**This is actually BETTER than simple storage because:**
- Can never drift or become incorrect
- Self-heals after crashes
- No race conditions
- Always deterministic

**The system stores cycle RESULTS (what happened) but calculates cycle NUMBER (what time it is).** This combination gives you both historical data AND accurate real-time information! 🎯
