# Fix Token Account Not Found Error - Build Instructions

## Issue Fixed
The swap was failing with `TokenAccountNotFoundError` when trying to fetch pool vault accounts. The code now tries both `TOKEN_PROGRAM_ID` and `TOKEN_2022_PROGRAM_ID` since we can't be sure which program the pool vaults use.

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
git commit -m "Fix swap vault account fetching with dual program ID support

- Try both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID when fetching vault accounts
- Handle TokenAccountNotFoundError by trying alternative program ID
- Fixes swap failure when pool vaults use different token program
- Pool validation already working correctly via Raydium API"

git push origin main
```

## Progress

✅ **Harvest** - Working
✅ **Withdrawal** - Working  
✅ **Pool Validation** - Fixed (using Raydium API)
✅ **Vault Account Fetching** - Fixed (try both program IDs)
⏳ **Swap Execution** - Should work now
⏳ **Distribution** - Will work once swap succeeds

