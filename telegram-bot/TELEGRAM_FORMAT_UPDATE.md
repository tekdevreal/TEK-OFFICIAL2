# Telegram Bot Message Format Update

## Updated Format

The Telegram notification message format has been updated to:

```
💰 NUKE Rewards Distributed

• Total: <total_sol> SOL
• Holders: <sol_to_holders> SOL
• Treasury: <sol_to_treasury> SOL
• Epoch: <timestamp>
```

## Changes Made

1. **Emoji**: Changed from 🎁 to 💰
2. **Total**: Shows total SOL distributed (holders + treasury combined)
3. **Holders**: Shows SOL amount distributed to holders
4. **Treasury**: Shows SOL amount sent to treasury
5. **Epoch**: Shows timestamp of the distribution (formatted as ISO datetime)

## Example Output

```
💰 NUKE Rewards Distributed

• Total: 1.500000 SOL
• Holders: 1.125000 SOL
• Treasury: 0.375000 SOL
• Epoch: 2025-12-27 13:30:45
```

## Implementation Details

- **Total**: Calculated as `solToHolders + solToTreasury`
- **Holders**: From `tax.totalSolDistributed` (converted from lamports to SOL)
- **Treasury**: From `tax.totalSolToTreasury` (converted from lamports to SOL)
- **Epoch**: From `tax.lastTaxDistribution` timestamp (formatted as `YYYY-MM-DD HH:mm:ss`)

## File Modified

- `telegram-bot/src/index.ts` - Updated `fetchSwapDistributionNotification()` function

## Testing

After deploying, the bot will send notifications in the new format when rewards are distributed.

