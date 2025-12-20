# Fix Swap Program ID

## Issue
The swap was failing with "This program may not be used for executing instructions" because we were using a pool ID (`14nA4A3DMMXrpPBhrX1sLTG4dSQKCwPHnoe3k4P1nZbx` - the NUKE/USDC pool AMM ID) instead of the actual Raydium CPMM program ID.

## Solution
Changed to use `RAYDIUM_AMM_PROGRAM_ID` (`675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`), which is the actual program that executes CPMM swaps on all Raydium CPMM pools.

## Build and Push

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
git commit -m "Fix swap program ID - use actual Raydium CPMM program

- Use RAYDIUM_AMM_PROGRAM_ID instead of pool ID
- Fixes 'This program may not be used for executing instructions' error
- Pool reserves fetching from API already working
- Swap should now execute correctly"

git push origin main
```

## Progress

✅ **Harvest** - Working
✅ **Withdrawal** - Working  
✅ **Pool Validation** - Fixed (using Raydium API)
✅ **Reserves Fetching** - Fixed (using Raydium API)
✅ **Program ID** - Fixed (using actual program ID, not pool ID)
⏳ **Swap Execution** - Should work now
⏳ **Distribution** - Will work once swap succeeds

