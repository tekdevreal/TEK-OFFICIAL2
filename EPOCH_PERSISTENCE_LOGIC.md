# Epoch Persistence & Recovery Logic - Complete Analysis

## How Epochs Are Stored & Persist Across Restarts

### ✅ Good News: Epochs DO Persist!

The epoch system is **designed to survive crashes and restarts**. Here's how:

---

## Storage Architecture

### 1. Persistent File Storage

**Location:** `cycle-state.json` in the project root directory

```
/home/van/reward-project/cycle-state.json
```

**Structure:**
```json
{
  "epochs": {
    "2026-01-09": {
      "epoch": "2026-01-09",
      "cycles": [...],
      "createdAt": 1736380800000,
      "updatedAt": 1736467200000
    },
    "2026-01-10": {
      "epoch": "2026-01-10",
      "cycles": [...],
      "createdAt": 1736467200000,
      "updatedAt": 1736553600000
    },
    "2026-01-11": {
      "epoch": "2026-01-11",
      "cycles": [...],
      "createdAt": 1736553600000,
      "updatedAt": 1736640000000
    }
  },
  "currentEpoch": "2026-01-11",
  "currentCycleNumber": 145,
  "lastCycleTimestamp": 1736640000000
}
```

---

## Crash/Restart Recovery Logic

### What Happens When Service Restarts

**File:** `backend/src/services/cycleService.ts`

#### Step 1: Load Existing State (Lines 98-116)

```typescript
function loadCycleState(): CycleServiceState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      return JSON.parse(data);  // ✅ Loads all historical epochs!
    }
  } catch (error) {
    logger.warn('Failed to load cycle state, using defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Only returns empty state if file doesn't exist or is corrupted
  return {
    epochs: {},
    currentEpoch: null,
    currentCycleNumber: 1,
    lastCycleTimestamp: null,
  };
}
```

**Key Points:**
- ✅ **ALWAYS reads from file first**
- ✅ **Preserves ALL historical epochs**
- ✅ **Only resets if file is missing or corrupted**

#### Step 2: Initialize Current Epoch (Lines 141-181)

```typescript
function initializeEpoch(state: CycleServiceState): void {
  const currentEpoch = getCurrentEpoch();  // Gets today's date (YYYY-MM-DD)
  const currentCycleNumber = getCurrentCycleNumber();  // Calculates from UTC time

  // Check if we need to reset to a new epoch
  if (shouldResetEpoch(state.currentEpoch)) {
    logger.info('🔄 Epoch reset detected', {
      previousEpoch: state.currentEpoch,
      newEpoch: currentEpoch,
      cycleNumber: currentCycleNumber,
    });

    // Save previous epoch if it exists
    if (state.currentEpoch) {
      const previousEpochState = state.epochs[state.currentEpoch];
      if (previousEpochState) {
        previousEpochState.updatedAt = Date.now();
        state.epochs[state.currentEpoch] = previousEpochState;  // ✅ Preserves old epoch
      }
    }

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
  } else {
    // Same epoch, update cycle number
    state.currentCycleNumber = currentCycleNumber;  // ✅ Recalculates from UTC time
  }

  saveCycleState(state);  // ✅ Saves immediately
}
```

**Key Points:**
- ✅ **Determines epoch from UTC date** (not from counter)
- ✅ **Preserves all previous epochs**
- ✅ **Automatically creates new epoch at midnight UTC**
- ✅ **Calculates cycle number from current UTC time**

---

## Recovery Scenarios

### Scenario 1: Service Crashes & Restarts (Same Day)

**Before Crash:**
```
- Epoch: 2026-01-11 (Epoch 3)
- Cycle: 145 / 288
- Time: 12:05 UTC
```

**After Restart (12:10 UTC):**
```
1. Reads cycle-state.json ✅
2. Finds epochs: 2026-01-09, 2026-01-10, 2026-01-11
3. getCurrentEpoch() returns "2026-01-11" ✅
4. Sees currentEpoch matches stored epoch ✅
5. getCurrentCycleNumber() calculates: floor(12*60 + 10) / 5) + 1 = 146
6. Resumes at: Epoch 3, Cycle 146 ✅
```

**Result:** ✅ **Epoch counter preserved! Cycle recalculated from time!**

---

### Scenario 2: Service Down Overnight (Crosses Midnight)

**Before Shutdown:**
```
- Date: 2026-01-11
- Epoch: 2026-01-11 (Epoch 3)
- Cycle: 250 / 288
- Time: 20:50 UTC
```

