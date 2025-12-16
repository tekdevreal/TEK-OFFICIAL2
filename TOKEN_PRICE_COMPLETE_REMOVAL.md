# Complete Token Price Removal for Debugging

## Purpose
Completely remove token price functionality from dashboard to isolate crash issue.

## Changes Made

### Backend - `dashboard.ts`

1. **Removed imports:**
   - Commented out: `import { getNUKEPriceSOL, ... } from '../services/priceService'`
   - Kept: `import { getRaydiumData }` (only used in /raydium endpoint)

2. **Removed from `/dashboard/rewards` endpoint:**
   - Commented out: `getNUKEPriceSOL()` call
   - Commented out: `getRaydiumData()` call
   - Removed `tokenPrice` from response
   - Removed `dex` from response
   - Removed `tokenPrice` from error response

3. **Removed from `/dashboard/diagnostics` endpoint:**
   - Commented out: `getNUKEPriceSOL()` call
   - Commented out: `getRaydiumData()` call
   - Removed `price` object from response

4. **Kept `/dashboard/raydium` endpoint:**
   - Still functional (separate endpoint, not used by main dashboard)

### Frontend - Type Definitions

1. **`types/api.ts`:**
   - Commented out `tokenPrice` field in `RewardsResponse` interface

2. **`services/api.ts`:**
   - Removed `tokenPrice` from fallback response
   - Removed tokenPrice validation

3. **Components already updated:**
   - `RewardSummary.tsx`: Token price display already commented out
   - `HarvestPage.tsx`: Token price export already commented out

## What Still Works

- Reward eligibility checks (uses price internally but returns empty array if unavailable)
- All other dashboard functionality
- Statistics display
- Holder management
- Payout tracking

## What's Disabled

- Token price display in dashboard
- Token price in Excel exports
- Token price in diagnostics
- DEX data display

## Testing

After this change:
1. Dashboard should load without crashing
2. No token price errors in logs
3. All other functionality should work
4. Eligibility checks will return empty array if price unavailable (expected behavior)

## Re-enabling Token Price

To re-enable:
1. Uncomment all commented sections
2. Fix the Raydium API integration
3. Ensure price extraction works correctly
4. Re-enable one component at a time

## Files Modified

**Backend:**
- `backend/src/routes/dashboard.ts`

**Frontend:**
- `frontend/src/types/api.ts`
- `frontend/src/services/api.ts`
- `frontend/src/components/RewardSummary.tsx` (already done)
- `frontend/src/pages/HarvestPage.tsx` (already done)

