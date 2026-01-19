# Testing Configuration for Faster Development

## Quick Testing Setup

To speed up testing and development, lower the minimum harvesting threshold.

## Minimum Tax Threshold

The `MIN_TAX_THRESHOLD_TOKEN` controls when tax harvesting occurs. Lower values mean harvesting happens more frequently.

### Current Configuration (Testing)
```bash
MIN_TAX_THRESHOLD_TOKEN=100
```

This means harvesting will occur when **100 TEK** or more has been collected in taxes.

### Production Configuration
```bash
MIN_TAX_THRESHOLD_TOKEN=20000
```

This means harvesting will occur when **20,000 TEK** or more has been collected in taxes.

## How to Update in Railway

1. Go to Railway Dashboard → Backend Service → Variables
2. Find `MIN_TAX_THRESHOLD_TOKEN`
3. Update value to: `100` (for testing) or `20000` (for production)
4. Save - Railway will automatically redeploy

## Testing vs Production

### Testing (100 TEK)
- ✅ Faster testing cycles
- ✅ Harvesting happens more frequently
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

## Current Testing Setup

For faster testing, we're using:
- `MIN_TAX_THRESHOLD_TOKEN=100` - Harvest when 100 TEK collected
- All other settings remain at production defaults

## Notes

- The threshold is in **token units** (not raw units with decimals)
- TEK has 6 decimals, so 100 TEK = 100 * 10^6 = 100,000,000 in raw units
- The code automatically handles the conversion
- Remember to change back to production values before going live!
