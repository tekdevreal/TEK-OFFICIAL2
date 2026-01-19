# Simple Deployment Commands (No PM2 Required)

The build already succeeded! Now you just need to apply the changes.

## What Already Worked ✅

```bash
npm run build  # This compiled successfully
```

## The Issue

PM2 processes `nuke-backend` and `nuke-telegram-bot` don't exist on your system.

## Solution: Find and Restart Your Services

### Step 1: Find what's running

```bash
# Check PM2
pm2 list

# OR check for Node processes
ps aux | grep node
```

### Step 2: Simple Restart (Choose One)

#### If using PM2 (and you see processes in `pm2 list`):

```bash
# Restart all PM2 processes
pm2 restart all
```

#### If running manually (no PM2):

```bash
# Find backend process
ps aux | grep "node.*backend" | grep -v grep

# Find telegram process  
ps aux | grep "node.*telegram" | grep -v grep

# Kill them (replace <PID> with actual process ID from above)
kill <PID_of_backend>
kill <PID_of_telegram>

# Restart backend
cd /home/van/reward-project/backend
npm start &

# Restart telegram
cd /home/van/reward-project/telegram-bot
npm start &
```

### Step 3: Verify the Fix

```bash
# Test the APIs
curl http://localhost:3001/dashboard/cycles/current | jq '.epochNumber'
curl http://localhost:3001/dashboard/rewards | jq '.tax.lastDistributionEpochNumber'
```

---

## Even Simpler: Just Test It

The backend might already be using the new compiled code. Test it right now:

```bash
curl http://localhost:3001/dashboard/rewards | jq '.tax.lastDistributionEpochNumber'
```

If this returns a correct epoch number (not 1), then the fix is already working!

---

## What to Run Next

Copy and paste these commands one by one:

```bash
# 1. Check if anything is using PM2
pm2 list

# 2. Test if backend is running
curl http://localhost:3001/dashboard/cycles/current 2>/dev/null | jq '.epochNumber' || echo "Backend not responding on port 3001"

# 3. Check what port backend is using
ps aux | grep "node.*backend" | grep -v grep
```

Share the output and I'll tell you exactly what to do next!
