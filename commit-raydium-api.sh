#!/bin/bash

# Script to commit and push Raydium API migration changes

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add backend/src/services/priceService.ts
git add RAYDIUM_API_MIGRATION.md

echo ""
echo "📝 Committing changes..."
git commit -m "Migrate to Raydium Devnet API for price fetching

Replace on-chain vault fetching with Raydium Devnet REST API:
- Remove all on-chain vault reading logic from priceService.ts
- Use Raydium Devnet API: https://api-v3-devnet.raydium.io/pairs
- Filter by RAYDIUM_POOL_ID environment variable
- Extract price from API response (priceNative or reserves)
- Maintain 5-minute cache TTL
- Comprehensive error handling and logging

Benefits:
- Faster: API calls faster than multiple on-chain RPC calls
- More reliable: Less dependent on RPC node availability
- Simpler: No need to parse on-chain account data
- Better error messages: API provides structured responses

Compatibility:
- rewardService.ts: Already uses getNUKEPriceSOL() - no changes needed
- dashboard.ts: Already returns tokenPrice.sol - no changes needed
- telegram-bot: Already displays SOL price - no changes needed

Returns: { price: number | null, source: 'raydium' | null }
Logs: 'NUKE token price fetched from Raydium Devnet API (SOL)'

Files changed:
- backend/src/services/priceService.ts: Complete rewrite for API-based fetching
- RAYDIUM_API_MIGRATION.md: Documentation of migration"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

