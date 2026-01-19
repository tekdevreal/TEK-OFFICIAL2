# Diagnosis: Why Dashboard Shows Epoch 1

## What the Dashboard Uses

The dashboard frontend displays epoch numbers from **`/dashboard/cycles/current` API endpoint**, specifically the `epochNumber` field.

Looking at your dashboard code:
- **"Processing" section** → Line 292: `currentCycleInfo?.epochNumber`
- **"Distributions" section** → Line 331: `currentCycleInfo?.epochNumber`  
- **RewardSystem tooltip** → Line 209: `currentCycleInfo.epochNumber`

## Root Cause Analysis

There are **3 possible reasons** you're seeing Epoch 1:

### Reason 1: Only 1 Epoch Recorded (Most Likely)

You said you **restarted the bot yesterday**, so:
- If the system started yesterday = Day 1 = **Epoch 1** ✅ This is CORRECT!
- Today would be Day 2 = Epoch 2 (but only after midnight UTC)

**To check:** What time (UTC) did you restart yesterday? If it hasn't crossed midnight UTC yet, you're still in Epoch 1!

### Reason 2: Backend Fix Not Deployed

The backend fix from line 881-885 might not be deployed to Render/Railway yet.

### Reason 3: State File Only Has 1 Entry

The `cycle-state.json` on your server might only have 1 epoch recorded.

---

## Quick Checks

### 1. Check Current UTC Time

```bash
date -u
```

If you restarted yesterday and it hasn't crossed **00:00 UTC** yet, you're still in the same epoch!

**Example:**
- Restarted: Jan 10, 2026 at 15:00 UTC → Epoch 1 starts
- Current: Jan 11, 2026 at 03:00 UTC → Epoch 2 starts
- If current time is Jan 10 at 22:00 UTC → Still Epoch 1 ✅

### 2. Check Your Production API

```bash
# Replace with your actual domain
curl https://YOUR_DOMAIN/dashboard/cycles/current | jq
```

Look at the response:
```json
{
  "epoch": "2026-01-11",           ← Date string
  "epochNumber": 1,                 ← What number do you see?
  "cycleNumber": 123,
  "cyclesPerEpoch": 288
}
```

### 3. Check How Many Epochs Exist

```bash
curl https://YOUR_DOMAIN/dashboard/cycles/epochs | jq '.total'
```

This tells you how many epochs are stored.

---

## Expected Behavior

| Scenario | Expected Epoch Number |
|----------|----------------------|
| Started yesterday, still same UTC day | **Epoch 1** ✅ CORRECT |
| Started yesterday, crossed midnight UTC | **Epoch 2** |
| Been running 3 days | **Epoch 3** |

---

## Next Steps

**Tell me:**

1. **What UTC time did you restart the system yesterday?**
2. **What is the current UTC time now?**
3. **What's your production domain?** (I'll check the API)

This will tell us if Epoch 1 is actually correct, or if there's a real bug!

---

## Important: Understanding Epochs

An epoch = **1 UTC calendar day** (00:00 to 23:59 UTC)

- Start system on **Jan 10 at 15:00 UTC** → Epoch 1
- Still **Jan 10 at 23:00 UTC** → Still Epoch 1 ✅
- Midnight hits (**Jan 11 at 00:00 UTC**) → Epoch 2 starts

**So if you restarted yesterday and it's still the same UTC day, Epoch 1 is CORRECT!**

---

## If It Should Be Epoch 2+

If you definitely should be on Epoch 2 or higher, then we need to:

1. **Verify the backend fix is deployed** to Render/Railway
2. **Check the state file** has multiple epochs
3. **Push the latest fix** we just made

**Run this to commit and push:**

```bash
cd /home/van/reward-project
git add backend/src/routes/dashboard.ts
git commit -m "Fix: Epoch counting - sort epochs oldest-first in both API endpoints"
git push origin main
```

Then wait 2-5 minutes for Render/Railway to redeploy.
