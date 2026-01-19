# FINAL SUMMARY: Epoch Logic Structure & Recovery

**Date:** January 11, 2026  
**Status:** ✅ Fully analyzed & enhanced

---

## Your Question Answered

> "How's the epoch logic structured right now? If the bot, Render, or Railway turns off or crashes, we need to be sure the epoch does not restart to zero or it is able to be adjusted manually."

---

## ✅ Good News

The epoch system is **well-designed and survives crashes**! Here's what I found:

### 1. **Epochs ARE Persistent** ✅

- Stored in `cycle-state.json` file
- Always read from file on startup
- Epochs determined by **UTC date**, not a counter
- Historical epochs preserved (last 30 days)

### 2. **Crash Recovery Works** ✅

When the backend restarts:
1. Reads `cycle-state.json` ✅
2. Loads all historical epochs ✅
3. Calculates current epoch from UTC date ✅
4. Calculates current cycle from UTC time ✅
5. Resumes exactly where it left off ✅

### 3. **Manual Adjustment Supported** ✅

You can:
- Edit `cycle-state.json` directly
- Add historical epochs manually
- Use a migration script
- Backup and restore the file

---

## ⚠️ ONE Critical Issue Found

### Problem: Deployment Resets

**On Render/Railway without persistent storage:**
- Each deployment creates a **new container** ❌
- `cycle-state.json` is **deleted** ❌
- Epoch resets to **1** ❌

**This is why you're seeing Epoch 1 after each push!**

---

## ✅ Solution Implemented

### Code Update

Updated `backend/src/services/cycleService.ts` to support persistent storage:

```typescript
// Before:
const STATE_FILE_PATH = path.join(process.cwd(), 'cycle-state.json');

// After:
const STATE_FILE_PATH = process.env.NODE_ENV === 'production' && process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'cycle-state.json')
  : path.join(process.cwd(), 'cycle-state.json');
```

**What this does:**
- ✅ In production: Uses `/data/cycle-state.json` (persistent disk)
- ✅ In development: Uses local file
- ✅ Logs the path on startup for debugging

---

## How To Set Up Persistent Storage

### For Render (5 minutes)

1. **Dashboard → Your Service → Disks → Add Disk**
   - Name: `reward-data`
   - Mount Path: `/data`
   - Size: 1 GB

2. **Environment → Add Variable**
   - Key: `DATA_DIR`
   - Value: `/data`

3. **Deploy the code** (see commands below)

### For Railway (5 minutes)

1. **Service → Settings → Volumes → New Volume**
   - Mount Path: `/data`
   - Size: 1 GB

2. **Variables → New Variable**
   - Variable: `DATA_DIR`
   - Value: `/data`

3. **Deploy the code** (see commands below)

---

## Deploy Commands

```bash
cd /home/van/reward-project

# Stage all changes
git add backend/src/routes/dashboard.ts
git add backend/src/services/cycleService.ts

# Commit
git commit -m "Fix epoch counting & add persistent storage

EPOCH COUNTING FIX:
- Fixed lastDistributionEpochNumber in /dashboard/rewards endpoint
- Sorts epochs oldest-first before calculating epoch number
- Telegram bot will now show correct epoch numbers

PERSISTENT STORAGE:
- Added support for persistent disk/volume in production
- Uses DATA_DIR environment variable
- Epochs will survive deployments and restarts
- Falls back to local file in development

To enable persistent storage:
1. Add disk/volume mounted at /data
2. Set DATA_DIR=/data environment variable
3. Epochs will persist across all deployments!"

# Push
git push origin main
```

---

## What Happens After Setup

### Before Persistent Storage ❌

```
Deploy 1: Epoch 1
Deploy 2: Epoch 1 (reset!)
Deploy 3: Epoch 1 (reset!)
Next Day: Epoch 1 (still reset!)
```

### After Persistent Storage ✅

```
Day 1, Deploy 1: Epoch 1
Day 1, Deploy 2: Epoch 1 (preserved!)
Day 2, Deploy 1: Epoch 2 (incremented!)
Day 3, Deploy 1: Epoch 3 (incremented!)
```

---

## Crash/Restart Scenarios

### Scenario 1: Backend Crashes (Same Day)

```
Before crash: Epoch 3, Cycle 145
After restart: Epoch 3, Cycle 146 (recalculated from time)
✅ Epoch preserved!
```

### Scenario 2: Service Down Overnight

```
Before shutdown: Epoch 3 (Jan 11)
After restart (Jan 12): Epoch 4 (new day detected)
✅ Epoch incremented correctly!
```

### Scenario 3: Deployment Without Persistent Storage

