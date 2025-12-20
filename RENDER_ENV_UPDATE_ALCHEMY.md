# Render Environment Variable Update - Alchemy Migration

## Quick Update Steps

1. Go to your Render dashboard: https://dashboard.render.com
2. Select your backend service
3. Go to **Environment** tab
4. Add/Update the following variable:

### For Devnet (Current Setup)
```
SOLANA_RPC_URL=https://solana-devnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
```

### For Mainnet (When Launching)
```
SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
```

5. (Optional) Remove `HELIUS_RPC_URL` if it exists (backward compatible, but cleaner to use new variable)
6. Save changes
7. Render will automatically redeploy

## What Changed

- ✅ Code updated to use `SOLANA_RPC_URL` (generic, works with any RPC provider)
- ✅ Backward compatible with `HELIUS_RPC_URL` (if you keep it, it will still work)
- ✅ Removed Helius-specific validation (no longer requires `?api-key=` query param)
- ✅ Added provider detection (logs show "Alchemy", "Helius", or "Custom")

## Verification

After deployment, check logs for:
```
[INFO] Solana RPC configured {"provider":"Alchemy","host":"solana-devnet.g.alchemy.com","network":"devnet"}
[INFO] Solana connection verified
```

## Important Notes

- **No Token API needed** - The Alchemy Token API you saw is for Ethereum. Solana uses standard RPC methods which Alchemy fully supports.
- **API Key in URL** - Your API key (`z83FlbBXfg6Poywg-iYz2`) is in the URL path. Keep it secret!
- **Rate Limits** - Alchemy free tier typically has better limits than Helius free tier

