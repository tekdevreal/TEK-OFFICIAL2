# Quick Fix: Switch Back to Helius

## What You Need to Do in Render

1. Go to: https://dashboard.render.com
2. Select your backend service
3. Go to **Environment** tab
4. Find `SOLANA_RPC_URL`
5. Change it from:
   ```
   https://solana-devnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
   ```
   
   To:
   ```
   https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
   ```
   
   **Replace `YOUR_HELIUS_API_KEY` with your actual Helius API key**

6. Save
7. Wait for redeploy (automatic)

## Finding Your Helius API Key

1. Go to: https://dashboard.helius.dev/
2. Login
3. Go to API Keys
4. Find key named "Cubgranite" (Key ID: 1419cfe1-04ce-4fa4-a6d6-badda6902f4e)
5. Copy the API key value

## That's It!

No code changes needed - the backend already supports Helius URLs.

After redeploy, check logs for:
```
[INFO] Solana RPC configured {"provider":"Helius",...}
```

Errors should stop once Helius is configured.

