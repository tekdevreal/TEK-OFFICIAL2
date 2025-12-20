# Helius Endpoint Correction

## Issue

You're using the **WebSocket endpoint** (`wss://`) but we need the **HTTP endpoint** (`https://`) for Solana RPC calls.

## Correct Format

### HTTP Endpoint (What we need):
```
https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

### WebSocket Endpoint (What you have):
```
wss://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

## Fix in .env file

Change from:
```
SOLANA_RPC_URL=wss://devnet.helius-rpc.com/?api-key=1419cfe1-04ce-4fa4-a6d6-badda6902f4e
```

To:
```
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=1419cfe1-04ce-4fa4-a6d6-badda6902f4e
```

**Change `wss://` to `https://`**

## Fix in Render Environment Variables

1. Go to Render Dashboard → Your Backend Service → Environment
2. Find `SOLANA_RPC_URL`
3. Make sure it uses `https://` not `wss://`:
   ```
   https://devnet.helius-rpc.com/?api-key=1419cfe1-04ce-4fa4-a6d6-badda6902f4e
   ```

## About the API Key

The value `1419cfe1-04ce-4fa4-a6d6-badda6902f4e` appears to be your Key ID. 

- If this works with `https://`, then it's correct
- If you still get "Method not found" errors, you may need to get the actual API key from the Helius dashboard

To check:
1. Go to https://dashboard.helius.dev/
2. Click on your API key "Cubgranite"
3. See if there's a separate "API Key" field or if the Key ID itself is the API key

