# Testing Configuration for Faster Development

## Quick Testing Setup

To speed up testing and development, lower the minimum harvesting threshold.

## Minimum Tax Threshold

The `MIN_TAX_THRESHOLD_TOKEN` controls when tax harvesting occurs. Lower values mean harvesting happens more frequently.

### Current Configuration (Testing)
```bash
MIN_TAX_THRESHOLD_TOKEN=5
```

This means harvesting will occur when **5 TEK** or more has been collected in taxes.

### Production Configuration
```bash
MIN_TAX_THRESHOLD_TOKEN=20000
```

This means harvesting will occur when **20,000 TEK** or more has been collected in taxes.

## How to Update in Railway

1. Go to Railway Dashboard → Backend Service → Variables
2. Find `MIN_TAX_THRESHOLD_TOKEN`
3. Update value to: `5` (for testing) or `20000` (for production)
4. Save - Railway will automatically redeploy

## Testing vs Production

### Testing (5 TEK)
- ✅ Very fast testing cycles
- ✅ Harvesting happens very frequently
- ✅ Easier to test reward distributions
- ⚠️ More frequent transactions (higher gas costs)
- ⚠️ Not suitable for production

### Production (20,000 TEK)
- ✅ Cost-efficient (fewer transactions)
- ✅ Suitable for real users
- ⚠️ Slower testing cycles
- ⚠️ Requires more tax accumulation

## Other Testing Configurations

You can also adjust these for faster testing:

```bash
# Batch harvest configuration (for large amounts)
MAX_HARVEST_TOKEN=1000000        # Lower for testing (default: 12000000)
BATCH_COUNT=2                    # Fewer batches (default: 4)
BATCH_DELAY_TOKEN_MODE=5000      # Shorter delays (default: 10000)

# Minimum payout (for holder rewards)
MIN_PAYOUT_TOKEN=1               # Lower for testing (default: 60)
```

## Minimum SOL Output for Swaps

The swap service uses `MIN_SOL_PAYOUT` (same as payout threshold) to determine the minimum SOL output required for a swap to proceed. This ensures consistency - swaps only proceed if the output meets the minimum payout requirements.

### Current Configuration
```bash
MIN_SOL_PAYOUT=0.0001
```

This allows swaps with as little as **0.0001 SOL** output (100,000 lamports), which works well with `MIN_TAX_THRESHOLD_TOKEN=15`.

## Current Testing Setup

For faster testing, we're using:
- `MIN_TAX_THRESHOLD_TOKEN=15` - Harvest when 15 TEK collected
- `MIN_SOL_PAYOUT=0.0001` - Minimum SOL for both swaps and payouts
- All other settings remain at production defaults

## Notes

- The threshold is in **token units** (not raw units with decimals)
- TEK has 6 decimals, so 5 TEK = 5 * 10^6 = 5,000,000 in raw units
- The code automatically handles the conversion
- Remember to change back to production values (20000) before going live!
