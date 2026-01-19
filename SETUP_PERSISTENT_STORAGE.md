# Setup Persistent Storage - Step by Step Guide

## Problem

Every time you push to GitHub and Render/Railway redeploys:
- ❌ `cycle-state.json` is deleted
- ❌ Epoch counter resets to 1
- ❌ Historical data is lost

## Solution

Add persistent storage (disk/volume) that survives deployments.

---

## For Render

### Step 1: Create a Persistent Disk

1. Go to your Render dashboard: https://dashboard.render.com
2. Click on your backend service
3. Click **"Disks"** in the left sidebar
4. Click **"Add Disk"**
5. Configure:
   - **Name:** `reward-data`
   - **Mount Path:** `/data`
   - **Size:** 1 GB (minimum, more if you want)
6. Click **"Save"**

### Step 2: Set Environment Variable

1. Still in your service settings
2. Click **"Environment"** in the left sidebar
3. Click **"Add Environment Variable"**
4. Add:
   - **Key:** `DATA_DIR`
   - **Value:** `/data`
5. Click **"Save Changes"**

### Step 3: Deploy the Updated Code

The code has been updated to automatically use `/data/cycle-state.json` in production!

```bash
cd /home/van/reward-project
git add backend/src/services/cycleService.ts
git commit -m "Add persistent storage support for cycle-state.json

- Uses DATA_DIR environment variable for persistent storage
- Falls back to project directory in development
- Logs state file path on startup for debugging"
git push origin main
```

### Step 4: Verify

After deployment, check the logs:

```
Look for:
✅ "Cycle Service initialized" log with stateFilePath: /data/cycle-state.json
```

---

## For Railway

### Step 1: Create a Volume

1. Go to your Railway dashboard: https://railway.app
2. Click on your backend service
3. Go to **Settings** → **Volumes**
4. Click **"+ New Volume"**
5. Configure:
   - **Mount Path:** `/data`
   - **Size:** 1 GB (minimum)
6. Click **"Add"**

### Step 2: Set Environment Variable

1. Still in your service
2. Go to **Variables** tab
3. Click **"+ New Variable"**
4. Add:
   - **Variable:** `DATA_DIR`
   - **Value:** `/data`
5. Click **"Add"**

### Step 3: Deploy the Updated Code

Same as Render (see Step 3 above).

### Step 4: Verify

Check the deployment logs for the "Cycle Service initialized" message.

---

## What This Changes

### Before (Without Persistent Storage)

```
Project Root (deleted on each deploy)
└── cycle-state.json ❌ Lost on deployment
```

Every push:
- New container created
- cycle-state.json doesn't exist
- System starts from Epoch 1

### After (With Persistent Storage)

```
/data (persistent disk/volume)
└── cycle-state.json ✅ Survives deployments!
```

Every push:
- New container created
- Mounts /data volume
- Reads existing cycle-state.json
- Epochs continue counting: 1, 2, 3, 4...

---

## Testing

### Test 1: Check Current Epoch

```bash
curl https://nukerewards.imgprotocol.com/dashboard/cycles/current | jq
```

Note the epoch number.

### Test 2: Make a Small Change & Deploy

```bash
# Make any small change (add a comment)
echo "// Test" >> backend/src/index.ts

# Commit and push
git add .
git commit -m "Test: Verify epoch persistence"
git push origin main
```

### Test 3: Check Epoch After Deployment

Wait for deployment to complete (2-5 minutes), then:

```bash
curl https://nukerewards.imgprotocol.com/dashboard/cycles/current | jq '.epochNumber'
```

**Expected:** Same epoch number as before! ✅

---

## Manual Epoch Adjustment (If Needed)

If you need to manually set the epoch number (e.g., to account for days the system was down):

### Option 1: Download, Edit, Upload (Easier)

1. **Download current state:**
   ```bash
   # Via Render
   # Go to Shell tab in dashboard, run:
   cat /data/cycle-state.json
   # Copy output to local file
   ```

