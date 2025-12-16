# Raydium DEX Integration

## Overview

Added read-only Raydium DEX integration to provide price and liquidity data when Jupiter API is unavailable on devnet.

## Changes Made

### 1. Backend Configuration (`backend/src/config/raydium.ts`)
- Added Raydium AMM program ID configuration
- Added WSOL mint constant
- Added pool ID resolution from environment variable `RAYDIUM_POOL_ID`
- Base mint = NUKE token (from `TOKEN_MINT`)
- Quote mint = WSOL

### 2. Raydium Service (`backend/src/services/raydiumService.ts`)
- **Read-only** service that fetches Raydium pool data
- Calculates price (WSOL per NUKE)
- Calculates liquidity in USD
- Caches results for 60 seconds
- Functions:
  - `getRaydiumData()` - Returns price, liquidity, vault balances
  - `getRaydiumPriceUSD()` - Returns price in USD
  - `clearRaydiumCache()` - Clears cache

### 3. Price Service Update (`backend/src/services/priceService.ts`)
- Updated to use Raydium as fallback when Jupiter fails
- Priority order: **Jupiter → Raydium → Fallback**
- Tracks price source (`jupiter`, `raydium`, or `fallback`)
- Exports `getPriceSource()` function

### 4. Dashboard Endpoints (`backend/src/routes/dashboard.ts`)

#### New Endpoint: `GET /dashboard/raydium`
Returns Raydium DEX analytics:
```json
{
  "dex": "raydium",
  "price": 0.00001234,
  "priceUSD": 0.001234,
  "liquidityUSD": 12345.67,
  "baseVaultBalance": "1000000000",
  "quoteVaultBalance": "5000000000",
  "source": "raydium",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### Enhanced: `GET /dashboard/rewards`
Now includes:
- `tokenPrice.source` - Price source (`jupiter`, `raydium`, or `fallback`)
- `dex` - Raydium data if available:
  - `name`: "raydium"
  - `price`: WSOL per NUKE
  - `liquidityUSD`: Total liquidity in USD
  - `source`: "raydium"
  - `updatedAt`: ISO timestamp

### 5. Telegram Bot Update (`telegram-bot/src/index.ts`)
- Enhanced reward messages to show:
  - Price source (Jupiter/Raydium/Default)
  - Raydium DEX section (if available):
    - DEX name: "Raydium (Devnet)"
    - Price from Raydium
    - Liquidity in USD

### 6. Environment Template (`backend/ENV_TEMPLATE.txt`)
- Added optional `RAYDIUM_POOL_ID` environment variable

## Environment Variables

### Required
- `TOKEN_MINT` - NUKE token mint address
- `HELIUS_RPC_URL` - Solana RPC endpoint

### Optional
- `RAYDIUM_POOL_ID` - Raydium pool address (if not set, service will return null data)

## Usage

### Setting Raydium Pool ID

1. Find your Raydium pool address on devnet
2. Add to `.env` or Render/Railway environment variables:
   ```
   RAYDIUM_POOL_ID=YourPoolAddressHere
   ```

### API Endpoints

**Get Raydium Data:**
```bash
curl http://localhost:3000/dashboard/raydium
```

**Get Rewards (with Raydium info):**
```bash
curl http://localhost:3000/dashboard/rewards
```

## Price Fallback Logic

1. **Try Jupiter API** - Primary source
2. **If Jupiter fails → Try Raydium** - Fallback for devnet
3. **If both fail → Use default** - $0.01 USD

## Notes

- **Read-only**: No swap logic, no transaction listening
- **Analytics only**: Price and liquidity data for display
- **Caching**: Raydium data cached for 60 seconds
- **No tax logic**: Tax calculations not included (analytics only)
- **Pool ID required**: Service needs `RAYDIUM_POOL_ID` to fetch data

## Testing

1. Set `RAYDIUM_POOL_ID` in environment
2. Start backend: `npm run dev`
3. Test endpoint: `curl http://localhost:3000/dashboard/raydium`
4. Check rewards endpoint: `curl http://localhost:3000/dashboard/rewards`
5. Verify Telegram bot shows Raydium info

## Troubleshooting

**No Raydium data returned:**
- Check `RAYDIUM_POOL_ID` is set correctly
- Verify pool exists on devnet
- Check RPC endpoint has access to pool account

**Price always shows fallback:**
- Jupiter may not have devnet token data
- Ensure Raydium pool ID is configured
- Check RPC connection is working

