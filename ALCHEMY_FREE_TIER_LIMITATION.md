# Alchemy Free Tier Limitation - getProgramAccounts

## Problem

Alchemy's **free tier does NOT support `getProgramAccounts`**, which is a critical method required by the backend to:
- Fetch all token holders (`solanaService.getTokenHolders()`)
- Scan token accounts for withheld tax fees (`taxService.processWithheldTax()`)

Error message:
```
"getProgramAccounts is not available on the Free tier - upgrade to Pay As You Go, or Enterprise for access."
```

## Impact

- ❌ Backend cannot fetch token holders → Dashboard shows errors
- ❌ Tax service cannot scan token accounts → Tax processing fails
- ❌ Telegram bot receives 500 errors → Notifications fail
- ❌ Frontend cannot load holder data → User experience degraded

## Solutions

### Option 1: Upgrade Alchemy to Pay As You Go (Recommended)

1. Go to Alchemy Dashboard: https://dashboard.alchemy.com/
2. Navigate to your app
3. Upgrade to "Pay As You Go" tier
4. This enables `getProgramAccounts` and other advanced methods
5. Pricing: Typically starts around $49/month with usage-based billing

**Pros:**
- ✅ Full RPC functionality
- ✅ Better rate limits
- ✅ Production-ready
- ✅ Supports all Solana RPC methods

**Cons:**
- 💰 Requires paid plan
- 💰 Usage-based billing (but reasonable for most apps)

### Option 2: Switch Back to Helius (If Credits Available)

If you still have Helius credits remaining:

1. Update `SOLANA_RPC_URL` in Render to your Helius URL:
   ```
   SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
   ```

**Pros:**
- ✅ Free tier supports `getProgramAccounts`
- ✅ No code changes needed

**Cons:**
- ⚠️ Limited credits on free tier
- ⚠️ Will run out eventually

### Option 3: Use QuickNode or Triton (Alternative RPC Providers)

**QuickNode:**
- Free tier: Limited but may support `getProgramAccounts`
- Check: https://www.quicknode.com/

**Triton (Free Public RPC):**
- Completely free
- May have rate limits
- URL: `https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY` (wait, that's Alchemy)

Actually, for Solana devnet, you can try:
- Public RPC: `https://api.devnet.solana.com` (but has strict rate limits)
- Triton: Check their documentation

### Option 4: Hybrid Approach (Temporary Workaround)

Use Helius for `getProgramAccounts` operations only, and Alchemy for other operations. However, this would require significant code changes and is not recommended.

## Recommended Action

For **production/mainnet**, upgrade to **Alchemy Pay As You Go** tier. This is the standard approach and ensures reliability.

For **devnet/testing**, you could:
1. Continue using Helius free tier if credits remain
2. Upgrade Alchemy to test the full production setup
3. Use public Solana RPC (with rate limit handling)

## How to Update Render

Once you decide on a solution:

1. Go to Render Dashboard → Your Backend Service → Environment
2. Update `SOLANA_RPC_URL` with the chosen provider's URL
3. Save and redeploy

### For Alchemy Pay As You Go:
```
SOLANA_RPC_URL=https://solana-devnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
```

### For Helius (if switching back):
```
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
```

## Testing

After updating, check logs for:
- ✅ `"Solana RPC configured"` with correct provider
- ✅ No `getProgramAccounts` errors
- ✅ Successful token holder fetches
- ✅ Successful tax processing