2. **Edit locally:**
   ```bash
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
       ...add more epochs...
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

4. **Upload via Render Shell:**
   ```bash
   # Paste the JSON content
   cat > /data/cycle-state.json << 'EOF'
   {your JSON here}
   EOF
   ```

5. **Restart service**

### Option 2: Use a Migration Script (Advanced)

Create `backend/src/scripts/seedEpochs.ts`:

```typescript
import * as fs from 'fs';

const STATE_FILE = process.env.DATA_DIR 
  ? `${process.env.DATA_DIR}/cycle-state.json`
  : './cycle-state.json';

// Add epochs from start date to today
function seedEpochs(startDate: string) {
  let state: any = { epochs: {}, currentEpoch: null, currentCycleNumber: 1, lastCycleTimestamp: null };
  
  // Load existing if present
  if (fs.existsSync(STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }

  const start = new Date(startDate);
  const today = new Date();
  
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const epoch = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    
    if (!state.epochs[epoch]) {
      state.epochs[epoch] = {
        epoch,
        cycles: [],
        createdAt: d.getTime(),
        updatedAt: d.getTime(),
      };
      console.log(`✅ Added epoch: ${epoch}`);
    }
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log('✅ Done!');
}

// Run: Add epochs from Jan 1, 2026 to today
seedEpochs('2026-01-01');
```

**Run via Render Shell:**
```bash
cd /opt/render/project/src
DATA_DIR=/data npx ts-node backend/src/scripts/seedEpochs.ts
```

---

## Backup Strategy

### Automated Backup (Recommended)

Add to your backend startup script or cron job:

```bash
#!/bin/bash
# backup-state.sh

cp /data/cycle-state.json /data/backups/cycle-state-$(date +%Y%m%d).json

# Keep only last 7 days
find /data/backups -name "cycle-state-*.json" -mtime +7 -delete
```

### Manual Backup

Periodically download the file:

```bash
# Via Render Shell
cat /data/cycle-state.json

# Copy output to local file
```

---

## Troubleshooting

### Issue: Epoch still resets to 1 after deployment

**Check:**
```bash
# 1. Verify environment variable is set
echo $DATA_DIR
# Should output: /data

# 2. Check if volume is mounted
ls -la /data
# Should show cycle-state.json

# 3. Check file permissions
ls -la /data/cycle-state.json
# Should be readable/writable by app

# 4. Check logs for state file path
# Look for: "Cycle Service initialized" with stateFilePath
```

**Fix:**
- Ensure DATA_DIR=/data environment variable is set
- Ensure disk/volume is mounted to /data
- Check file permissions: `chmod 644 /data/cycle-state.json`

### Issue: "Failed to load cycle state" error

**Causes:**
- File is corrupted (invalid JSON)
- File permissions issue
- Disk full

**Fix:**
```bash
# 1. Check disk space
df -h /data

# 2. Validate JSON
cat /data/cycle-state.json | jq
# Should parse without errors

# 3. Check permissions
ls -la /data/cycle-state.json
chmod 644 /data/cycle-state.json
```

---

## Summary Checklist

- [ ] Create persistent disk/volume on Render/Railway
- [ ] Set DATA_DIR=/data environment variable
- [ ] Deploy updated code
- [ ] Verify "Cycle Service initialized" log shows /data path
- [ ] Test: Deploy again and verify epoch persists
- [ ] Set up backup strategy
- [ ] Document location of state file for your team

**Once complete, your epoch counter will survive all deployments!** 🎉

---

## Quick Deploy Commands

```bash
cd /home/van/reward-project

# Add the updated file
git add backend/src/services/cycleService.ts

# Commit
git commit -m "Add persistent storage support for cycle-state.json

- Uses DATA_DIR environment variable for persistent storage
- Falls back to project directory in development
- Logs state file path on startup for debugging
- Epochs will now survive deployments on Render/Railway"

# Push
git push origin main
```

After this deploys, configure the disk/volume and environment variable in your Render/Railway dashboard.
