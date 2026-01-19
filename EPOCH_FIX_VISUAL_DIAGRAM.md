# Epoch Counting Fix - Visual Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       cycle-state.json                          │
│                                                                 │
│  {                                                             │
│    "epochs": {                                                 │
│      "2026-01-09": { cycles: [...], ... },  ← Epoch 1        │
│      "2026-01-10": { cycles: [...], ... },  ← Epoch 2        │
│      "2026-01-11": { cycles: [...], ... }   ← Epoch 3        │
│    },                                                          │
│    "currentEpoch": "2026-01-11",                              │
│    "currentCycleNumber": 145                                   │
│  }                                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Read by cycleService.ts
                              ▼
                    getAllEpochStates()
                              │
                              │ Returns newest-first:
                              │ ["2026-01-11", "2026-01-10", "2026-01-09"]
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌─────────────────────┐                  ┌─────────────────────┐
│  /cycles/current    │                  │   /rewards          │
│  (Dashboard API)    │                  │  (Telegram API)     │
└─────────────────────┘                  └─────────────────────┘
        │                                           │
        │ ✅ FIXED EARLIER                         │ ❌ WAS BROKEN
        │                                           │ ✅ NOW FIXED
        ▼                                           ▼
┌─────────────────────┐                  ┌─────────────────────┐
│ Sort oldest-first   │                  │ Sort oldest-first   │
│ ["2026-01-09",      │                  │ ["2026-01-09",      │
│  "2026-01-10",      │                  │  "2026-01-10",      │
│  "2026-01-11"]      │                  │  "2026-01-11"]      │
└─────────────────────┘                  └─────────────────────┘
        │                                           │
        │ findIndex("2026-01-11") = 2              │ findIndex("2026-01-11") = 2
        │ epochNumber = 2 + 1 = 3 ✅               │ epochNumber = 2 + 1 = 3 ✅
        │                                           │
        ▼                                           ▼
┌─────────────────────┐                  ┌─────────────────────┐
│    Dashboard        │                  │   Telegram Bot      │
│                     │                  │                     │
│  Epoch: 3           │                  │  Epoch: 3           │
│  Cycle: 145 / 288   │                  │  Cycle: 145 / 288   │
└─────────────────────┘                  └─────────────────────┘
```

---

## The Bug Visualization

### Before the Fix

```
cycle-state.json has 3 epochs:
┌────────────┐
│ 2026-01-09 │  ← Epoch 1 (oldest)
└────────────┘
┌────────────┐
│ 2026-01-10 │  ← Epoch 2
└────────────┘
┌────────────┐
│ 2026-01-11 │  ← Epoch 3 (newest/current)
└────────────┘

getAllEpochStates() returns (newest-first):
┌───┬────────────┐
│ 0 │ 2026-01-11 │  ← findIndex finds it here!
├───┼────────────┤
│ 1 │ 2026-01-10 │
├───┼────────────┤
│ 2 │ 2026-01-09 │
└───┴────────────┘
     index + 1 = 0 + 1 = 1 ❌ WRONG!
     Should be 3!

Dashboard:          ✅ Epoch: 3 (was fixed earlier)
Telegram:           ❌ Epoch: 1 (STUCK)
```

### After the Fix

```
cycle-state.json has 3 epochs:
┌────────────┐
│ 2026-01-09 │  ← Epoch 1 (oldest)
└────────────┘
┌────────────┐
│ 2026-01-10 │  ← Epoch 2
└────────────┘
┌────────────┐
│ 2026-01-11 │  ← Epoch 3 (newest/current)
└────────────┘

Sort oldest-first before searching:
┌───┬────────────┐
│ 0 │ 2026-01-09 │
├───┼────────────┤
│ 1 │ 2026-01-10 │
├───┼────────────┤
│ 2 │ 2026-01-11 │  ← findIndex finds it here!
└───┴────────────┘
     index + 1 = 2 + 1 = 3 ✅ CORRECT!

Dashboard:          ✅ Epoch: 3 (still correct)
Telegram:           ✅ Epoch: 3 (NOW FIXED!)
```

---

## Timeline of Epochs

```
Day 1: 2026-01-09
═════════════════════════════════════════════════════════════
00:00 UTC                                            23:59 UTC
│←──────────────── 288 cycles ──────────────────────→│
                   Epoch 1

Day 2: 2026-01-10
═════════════════════════════════════════════════════════════
00:00 UTC                                            23:59 UTC
│←──────────────── 288 cycles ──────────────────────→│
                   Epoch 2

Day 3: 2026-01-11 (Current Day - 14:35 UTC)
═════════════════════════════════════════════════════════════
00:00 UTC            14:35 UTC (now)               23:59 UTC
│←───── 175 cycles ────→│←─ 113 cycles remaining ─→│
                   Epoch 3
              Currently at Cycle 175/288
```

---

## Code Comparison Side-by-Side

### Dashboard API (Already Fixed)

```typescript
// File: backend/src/routes/dashboard.ts
// Lines: 881-885
// Endpoint: GET /dashboard/cycles/current

const allEpochs = getAllEpochStates();
const sortedOldestFirst = allEpochs.sort(
  (a, b) => a.epoch.localeCompare(b.epoch)  ← SORT OLDEST-FIRST
);
const epochNumber = sortedOldestFirst.findIndex(
  e => e.epoch === epochInfo.epoch
) + 1;

Result: epochNumber = 3 ✅
```

### Telegram API (Now Fixed)

```typescript
// File: backend/src/routes/dashboard.ts
// Lines: 267-273
// Endpoint: GET /dashboard/rewards