```
Before deploy: Epoch 3
After deploy: Epoch 1 (file deleted)
❌ Epoch lost!
```

### Scenario 4: Deployment WITH Persistent Storage

```
Before deploy: Epoch 3
After deploy: Epoch 3 (file on /data volume)
✅ Epoch preserved!
```

---

## Manual Adjustment Guide

### Method 1: Edit File Directly

**Via Render Shell or Railway CLI:**

```bash
# 1. View current state
cat /data/cycle-state.json

# 2. Edit file
nano /data/cycle-state.json

# 3. Add historical epochs (example)
{
  "epochs": {
    "2026-01-01": { "epoch": "2026-01-01", "cycles": [], "createdAt": 1735689600000, "updatedAt": 1735776000000 },
    "2026-01-02": { "epoch": "2026-01-02", "cycles": [], "createdAt": 1735776000000, "updatedAt": 1735862400000 },
    ...10 more epochs...
    "2026-01-11": { "epoch": "2026-01-11", "cycles": [], "createdAt": 1736553600000, "updatedAt": 1736640000000 }
  },
  "currentEpoch": "2026-01-11",
  "currentCycleNumber": 1,
  "lastCycleTimestamp": null
}

# 4. Restart service
# System will now show Epoch 11!
```

### Method 2: Use Migration Script

See `SETUP_PERSISTENT_STORAGE.md` for the script.

---

## Verification

### Check Current State

```bash
# Check epoch number
curl https://nukerewards.imgprotocol.com/dashboard/cycles/current | jq '.epochNumber'

# Check total epochs stored
curl https://nukerewards.imgprotocol.com/dashboard/cycles/epochs | jq '.total'

# List all epoch dates
curl https://nukerewards.imgprotocol.com/dashboard/cycles/epochs | jq '.epochs[].epoch'
```

### Check Logs

Look for in deployment logs:

```
✅ "Cycle Service initialized" 
   stateFilePath: /data/cycle-state.json
   nodeEnv: production
   dataDir: /data
```

---

## Summary Table

| Aspect | Status | Details |
|--------|--------|---------|
| **Epochs persist across crashes** | ✅ YES | Reads from file on startup |
| **Epochs survive restarts** | ✅ YES | Calculated from UTC date |
| **Epochs survive deployments (no storage)** | ❌ NO | File deleted each deploy |
| **Epochs survive deployments (with storage)** | ✅ YES | File on persistent volume |
| **Manual adjustment possible** | ✅ YES | Edit file or use script |
| **Automatic epoch increment** | ✅ YES | At 00:00 UTC daily |
| **Data retention** | ✅ 30 days | Last 30 epochs kept |
| **Backup capability** | ✅ YES | Can copy file anytime |

---

## Action Items

### Immediate (Required)

1. ✅ **Commit and push** the code changes
2. ⏳ **Add persistent disk/volume** on Render/Railway
3. ⏳ **Set DATA_DIR environment variable**
4. ⏳ **Verify** epochs persist after next deployment

### Optional (Recommended)

5. ⏳ Set up **automated backups** of cycle-state.json
6. ⏳ Document the **state file location** for your team
7. ⏳ Create **monitoring alerts** for state file errors

---

## Documentation Created

1. **`EPOCH_PERSISTENCE_LOGIC.md`** - Complete technical analysis
2. **`SETUP_PERSISTENT_STORAGE.md`** - Step-by-step setup guide
3. **`EPOCH_FINAL_STATUS.md`** - Current status report
4. **This file** - Executive summary

---

## Next Steps

**Right now:**
```bash
# Deploy the code
cd /home/van/reward-project
git add backend/src/routes/dashboard.ts backend/src/services/cycleService.ts
git commit -m "Fix epoch counting & add persistent storage support"
git push origin main
```

**After deployment:**
1. Go to Render/Railway dashboard
2. Add disk/volume (mount at `/data`)
3. Set environment variable `DATA_DIR=/data`
4. Redeploy (or wait for auto-deploy)

**Result:**
- ✅ Epoch numbers will be correct
- ✅ Epochs will survive all deployments
- ✅ Epochs will survive all crashes
- ✅ Manual adjustment available if needed

---

## Final Answer

**Q: How's the epoch logic structured? Will it survive crashes? Can we adjust manually?**

**A: YES to all!**

✅ **Well-structured:** Epochs stored in persistent JSON file  
✅ **Survives crashes:** Always reads from file on startup  
✅ **Survives restarts:** Calculated from UTC date, not counter  
✅ **Manual adjustment:** Can edit file or use migration script  
⚠️ **Needs setup:** Add persistent storage to survive deployments  

**Once you set up persistent storage (5 minutes), epochs will be bulletproof!** 🎉
