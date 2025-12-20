# Swap Pool Validation Fix - Build and Push

## Problem
- Harvest ✅ Working
- Withdrawal ✅ Working  
- Swap ❌ Failing: "Pool does not contain NUKE token"

The tokens are correctly harvested and withdrawn to the reward wallet, but the swap fails because the pool validation couldn't find NUKE in the pool.

## Solution
Updated `swapService.ts` to use Raydium API first to fetch pool mint addresses, then falls back to account parsing. This is more reliable than parsing the account structure directly.

## Build and Push Commands

```bash
# Build Backend
cd ~/reward-project/backend
npm run build

# Build Frontend (if needed)
cd ~/reward-project/frontend
npm run build

# Push to GitHub
cd ~/reward-project
git add .
git commit -m "Fix swap pool validation using Raydium API

- Use Raydium API to fetch pool mint addresses (more reliable)
- Falls back to account parsing if API fails
- Add detailed logging for pool state debugging
- Fixes 'Pool does not contain NUKE token' error
- Tokens in reward wallet from previous failed swap will be processed in next cycle"

git push origin main
```

## After Deployment

1. Wait for next reward cycle (every 5 minutes) OR
2. Trigger manual distribution if you have an endpoint for it

The existing NUKE tokens in the reward wallet (from the previous successful harvest/withdrawal) will be swapped and distributed in the next cycle.

## What to Expect

Next cycle logs should show:
1. ✅ Harvest (if new tokens)
2. ✅ Withdrawal (if new tokens)  
3. ✅ **Swap** (should now work!)
4. ✅ Distribution to holders

If the swap still fails after deployment, check the logs for the pool state details - the new logging will show exactly what mints are found in the pool.