**After Restart Next Day (01:00 UTC):**
```
1. Reads cycle-state.json ✅
2. Finds epochs: 2026-01-09, 2026-01-10, 2026-01-11
3. getCurrentEpoch() returns "2026-01-12" (new day!)
4. shouldResetEpoch() returns TRUE (date changed)
5. Saves 2026-01-11 to epochs ✅
6. Creates new epoch: 2026-01-12
7. getCurrentCycleNumber() = floor(1*60 + 0) / 5) + 1 = 13
8. Resumes at: Epoch 4, Cycle 13 ✅
```

**Result:** ✅ **New epoch created! Old epochs preserved!**

---

### Scenario 3: File Gets Corrupted

**What Happens:**
```
1. loadCycleState() catches error
2. Logs warning ⚠️
3. Returns empty state (epochs: {})
4. System starts from Epoch 1 ❌
```

**Result:** ❌ **Epoch counter resets** (only if file is corrupted/deleted)

---

### Scenario 4: Deployment to Render/Railway (No Persistent Storage)

**What Happens:**
```
1. New container spins up
2. cycle-state.json doesn't exist in new container
3. loadCycleState() returns empty state
4. System starts from Epoch 1 ❌
```

**Result:** ❌ **Epoch counter resets on every deployment**

**Solution:** Use persistent storage (see below)

---

## Epoch Number Calculation

### How Epoch Numbers Are Determined

**File:** `backend/src/routes/dashboard.ts` (Lines 881-885, 267-273)

```typescript
// Get all epochs from state file
const allEpochs = getAllEpochStates();

// Sort oldest-first (2026-01-09, 2026-01-10, 2026-01-11, ...)
const sortedOldestFirst = allEpochs.sort((a, b) => a.epoch.localeCompare(b.epoch));

// Find position of current epoch
const epochNumber = sortedOldestFirst.findIndex(e => e.epoch === currentEpoch) + 1;
```

**Example:**
```
Epochs in file: ["2026-01-09", "2026-01-10", "2026-01-11"]
Current epoch: "2026-01-11"
Index: 2
Epoch number: 2 + 1 = 3 ✅
```

**Key Points:**
- ✅ **Based on file contents, not a counter**
- ✅ **Survives restarts as long as file exists**
- ✅ **Automatically correct after restart**

---

## Data Retention Policy

### Epoch Cleanup (Lines 206-213)

```typescript
// Keep only last 30 epochs in memory (30 days)
const epochKeys = Object.keys(state.epochs).sort();
if (epochKeys.length > 30) {
  const epochsToRemove = epochKeys.slice(0, epochKeys.length - 30);
  for (const epochKey of epochsToRemove) {
    delete state.epochs[epochKey];
  }
}
```

**Retention:**
- ✅ Keeps last **30 epochs** (30 days of history)
- ✅ Old epochs are automatically pruned
- ✅ Prevents file from growing indefinitely

---

## Manual Adjustment Options

### Option 1: Edit cycle-state.json Directly

**To manually set epoch history:**

1. **Stop the backend service**
2. **Edit the file:**

```bash
cd /home/van/reward-project
nano cycle-state.json
```

3. **Add historical epochs:**

```json
{
  "epochs": {
    "2026-01-01": {
      "epoch": "2026-01-01",
      "cycles": [],
      "createdAt": 1735689600000,
      "updatedAt": 1735776000000
    },
    "2026-01-02": {
      "epoch": "2026-01-02",
      "cycles": [],
      "createdAt": 1735776000000,
      "updatedAt": 1735862400000
    },
    "2026-01-11": {
      "epoch": "2026-01-11",
      "cycles": [],
      "createdAt": 1736553600000,
      "updatedAt": 1736640000000
    }
  },
  "currentEpoch": "2026-01-11",
  "currentCycleNumber": 1,
  "lastCycleTimestamp": null
}
```

4. **Restart the service**

**Result:** System will now show **Epoch 11** (11 epochs in file)

---

### Option 2: Create a Migration Script

**File:** `backend/src/scripts/adjustEpochs.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE_PATH = path.join(process.cwd(), 'cycle-state.json');

interface EpochState {
  epoch: string;
  cycles: any[];
  createdAt: number;
  updatedAt: number;
}

function addHistoricalEpochs(startDate: string, endDate: string): void {
  // Load existing state
  const data = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
  const state = JSON.parse(data);

  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Generate epochs for each day
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const epochDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    
    // Only add if doesn't exist
    if (!state.epochs[epochDate]) {
      state.epochs[epochDate] = {
        epoch: epochDate,
        cycles: [],
        createdAt: d.getTime(),
        updatedAt: d.getTime(),
      };
      console.log(`✅ Added epoch: ${epochDate}`);
    }
  }

  // Save updated state
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  console.log('✅ Epochs updated successfully');
}

// Usage: Add epochs from Jan 1 to Jan 10
addHistoricalEpochs('2026-01-01', '2026-01-10');
```

