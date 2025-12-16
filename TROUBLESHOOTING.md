# Troubleshooting Guide

## Checking Token Holders

If the dashboard shows 0 holders but you know tokens have been transferred:

1. **Check the diagnostic endpoint:**
   ```
   GET https://nukerewards-backend.onrender.com/dashboard/diagnostics
   ```
   This will show:
   - Total holders detected
   - Sample holder addresses
   - Token mint address
   - Scheduler status

2. **Verify token mint address:**
   - Ensure `TOKEN_MINT` environment variable matches your actual token mint
   - Current token: `CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq`

3. **Check RPC connection:**
   - Verify `HELIUS_RPC_URL` is set correctly
   - Ensure the RPC endpoint is accessible and has sufficient rate limits

4. **Token-2022 account detection:**
   - The system now queries without `dataSize` filter to handle Token-2022 extensions
   - All accounts are filtered by mint address after fetching

## Checking Reward Distribution

### Is the scheduler running?

Check the scheduler status:
```bash
GET /dashboard/rewards
```

Look for:
- `lastRun`: Timestamp of last reward distribution
- `nextRun`: When the next distribution will occur
- `isRunning`: Whether a distribution is currently in progress

### Are there eligible holders?

The system requires:
1. **Minimum holding:** `MIN_HOLDING_USD` (default: $5 USD)
2. **Not blacklisted:** Wallet not in blacklist
3. **Token balance > 0:** Must hold tokens

Check eligible holders:
```bash
GET /dashboard/holders?eligibleOnly=true
```

### Are rewards being sent?

1. **Check pending payouts:**
   ```bash
   GET /dashboard/payouts
   ```
   Shows all pending reward distributions

2. **Check reward state file:**
   - The backend maintains `reward-state.json`
   - Contains `lastRewardRun`, `holderRewards`, and `pendingPayouts`

3. **Check logs:**
   - Look for "Starting reward distribution run"
   - Look for "Reward distribution run completed"
   - Check for transaction signatures

### Reward Distribution Process

1. **Scheduler runs** every `SCHEDULER_INTERVAL` (default: 5 minutes)
2. **Checks minimum interval** since last run (`MIN_REWARD_INTERVAL`)
3. **Fetches eligible holders** (meets minimum holding, not blacklisted)
4. **Computes rewards** based on holding amount
5. **Queues payouts** for eligible holders
6. **Executes payouts** (sends SOL to holders)
7. **Processes tax** (withdraws withheld tokens from Token-2022 transfers)

## Checking Raydium Price

### Is Raydium pool configured?

1. **Set environment variable:**
   ```
   RAYDIUM_POOL_ID=GFPwg4JVyRbsmNSvPGd8Wi3vvR3WVyChkjY56U7FKrc9
   ```

2. **Check Raydium endpoint:**
   ```bash
   GET /dashboard/raydium
   ```
   Should return:
   - `price`: NUKE/SOL price
   - `priceUSD`: NUKE/USD price
   - `liquidityUSD`: Pool liquidity in USD
   - `source`: "raydium" if successful

### Common Raydium Issues

1. **"Failed to fetch Raydium vault accounts":**
   - Pool ID might be incorrect
   - Pool might not exist on devnet
   - RPC connection issues

2. **"Raydium pool account not found":**
   - Verify pool ID is correct
   - Check if pool is on devnet (not mainnet)

3. **Price showing as null:**
   - Pool might have zero liquidity
   - Vault balances might be zero

## Checking Tax Distribution

### Is tax being collected?

Token-2022 automatically collects 4% tax on transfers:
- 3% → Reward wallet
- 1% → Treasury wallet

### Is tax being distributed?

1. **Check tax statistics:**
   ```bash
   GET /dashboard/rewards
   ```
   Look for `tax` object:
   - `totalTaxCollected`: Total tax collected
   - `totalRewardAmount`: Amount sent to reward wallet
   - `totalTreasuryAmount`: Amount sent to treasury wallet
   - `lastTaxDistribution`: Last time tax was processed

2. **Tax processing:**
   - Runs automatically after each reward distribution
   - Calls `TaxService.processWithheldTax()`
   - Withdraws withheld tokens from mint
   - Distributes 75% to reward wallet, 25% to treasury

### Tax Distribution Process

1. **Harvest withheld tokens** from all token accounts to mint
2. **Withdraw withheld tokens** from mint to reward wallet
3. **Split distribution:**
   - 75% of withdrawn amount → Reward wallet (3% of original)
   - 25% of withdrawn amount → Treasury wallet (1% of original)

## Environment Variables Checklist

Required:
- `TOKEN_MINT`: Your token mint address
- `HELIUS_RPC_URL`: Solana RPC endpoint
- `ADMIN_WALLET_JSON`: Admin wallet keypair (JSON array)
- `REWARD_WALLET_PRIVATE_KEY_JSON`: Reward wallet keypair (JSON array)
- `TREASURY_WALLET_ADDRESS`: Treasury wallet address

Optional but recommended:
- `RAYDIUM_POOL_ID`: Raydium pool ID for price tracking
- `TREASURY_WALLET_PRIVATE_KEY_JSON`: Treasury wallet keypair (if needed for signing)

## Common Issues

### "No eligible holders"

- Check minimum holding threshold (`MIN_HOLDING_USD`)
- Verify token price is being fetched correctly
- Check if holders meet the minimum USD value requirement

### "Rewards not being sent"

- Check scheduler is running (`isRunning: true`)
- Verify `lastRun` timestamp is updating
- Check for errors in logs
- Verify admin wallet has SOL for transaction fees

### "Holders count is 0"

- Verify `TOKEN_MINT` is correct
- Check RPC connection
- Ensure tokens have been transferred (not just minted)
- Check diagnostic endpoint for details

### "Raydium price not showing"

- Set `RAYDIUM_POOL_ID` environment variable
- Verify pool exists on devnet
- Check pool has liquidity
- Verify RPC can access pool account

