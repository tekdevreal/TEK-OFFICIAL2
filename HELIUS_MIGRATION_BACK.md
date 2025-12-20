# Switching Back to Helius RPC

## Overview

We're switching back to Helius because Alchemy's free tier doesn't support `getProgramAccounts`, which is required for:
- Fetching token holders
- Scanning token accounts for tax processing

## New Helius Account Details

- **Key Name:** Cubgranite
- **Key ID:** 1419cfe1-04ce-4fa4-a6d6-badda6902f4e
- **Credits:** 1 million (free tier)
- **Network:** Devnet

## Render Environment Variable Update

### Step-by-Step Instructions

1. Go to Render Dashboard: https://dashboard.render.com
2. Select your backend service (`nukerewards-backend`)
3. Navigate to **Environment** tab
4. Find `SOLANA_RPC_URL` variable
5. Update it to:
   ```
   SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
   ```
   **Replace `YOUR_HELIUS_API_KEY` with your actual Helius API key**

6. Save changes
7. Render will automatically redeploy

### For Mainnet (When Launching)

When you're ready for mainnet, use:
```
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
```

## How to Find Your Helius API Key

1. Go to Helius Dashboard: https://dashboard.helius.dev/
2. Log in with your account
3. Navigate to your API keys
4. Find the key named "Cubgranite" (Key ID: 1419cfe1-04ce-4fa4-a6d6-badda6902f4e)
5. Copy the API key
6. Paste it into the Render environment variable

## Code Status

✅ **No code changes needed** - The backend already supports Helius URLs via `SOLANA_RPC_URL`

The code detects the provider automatically:
- `host.includes('helius')` → Logs as "Helius"
- `host.includes('alchemy.com')` → Logs as "Alchemy"
- Otherwise → Logs as "Custom"

## Verification

After updating and redeploying, check logs for:
```
[INFO] Solana RPC configured {"provider":"Helius","host":"devnet.helius-rpc.com","network":"devnet"}
[INFO] Solana connection verified
```

You should **NOT** see errors like:
- ❌ `"getProgramAccounts is not available on the Free tier"`
- ❌ `Error fetching token holders`
- ❌ `Error getting all holders with status`

Instead, you should see:
- ✅ Successful token holder fetches
- ✅ Successful tax processing
- ✅ Dashboard loading correctly

## What Changed

- ✅ Backend code already supports Helius (no changes needed)
- ✅ Generic `SOLANA_RPC_URL` environment variable works with both providers
- ✅ Provider detection automatically identifies Helius
- ⚠️ Removed Alchemy-specific code (we're back to Helius)

## Notes

- Helius free tier **DOES support** `getProgramAccounts` ✅
- 1 million credits should be sufficient for devnet testing
- Monitor credit usage in Helius dashboard
- For mainnet/production, consider upgrading Helius plan or using paid Alchemy

