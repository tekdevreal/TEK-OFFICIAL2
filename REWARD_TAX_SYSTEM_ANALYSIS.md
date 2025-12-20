# Reward/Tax System Analysis

## System Overview

The reward system uses **Token-2022 transfer fees** to collect a 4% tax on all NUKE token transfers. The tax is automatically withheld by the Token-2022 program and then processed by the backend.

### Architecture Flow

```
1. User trades/swaps NUKE tokens (on Raydium, wallet-to-wallet, etc.)
   ↓
2. Token-2022 program automatically withholds 4% tax on transfer
   ↓
3. Scheduler runs every 5 minutes (rewardScheduler.ts)
   ↓
4. TaxService.processWithheldTax() is called:
   a. Scans ALL token accounts for withheld fees (getProgramAccounts)
   b. Harvests fees from token accounts → mint (harvestWithheldTokensToMint)
   c. Withdraws fees from mint → reward wallet (withdrawWithheldTokensFromAccounts)
   ↓
5. Swaps NUKE → SOL via Raydium (swapService.ts)
   ↓
6. Distributes SOL:
   - 75% → Eligible holders (proportional to holdings)
   - 25% → Treasury wallet
```

## Helius RPC Dependency Analysis

### ✅ YES - Tax/Reward System REQUIRES Helius (or any Solana RPC)

The tax processing system **absolutely requires** a Solana RPC connection because it needs to:

#### 1. **Read On-Chain Data** (Helius RPC calls)
   - `getMint(connection, ...)` - Read mint account info (check transfer fee config, withheld amounts)
   - `connection.getAccountInfo(tokenMint)` - Read mint account data
   - `connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, ...)` - Scan ALL token accounts for withheld fees
   - `getAccount(connection, ...)` - Read token account balances
   - `connection.getAccountInfo(poolId)` - Read Raydium pool state
   - `connection.getLatestBlockhash(...)` - Get latest blockhash for transactions

#### 2. **Send Transactions** (Helius RPC calls)
   - `harvestWithheldTokensToMint(...)` - Harvest fees from token accounts to mint
   - `withdrawWithheldTokensFromAccounts(...)` - Withdraw fees from mint to reward wallet
   - `sendAndConfirmTransaction(connection, ...)` - Send swap transactions (NUKE → SOL)
   - `sendAndConfirmTransaction(connection, ...)` - Send distribution transactions (SOL to holders)

### Current Rate Limit Issues

From the logs, you're seeing rate limits on:
1. **Token holder fetching** - `getProgramAccounts()` to scan all token accounts
2. **Account info fetching** - `getAccountInfo()` calls
3. **Tax processing** - Multiple RPC calls during harvest/withdraw operations

## Files Structure

### Core Services

1. **`backend/src/services/taxService.ts`**
   - Main tax processing logic
   - Harvests withheld tokens
   - Withdraws to reward wallet
   - Swaps NUKE to SOL
   - Distributes SOL to holders

2. **`backend/src/services/swapService.ts`**
   - Handles NUKE → SOL swaps via Raydium CPMM pool
   - Uses pool ID from environment: `RAYDIUM_POOL_ID` (NUKE/SOL pool)
   - Uses AMM ID: `14nA4A3DMMXrpPBhrX1sLTG4dSQKCwPHnoe3k4P1nZbx` (NUKE/USDC pool)

3. **`backend/src/scheduler/rewardScheduler.ts`**
   - Runs every 5 minutes (`REWARD_CONFIG.SCHEDULER_INTERVAL`)
   - Calls `TaxService.processWithheldTax()`
   - Records reward cycles for history

4. **`backend/src/config/solana.ts`**
   - Configures Helius RPC connection
   - Exports `connection` object used by all services

## RPC Call Breakdown

### Tax Processing (per scheduler run)

1. **Initial checks**:
   - `getMint(connection, tokenMint, ...)` - 1 call
   - `connection.getAccountInfo(tokenMint)` - 1 call

2. **Scan token accounts**:
   - `connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, ...)` - 1 call (reads ALL token accounts)

3. **Harvest withheld tokens**:
   - `connection.getAccountInfo(tokenMint)` - 1 call (before harvest)
   - `harvestWithheldTokensToMint(...)` - 1 transaction (multiple RPC calls internally)
   - `connection.getAccountInfo(tokenMint)` - 1 call (after harvest to verify)

4. **Withdraw from mint**:
   - `connection.getAccountInfo(tokenMint)` - 1 call
   - `withdrawWithheldTokensFromAccounts(...)` - 1 transaction (multiple RPC calls internally)

5. **Swap NUKE → SOL**:
   - `getMint(connection, tokenMint, ...)` - 1 call
   - `getAccount(connection, rewardNukeAccount, ...)` - 1 call
   - `connection.getAccountInfo(poolId)` - 1 call
   - `connection.getLatestBlockhash(...)` - 1 call
   - `sendAndConfirmTransaction(...)` - 1 transaction (multiple RPC calls internally)

6. **Distribute SOL to holders**:
   - `connection.getLatestBlockhash(...)` - 1 call per batch
   - `sendAndConfirmTransaction(...)` - Multiple transactions (one per holder batch)

**Total: ~10-20+ RPC calls per scheduler run (if there's tax to process)**

## Solutions for Rate Limiting

### Current Optimizations

1. ✅ **Caching for token holders** - 5 minute TTL prevents redundant scans
2. ✅ **Scheduler runs every 5 minutes** - Not too frequent
3. ✅ **Error handling** - Graceful fallbacks when rate limited

### Recommendations

1. **Upgrade Helius Plan** (when launching to mainnet)
   - Free tier has very low limits
   - Paid plans offer much higher rate limits
   - Critical for production use

2. **Alternative RPC Providers** (for redundancy)
   - QuickNode
   - Alchemy
   - Triton
   - Can use as fallback if Helius is rate limited

3. **Batch Operations** (already implemented)
   - Distribution transactions are batched
   - Reduces number of transactions

4. **Adjust Scheduler Frequency** (if needed)
   - Current: Every 5 minutes
   - Can increase to 10-15 minutes if rate limits persist

5. **Monitor and Optimize**
   - Log all RPC calls to track usage
   - Identify which operations use most RPC calls
   - Optimize hot paths

## Testing the Tax System

To verify the tax system is working:

1. **Check scheduler logs**:
   ```
   [INFO] Processing withheld tax from Token-2022 transfers
   [INFO] Tax distribution completed
   ```

2. **Check for errors**:
   ```
   [ERROR] Error processing withheld tax
   ```

3. **Verify transactions**:
   - Check reward wallet balance (should receive NUKE from tax harvesting)
   - Check swap transactions (NUKE → SOL)
   - Check holder distributions (SOL sent to eligible holders)

4. **Check tax statistics**:
   - Call `/dashboard/tax/stats` endpoint
   - Verify `totalTaxCollected`, `totalSolDistributed`, etc.

## Conclusion

**The tax/reward system CANNOT function without a Solana RPC provider (Helius).**

- ✅ It needs to read on-chain data (mint info, accounts, balances)
- ✅ It needs to send transactions (harvest, withdraw, swap, distribute)
- ⚠️ All operations use the same `connection` object from `config/solana.ts` (Helius)

**For devnet (current):**
- Free Helius plan is sufficient for testing
- Rate limits are expected with heavy usage
- System will continue working when limits reset

**For mainnet (production):**
- **MUST upgrade Helius plan** or use alternative RPC provider
- Higher rate limits essential for reliable operation
- Consider redundancy (multiple RPC providers with failover)

