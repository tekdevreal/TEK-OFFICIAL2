# WSOL ATA and Helius RPC Explanation

## Issue 1: Helius RPC URL Shows "Method not found" in Browser

**This is NORMAL and expected behavior.**

When you visit the Helius RPC URL in a browser:
```
https://devnet.helius-rpc.com/?api-key=1419cfe1-04ce-4fa4-a6d6-badda6902f4e
```

You see:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Method not found"
  }
}
```

**Why this happens:**
- Helius RPC endpoints require **POST requests** with JSON-RPC method calls
- Browsers send **GET requests** when you type a URL
- The endpoint expects a JSON-RPC request body with a method like `getBalance`, `getAccountInfo`, etc.
- Your backend code correctly uses POST requests, so it works fine from the application

**This is NOT an error** - it's expected behavior. Your backend will work correctly with this Helius URL.

---

## Issue 2: WSOL ATA (Associated Token Account)

### What is WSOL ATA?

WSOL ATA is a **Wrapped SOL Associated Token Account**. It's required for Raydium swaps when converting NUKE tokens to SOL.

### Does WSOL ATA need to be in .env file?

**NO** - The WSOL ATA address is **derived** from your reward wallet address. It's a deterministic address calculated using:
- Your reward wallet public key (`REWARD_WALLET_ADDRESS`)
- The WSOL mint address (Wrapped SOL)

You **cannot** put it in `.env` because:
1. It's calculated, not stored
2. It exists **on-chain** (on the Solana blockchain)
3. Once created, it exists **permanently** on that network

### Will WSOL ATA disappear after Render deployments?

**NO** - Once the WSOL ATA is created on-chain, it exists **forever** on that network (devnet or mainnet). Render deployments don't affect on-chain state.

### Why did the error occur?

The error occurred because:
1. The WSOL ATA doesn't exist on-chain yet (for your reward wallet address)
2. OR it was created on a different network (mainnet vs devnet)
3. OR it was created but the transaction failed

### Solution: Create WSOL ATA Once

Run the script **once** to create the WSOL ATA:

```bash
cd backend
npx tsx create-wsol-atas.ts
```

**Prerequisites:**
- `REWARD_WALLET_ADDRESS` must be set in `.env` or environment
- `REWARD_WALLET_PRIVATE_KEY_JSON` must be set (to pay for transaction fees)
- Reward wallet must have at least 0.002 SOL for transaction fees

**What the script does:**
1. Derives the WSOL ATA address from your reward wallet address
2. Checks if the ATA already exists on-chain
3. If it exists: ✅ Shows success message
4. If it doesn't exist: Creates it and pays transaction fees
5. Verifies the ATA was created successfully

**After creation:**
- The WSOL ATA exists **permanently** on-chain
- You never need to create it again (unless you switch networks or use a different wallet)
- Your swaps will work correctly

---

## Environment Variables Required

### For WSOL ATA Creation Script:

```env
# Required
REWARD_WALLET_ADDRESS=6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
REWARD_WALLET_PRIVATE_KEY_JSON=[...]  # JSON array of 64 numbers

# Optional (only if treasury wallet performs swaps)
TREASURY_WALLET_ADDRESS=DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo
```

### For Backend Application:

```env
# Required
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=1419cfe1-04ce-4fa4-a6d6-badda6902f4e
REWARD_WALLET_ADDRESS=6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
REWARD_WALLET_PRIVATE_KEY_JSON=[...]

# WSOL ATA address is NOT needed - it's derived automatically
```

---

## Summary

1. **Helius "Method not found"**: ✅ Normal - browser sends GET, RPC needs POST
2. **WSOL ATA in .env**: ❌ Not needed - it's derived from wallet address
3. **WSOL ATA persistence**: ✅ Permanent on-chain - won't disappear after deployments
4. **Solution**: Run `create-wsol-atas.ts` **once** to create the ATA on-chain

After running the script once, your swaps will work correctly and you won't see this error again (unless you switch networks or use a different wallet address).

