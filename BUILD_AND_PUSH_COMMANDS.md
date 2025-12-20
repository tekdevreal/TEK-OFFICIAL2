# Build and Push Commands

## Build Commands

```bash
# Build Backend
cd ~/reward-project/backend
npm run build

# Build Frontend
cd ~/reward-project/frontend
npm run build
```

## GitHub Push Commands

```bash
# Navigate to project root
cd ~/reward-project

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "Fix Raydium CPMM swap - InstructionFallbackNotFound error

- Create CPMM-specific swap instruction function (createRaydiumCpmmSwapInstruction)
- Use pool program ID from API response instead of hardcoded AMM v4 ID
- Fix InstructionFallbackNotFound error by using correct pool program ID (DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb)
- Improve WSOL account creation handling before swap
- Ensure Token-2022 to SPL Token swap uses correct token program ID
- Add liquidity verification before swap attempts
- Fetch reserves from chain when API doesn't provide them
- Remove hardcoded reserve fallbacks (no more zero reserves)
- Add comprehensive error handling and logging

Key Changes:
- CPMM pools now use pool-specific program ID from API
- Transfer fee (4%) correctly accounted for in swap calculations
- Pre-creates destination WSOL account if needed
- Better error messages for debugging

Fixes:
- InstructionFallbackNotFound (Custom 101) error
- Pool mint information incomplete warnings
- Expected SOL output too low errors due to zero reserves
- Swaps failing due to insufficient liquidity"

# Push to GitHub
git push origin main
```

## One-Line Commands (for convenience)

```bash
# Build both and push (run from project root)
cd ~/reward-project && \
cd backend && npm run build && \
cd ../frontend && npm run build && \
cd .. && \
git add . && \
git commit -m "Fix Raydium CPMM swap - InstructionFallbackNotFound error" && \
git push origin main
```

## Verification Commands

After pushing, verify with:

```bash
# Check git status
git status

# Check recent commits
git log --oneline -5

# Check if remote is up to date
git fetch origin
git status
```
