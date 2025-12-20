# Build and Push - Standard AMM Pool Support

## Summary of Changes

✅ **Fixed pool type validation** - Now accepts both "Standard" AMM (v4) and "Cpmm" pools
✅ **Updated swap instruction** - Uses Raydium AMM v4 program ID (same for both pool types)
✅ **Maintained transfer-fee handling** - NUKE's 4% fee is properly accounted for
✅ **Transaction simulation** - Added before sending to catch errors early
✅ **Better error logging** - Extracts and logs transaction simulation errors

## Build and Push Commands

```bash
# Build Backend
cd ~/reward-project/backend
npm run build

# Build Frontend
cd ~/reward-project/frontend
npm run build

# Push to GitHub
cd ~/reward-project
git add .
git commit -m "Fix swap service: Support Standard AMM and CPMM pools

- Accept both 'Standard' and 'Cpmm' pool types from Raydium API
- Use Raydium AMM v4 program ID (same for both pool types)
- Remove CPMM-only restriction that was rejecting Standard pools
- Maintain transfer-fee handling for NUKE (4% fee)
- Add transaction simulation before sending
- Better error logging with getLogs()

Fixes error: Pool type 'Standard' is not CPMM"

git push origin main
```

## What This Fixes

The error `Pool type "Standard" is not CPMM. Only CPMM pools are supported.` will be resolved.

The NUKE/SOL pool on devnet uses type "Standard" but works identically to CPMM pools - both use the same Raydium AMM v4 program ID and instruction format.