lastDistributionEpochNumber: taxStats.lastDistributionEpoch 
  ? (() => {
      const allEpochs = getAllEpochStates();
      const sortedOldestFirst = allEpochs.sort(
        (a, b) => a.epoch.localeCompare(b.epoch)  ← SORT OLDEST-FIRST
      );
      return sortedOldestFirst.findIndex(
        e => e.epoch === taxStats.lastDistributionEpoch
      ) + 1;
    })() || null
  : null

Result: epochNumber = 3 ✅
```

---

## User Experience Flow

### Distribution Happens (Every 5 Minutes)

```
1. Cycle Scheduler Executes
   ├─ Collects tax (NUKE tokens)
   ├─ Swaps NUKE to SOL
   ├─ Distributes SOL to holders
   └─ Records result in cycle-state.json

2. Telegram Bot Polls Backend
   ├─ Calls: GET /dashboard/rewards
   ├─ Gets: lastDistributionEpochNumber
   └─ Before fix: Got 1 ❌
       After fix:  Gets 3 ✅

3. Telegram Sends Notification
   ┌─────────────────────────────────────┐
   │ 🎉 Reward Distribution Complete!   │
   │                                     │
   │ 💰 Total SOL: 0.123456             │
   │ 📊 Distributions: 15                │
   │                                     │
   │ *Epoch:* 3        ← NOW CORRECT    │
   │ *Cycle:* 175 / 288                 │
   │                                     │
   │ *Time:* 2026-01-11 14:35:00 UTC    │
   └─────────────────────────────────────┘
```

### User Checks Dashboard

```
Browser → Frontend → Backend API

GET /dashboard/cycles/current
Response:
{
  "epoch": "2026-01-11",
  "epochNumber": 3,          ← Correct
  "cycleNumber": 175,
  "cyclesPerEpoch": 288
}

Dashboard displays:
┌────────────────────────────┐
│  Current Status            │
├────────────────────────────┤
│  Epoch: 3                  │
│  Cycle: 175 / 288          │
│  Next cycle in: 4m 25s     │
└────────────────────────────┘
```

---

## Data Flow Diagram

```
                    ┌─────────────────┐
                    │  State Manager  │
                    │  cycleService   │
                    └────────┬────────┘
                             │
                   ┌─────────┴─────────┐
                   │                   │
         ┌─────────▼─────────┐  ┌──────▼──────────┐
         │ getCurrentEpoch() │  │getAllEpochStates│
         │ getCurrentCycle() │  │   ()            │
         └─────────┬─────────┘  └──────┬──────────┘
                   │                   │
                   │                   │ Returns newest-first
                   │                   │ MUST be sorted!
                   │                   │
         ┌─────────▼─────────────────┬─▼──────────┐
         │                           │            │
    ┌────▼─────────┐        ┌────────▼────┐  ┌───▼─────────┐
    │  Dashboard   │        │  Rewards    │  │  Telegram   │
    │   Endpoint   │        │  Endpoint   │  │    Bot      │
    └────┬─────────┘        └────────┬────┘  └───┬─────────┘
         │                           │           │
         │ epochNumber: 3 ✅        │           │
         │                           │           │
         └───────────────────────────┴───────────┘
                     Both show: Epoch 3 ✅
```

---

## Sorting Comparison

### JavaScript's localeCompare()

```javascript
// Ascending (oldest-first)
array.sort((a, b) => a.localeCompare(b))
// Result: ["2026-01-09", "2026-01-10", "2026-01-11"]
//           ↑ index 0     ↑ index 1     ↑ index 2
//           Epoch 1       Epoch 2       Epoch 3

// Descending (newest-first)
array.sort((a, b) => b.localeCompare(a))
// Result: ["2026-01-11", "2026-01-10", "2026-01-09"]
//           ↑ index 0     ↑ index 1     ↑ index 2
//           Epoch 3       Epoch 2       Epoch 1  ← WRONG ORDER FOR COUNTING!
```

### Why Oldest-First Matters

```
Array Index = Epoch Number - 1

If epochs are sorted oldest-first:
  Index 0 → Epoch 1 ✅
  Index 1 → Epoch 2 ✅
  Index 2 → Epoch 3 ✅

If epochs are sorted newest-first:
  Index 0 → Epoch 3 ❌ (but we add 1, so we get "Epoch 1" ❌)
  Index 1 → Epoch 2 ❌ (but we add 1, so we get "Epoch 2" ❌)
  Index 2 → Epoch 1 ❌ (but we add 1, so we get "Epoch 3" ❌)
```

---

## Summary Checklist

✅ **Identified:** Two separate epoch number calculations  
✅ **Found:** One was fixed (dashboard), one was broken (telegram)  
✅ **Applied:** Same fix pattern to both  
✅ **Result:** Both now show correct epoch numbers  
✅ **Documentation:** Created comprehensive guides  
✅ **Deployment:** Script ready to execute  

---

## Quick Commands

```bash
# Check how many epochs exist
cd /home/van/reward-project
cat cycle-state.json | jq '.epochs | keys | length'

# Deploy the fix
cd /home/van/reward-project/backend
npm run build
pm2 restart nuke-backend
pm2 restart nuke-telegram-bot

# Verify the fix
curl http://localhost:3001/dashboard/cycles/current | jq '.epochNumber'
curl http://localhost:3001/dashboard/rewards | jq '.tax.lastDistributionEpochNumber'

# Both should show the same number (e.g., 3)
```

---

**Fix Status:** ✅ Complete and ready to deploy
