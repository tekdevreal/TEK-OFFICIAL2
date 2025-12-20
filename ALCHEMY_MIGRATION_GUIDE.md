# Migration from Helius to Alchemy

## Overview

The backend has been updated to support Alchemy (and other Solana RPC providers) instead of being locked to Helius. The configuration now uses a generic `SOLANA_RPC_URL` environment variable.

## Environment Variable Update

### Old (Helius)
```env
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

### New (Alchemy)
```env
SOLANA_RPC_URL=https://solana-devnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
```

### Backward Compatibility
The code still supports `HELIUS_RPC_URL` for backward compatibility, but `SOLANA_RPC_URL` takes precedence if both are set.

## Alchemy URLs

### Devnet
```
https://solana-devnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
```

### Mainnet
```
https://solana-mainnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
```

## Render Environment Variable Update

1. Go to your Render service dashboard
2. Navigate to **Environment** tab
3. Find `HELIUS_RPC_URL` variable
4. Either:
   - **Option A (Recommended)**: Add new `SOLANA_RPC_URL` with Alchemy URL, then remove `HELIUS_RPC_URL`
   - **Option B**: Update `HELIUS_RPC_URL` to use Alchemy URL (works due to backward compatibility)

### For Devnet (Current)
```
SOLANA_RPC_URL=https://solana-devnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
```

### For Mainnet (When Launching)
```
SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
```

## Important Notes

### Token API (Ethereum vs Solana)
- The Alchemy "Token API" (`alchemy_getTokenBalances`) you mentioned is **for Ethereum**, not Solana
- For Solana, we use **standard Solana RPC methods** (which Alchemy fully supports)
- All existing Solana RPC calls (`getAccountInfo`, `getProgramAccounts`, `sendTransaction`, etc.) work with Alchemy
- No code changes needed beyond the URL update

### API Key Security
- Your Alchemy API key (`z83FlbBXfg6Poywg-iYz2`) is in the URL path
- Make sure this is kept secret (don't commit to public repos)
- Alchemy URLs format: `https://solana-{network}.g.alchemy.com/v2/{API_KEY}`

### Rate Limits
- Alchemy free tier typically has better rate limits than Helius free tier
- Monitor usage in Alchemy dashboard
- Upgrade plan if needed for production

## Testing

After updating the environment variable:

1. Restart your Render service
2. Check logs for: `"Solana RPC configured" {"provider":"Alchemy",...}`
3. Verify connection: `"Solana connection verified"`
4. Test tax processing: Check scheduler logs for successful operations

## Rollback

If you need to rollback to Helius:
1. Update `SOLANA_RPC_URL` back to Helius URL format
2. Or keep using `HELIUS_RPC_URL` (backward compatible)

## Code Changes Made

1. ✅ Updated `backend/src/config/env.ts` - Added `SOLANA_RPC_URL` support
2. ✅ Updated `backend/src/config/solana.ts` - Removed Helius-specific validation, added provider detection
3. ✅ Updated `backend/ENV_TEMPLATE.txt` - Added Alchemy URL examples
4. ✅ Maintained backward compatibility with `HELIUS_RPC_URL`

No changes needed to:
- Tax service (uses standard Solana RPC)
- Swap service (uses standard Solana RPC)
- Any other services (all use the same `connection` object)

