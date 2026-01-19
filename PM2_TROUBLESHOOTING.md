# Quick Fix - PM2 Process Names

## Issue
The PM2 processes `nuke-backend` and `nuke-telegram-bot` don't exist on your system.

## Solution

### Step 1: Find the actual PM2 process names

Run this in your WSL terminal:

```bash
pm2 list
```

This will show you the actual names of running processes.

### Step 2: If no PM2 processes are running

The services might not be running with PM2 at all. Here are your options:

#### Option A: Start services with PM2 (Recommended)

```bash
cd /home/van/reward-project

# Start backend
cd backend
pm2 start npm --name "reward-backend" -- start
pm2 save

# Start telegram bot
cd ../telegram-bot
pm2 start npm --name "telegram-bot" -- start
pm2 save
```

#### Option B: Just run the services directly (without PM2)

```bash
# Terminal 1 - Backend
cd /home/van/reward-project/backend
npm start

# Terminal 2 - Telegram Bot (in a new terminal)
cd /home/van/reward-project/telegram-bot
npm start
```

### Step 3: Update the deployment script

Once you know the actual PM2 process names from `pm2 list`, update the script:

```bash
cd /home/van/reward-project
nano deploy-epoch-counting-fix.sh
```

Change lines 28 and 32 to use the correct process names you see in `pm2 list`.

---

## Quick Deploy (Manual - No PM2)

If you're not using PM2, just restart the services manually:

### 1. Build the backend

```bash
cd /home/van/reward-project/backend
npm run build
```

### 2. Restart backend

```bash
# If running in terminal, press Ctrl+C to stop, then:
npm start

# Or if you know the process ID:
# ps aux | grep "node.*backend"
# kill -9 <PID>
# npm start
```

### 3. Restart telegram bot

```bash
cd /home/van/reward-project/telegram-bot
# Press Ctrl+C to stop if running, then:
npm start
```

---

## Verify the Fix

After restarting, test the APIs:

```bash
# Test current epoch
curl http://localhost:3001/dashboard/cycles/current | jq '.epochNumber'

# Test last distribution epoch
curl http://localhost:3001/dashboard/rewards | jq '.tax.lastDistributionEpochNumber'
```

Both should show the same epoch number (e.g., 3).

---

## Check Backend Port

If the backend is running on a different port (not 3001), check:

```bash
cat /home/van/reward-project/backend/.env | grep PORT
```

Or look at the terminal output when the backend starts to see which port it's using.

---

## Commands to Run Right Now

```bash
# 1. Check if services are running with PM2
pm2 list

# 2. If nothing is listed, check what's running on the backend port
lsof -i :3001

# 3. Check backend port setting
cat /home/van/reward-project/backend/.env | grep PORT

# 4. Build the backend (this already worked)
cd /home/van/reward-project/backend
npm run build

# 5. Check if backend process is running
ps aux | grep "node.*backend"

# 6. Check if telegram bot is running
ps aux | grep "node.*telegram"
```

---

## Next Step

Please run `pm2 list` in your WSL terminal and share the output. That will tell us:
1. If you're using PM2
2. What the actual process names are
3. If the services are running at all

Then I can provide the exact commands you need.
