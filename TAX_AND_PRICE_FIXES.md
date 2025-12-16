# Tax Harvesting and Price Fixes

## Issues Fixed

### 1. Tax Harvesting Not Working

**Problem:**
- Tax harvesting was failing because the withdraw authority on the mint might not match the reward wallet
- The system was only trying to use the reward wallet, but the authority might be set to the admin wallet

**Solution:**
- Added automatic detection of withdraw authority from the mint's transfer fee config
- System now tries reward wallet first, then falls back to admin wallet if authority doesn't match
- Added better error messages when authority mismatch is detected
- Improved balance tracking (tracks balance before/after withdrawal to calculate exact amount withdrawn)

**Changes:**
- `backend/src/services/taxService.ts`:
  - Checks mint's transfer fee config to get withdraw authority
  - Automatically selects correct wallet (reward or admin) based on authority
  - Better error handling and logging
  - Tracks balance before withdrawal to calculate exact amount

### 2. Price Calculation

**Problem:**
- Price might be showing incorrectly from Raydium

**Solution:**
- Added detailed logging to show price calculation breakdown
- Logs show: base amount, quote amount, decimals, and final price

**Changes:**
- `backend/src/services/raydiumService.ts`:
  - Enhanced logging to show price calculation details
  - Shows base/quote amounts and decimals for debugging

## How to Check Tax Authority

Run the diagnostic script to check who the withdraw authority is:

```bash
npx ts-node check-mint-authority.ts
```

This will show:
- Current withdraw withheld authority
- Whether it matches reward wallet or admin wallet
- Instructions on how to fix if it doesn't match

## Next Steps

1. **Check the withdraw authority:**
   ```bash
   npx ts-node check-mint-authority.ts
   ```

2. **If authority doesn't match reward wallet:**
   - Option A: Update the withdraw authority to the reward wallet (recommended)
   - Option B: The system will automatically use admin wallet as fallback

3. **Monitor tax harvesting:**
   - Check logs for "Processing withheld tax from Token-2022 transfers"
   - Look for "Withdrew withheld tokens" messages
   - Check `/dashboard/rewards` endpoint for tax statistics

4. **Check price:**
   - View detailed price logs in backend logs
   - Check `/dashboard/raydium` endpoint for price breakdown

## Testing

After deploying:
1. Make a token transfer (buy/sell)
2. Wait for scheduler to run (or trigger manually)
3. Check logs for tax harvesting messages
4. Verify tax statistics in `/dashboard/rewards`