**Run it:**
```bash
cd /home/van/reward-project/backend
npx ts-node src/scripts/adjustEpochs.ts
```

---

## Critical Issue: Render/Railway Deployments

### The Problem

**Render and Railway use ephemeral containers:**
- ❌ Each deployment creates a **new container**
- ❌ Files in the container are **deleted on restart**
- ❌ `cycle-state.json` is **lost every time you deploy**

**This is why you're seeing Epoch 1 after each push!**

---

## Solution: Add Persistent Storage

### For Render

**1. Create a Persistent Disk**

```
Dashboard → Services → [Your Backend] → Disks
- Click "Add Disk"
- Name: "reward-data"
- Size: 1 GB
- Mount Path: /data
```

**2. Update Code to Use Persistent Path**

Edit `backend/src/services/cycleService.ts`:

```typescript
// OLD:
const STATE_FILE_PATH = path.join(process.cwd(), 'cycle-state.json');

// NEW:
const STATE_FILE_PATH = process.env.NODE_ENV === 'production'
  ? '/data/cycle-state.json'
  : path.join(process.cwd(), 'cycle-state.json');
```

**3. Set Environment Variable**

```
Environment → Add Variable
- Key: NODE_ENV
- Value: production
```

**Result:** ✅ `cycle-state.json` survives deployments!

---

### For Railway

**1. Create a Volume**

```
Service Settings → Volumes → Add Volume
- Name: "reward-data"
- Mount Path: /data
```

**2. Update Code (Same as Render)**

```typescript
const STATE_FILE_PATH = process.env.NODE_ENV === 'production'
  ? '/data/cycle-state.json'
  : path.join(process.cwd(), 'cycle-state.json');
```

**3. Set Environment Variable**

```
Variables → Add Variable
- NODE_ENV=production
```

**Result:** ✅ `cycle-state.json` survives deployments!

---

## Testing Recovery

### Test 1: Restart Backend (Same Day)

```bash
# Check current state
curl https://nukerewards.imgprotocol.com/dashboard/cycles/current | jq

# Note the epoch and cycle
# Example: Epoch 3, Cycle 145

# Restart backend on Render/Railway
# Wait 30 seconds

# Check again
curl https://nukerewards.imgprotocol.com/dashboard/cycles/current | jq

# Should show:
# - Same epoch (3)
# - Cycle recalculated from current UTC time
```

### Test 2: Manual Epoch Adjustment

```bash
# 1. SSH into your Render/Railway instance (if possible)
# 2. Or download state file, edit, re-upload

# 3. Edit cycle-state.json to add more epochs
# 4. Restart service
# 5. Check epoch number increased
```

---

## Monitoring & Verification

### Check Epoch Persistence

```bash
# 1. Check current epoch
curl https://nukerewards.imgprotocol.com/dashboard/cycles/current | jq '.epochNumber'

# 2. Check total epochs stored
curl https://nukerewards.imgprotocol.com/dashboard/cycles/epochs | jq '.total'

# 3. List all epochs
curl https://nukerewards.imgprotocol.com/dashboard/cycles/epochs | jq '.epochs[].epoch'
```

### Logs to Monitor

Look for these in your Render/Railway logs:

```
✅ Good signs:
- "Cycle state loaded" (file exists)
- "Epoch reset detected" (new day started)
- "Cycle result recorded" (data being saved)

⚠️ Warning signs:
- "Failed to load cycle state, using defaults" (file missing/corrupted)
- Multiple "Epoch: 1" after you should be on Epoch 2+
```

---

## Summary

| Scenario | Epoch Persists? | Solution |
|----------|-----------------|----------|
| **Service crash & restart (same day)** | ✅ YES | Automatic - reads from file |
| **Service restart next day** | ✅ YES | Automatic - creates new epoch |
| **File corruption** | ❌ NO | Manual - restore from backup |
| **Deployment (no persistent storage)** | ❌ NO | **Add Render Disk or Railway Volume** |
| **Deployment (with persistent storage)** | ✅ YES | Automatic - file survives |

---

## Action Items

1. ✅ **Add persistent storage** to Render/Railway
2. ✅ **Update code** to use `/data/cycle-state.json` in production
3. ✅ **Set NODE_ENV=production** environment variable
4. ✅ **Test** by deploying and verifying epochs persist
5. ✅ **Monitor** logs for "Failed to load cycle state" warnings
6. ✅ **Backup** cycle-state.json periodically

**Once persistent storage is set up, your epochs will survive all restarts and deployments!** 🎉
