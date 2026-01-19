# DEPLOY NOW - Epoch Counting Fix

## What Was Fixed

**Issue:** Telegram bot showing "Epoch: 1" forever, even though system is on Day 3  
**Cause:** Missing sort step in epoch number calculation  
**Fixed:** `backend/src/routes/dashboard.ts` line 267-273

---

## Quick Deploy (Copy & Paste)

### Option 1: Using Deployment Script

```bash
cd /home/van/reward-project
./deploy-epoch-counting-fix.sh
```

### Option 2: Manual Commands

```bash
# 1. Go to project directory
cd /home/van/reward-project

# 2. Build backend
cd backend
npm run build

# 3. Restart services
pm2 restart nuke-backend
pm2 restart nuke-telegram-bot

# 4. Verify (both should show same epoch number)
curl http://localhost:3001/dashboard/cycles/current | jq '.epochNumber'
curl http://localhost:3001/dashboard/rewards | jq '.tax.lastDistributionEpochNumber'
```

---

## What to Expect After Deployment

### Before
```
Telegram: "Epoch: 1"  ← STUCK
Dashboard: "Epoch: 3" ← Already correct
```

### After
```
Telegram: "Epoch: 3"  ← FIXED!
Dashboard: "Epoch: 3" ← Still correct
```

---

## Test Immediately After Deploy

### 1. Check Telegram Bot

Send this command in Telegram:
```
/rewards
```

Look for:
```
*Current Epoch:* 3    ← Should match number of days running
*Current Cycle:* XXX / 288
```

### 2. Check Dashboard

Open dashboard in browser and verify epoch number matches Telegram.

### 3. Wait for Next Distribution

Within 5 minutes, a distribution should occur. Check the Telegram notification:
```
🎉 Reward Distribution Complete!
*Epoch:* 3            ← Should be correct now
*Cycle:* XXX / 288
```

---

## Expected Epoch Number

To know what epoch number to expect:

```bash
cd /home/van/reward-project
cat cycle-state.json | jq '.epochs | keys'
```

Count the number of epoch dates. That's your epoch number.

**Example:**
```json
[
  "2026-01-09",
  "2026-01-10",
  "2026-01-11"
]
```
→ 3 epochs = Should show **Epoch 3**

---

## Troubleshooting

### If epoch number still shows 1

1. Check if services restarted:
   ```bash
   pm2 list
   ```

2. Check backend logs:
   ```bash
   pm2 logs nuke-backend --lines 50
   ```

3. Rebuild and restart again:
   ```bash
   cd /home/van/reward-project/backend
   npm run build
   pm2 restart nuke-backend
   pm2 restart nuke-telegram-bot
   ```

### If services won't start

1. Check for port conflicts:
   ```bash
   lsof -i :3001  # backend port
   ```

2. Check for build errors:
   ```bash
   cd /home/van/reward-project/backend
   npm run build
   ```

3. View detailed logs:
   ```bash
   pm2 logs nuke-backend --err
   ```

---

## Files Changed

- ✅ `backend/src/routes/dashboard.ts` (lines 267-273)

## Files Created (Documentation)

- ✅ `EPOCH_REVIEW_SUMMARY.md` - Complete analysis
- ✅ `EPOCH_COUNTING_COMPLETE_FIX_2026_01_11.md` - Detailed explanation
- ✅ `EPOCH_BUG_VISUAL_COMPARISON.md` - Before/after examples
- ✅ `EPOCH_FIX_VISUAL_DIAGRAM.md` - Visual diagrams
- ✅ `deploy-epoch-counting-fix.sh` - Deployment script
- ✅ `DEPLOY_NOW.md` - This file

---

## Verification Checklist

After deploying, verify:

- [ ] Backend service running: `pm2 list | grep nuke-backend`
- [ ] Telegram bot running: `pm2 list | grep telegram`
- [ ] Current epoch API: `curl http://localhost:3001/dashboard/cycles/current | jq '.epochNumber'`
- [ ] Rewards API: `curl http://localhost:3001/dashboard/rewards | jq '.tax.lastDistributionEpochNumber'`
- [ ] Both APIs return same epoch number
- [ ] Telegram `/rewards` command shows correct epoch
- [ ] Wait for next distribution notification (check epoch in message)

---

## Timeline

| Time | Action | Expected Result |
|------|--------|-----------------|
| Now | Deploy fix | Services restart |
| Now + 1 min | Test `/rewards` | Shows correct epoch |
| Now + 5 min | Next distribution | Notification shows correct epoch |
| Tomorrow 00:00 UTC | New epoch | Epoch increments to 4 |

---

## One-Line Summary

**Fixed Telegram epoch counting by adding sorting step to `lastDistributionEpochNumber` calculation in `/dashboard/rewards` endpoint.**

---

## Need Help?

Check these logs:
```bash
# Backend logs
pm2 logs nuke-backend --lines 100

# Telegram bot logs
pm2 logs nuke-telegram-bot --lines 100

# All logs
pm2 logs --lines 50
```

---

## Ready to Deploy?

```bash
cd /home/van/reward-project/backend && npm run build && pm2 restart nuke-backend && pm2 restart nuke-telegram-bot
```

✅ That's it! The fix is live.
