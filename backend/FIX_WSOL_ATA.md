# Fix WSOL ATA Missing Error

## Problem

The reward wallet's WSOL ATA is missing:
- **Reward Wallet**: `6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo`
- **Missing WSOL ATA**: `6PuYLyAEt15pFhGxk94aKUUux3Uo3cDei143B5gfshV7`

This prevents swaps from executing because Raydium requires the WSOL ATA to exist on-chain.

## Solution

Run the existing WSOL ATA creation script. It will:
1. Check if the ATA exists
2. Create it if missing
3. Verify creation

## Quick Fix Command

```bash
cd /home/van/reward-project/backend
npx tsx create-wsol-atas.ts
```

## Expected Output

```
=== WSOL ATA Creation Script ===

Network: devnet
RPC: https://devnet.helius-rpc.com/?api-key=...

Reward Wallet:
  Public Key: 6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
  WSOL ATA:   6PuYLyAEt15pFhGxk94aKUUux3Uo3cDei143B5gfshV7
  ⚠️  WSOL ATA does not exist - creating...
  Using Reward Wallet as payer: 6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
  ✅ WSOL ATA created successfully!
  Transaction: https://solscan.io/tx/...?cluster=devnet

=== Verification ===

✅ Reward Wallet WSOL ATA exists: 6PuYLyAEt15pFhGxk94aKUUux3Uo3cDei143B5gfshV7
   Balance: 0

=== Complete ===
WSOL ATAs have been created. Swaps should now work correctly.
```

## Prerequisites

1. **Environment Variables Set**
   - Make sure `.env` file has `REWARD_WALLET_PRIVATE_KEY_JSON`
   - The script uses the reward wallet as payer

2. **Reward Wallet Has SOL**
   - Needs at least 0.002 SOL for transaction fees
   - Check balance: The script will warn if insufficient

## Verify After Creation

After running the script, verify it worked:

1. **Check Solscan**
   - Go to: https://solscan.io/account/6PuYLyAEt15pFhGxk94aKUUux3Uo3cDei143B5gfshV7?cluster=devnet
   - Should show the WSOL token account exists

2. **Next Swap Attempt**
   - The next time the reward system runs, swaps should work
   - Check logs for: "WSOL ATA verified on-chain"

## Troubleshooting

### Error: "Cannot create WSOL ATA: Need REWARD_WALLET_PRIVATE_KEY_JSON"

**Fix**: Make sure `.env` file contains:
```env
REWARD_WALLET_PRIVATE_KEY_JSON=[99,116,89,4,241,26,...]
```

### Error: "Payer wallet has insufficient SOL"

**Fix**: Fund the reward wallet:
```bash
# On devnet, use a faucet or transfer SOL to:
# 6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
```

### Error: "ATA already in use" or Script Says It Exists

**Good news!** The ATA already exists. The swap should work on the next run.

### Script Runs but Swaps Still Fail

1. Wait 30 seconds for transaction to confirm
2. Verify on Solscan (link will be in script output)
3. Check that the address matches: `6PuYLyAEt15pFhGxk94aKUUux3Uo3cDei143B5gfshV7`

## One-Time Operation

⚠️ **This only needs to be done ONCE per wallet**. Once the WSOL ATA is created, it persists on-chain and all future swaps will work.

## What Happens Next

After the WSOL ATA is created:
1. ✅ Tax harvest will work
2. ✅ NUKE → SOL swaps will execute
3. ✅ Rewards will be distributed
4. ✅ System will function normally

The error you're seeing is a **safe, one-time setup issue**, not a logic problem!

