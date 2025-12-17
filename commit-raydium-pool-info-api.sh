#!/bin/bash

# Script to commit and push Raydium Pool Info API update

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add backend/src/services/priceService.ts
git add RAYDIUM_POOL_INFO_API_UPDATE.md

echo ""
echo "📝 Committing changes..."
git commit -m "Update to Raydium Pool Info API endpoint

Change from /pairs to /pools/info/ids endpoint:
- Use direct pool lookup: GET /pools/info/ids?ids=<RAYDIUM_POOL_ID>
- Simplified pool fetching (no array filtering needed)
- Updated interface to match new API response structure
- Updated logging: 'NUKE token price fetched from Raydium (SOL)'

Benefits:
- Faster: Direct pool lookup instead of filtering all pairs
- More reliable: Single API call with specific pool ID
- Simpler: Direct pool info response structure

Compatibility:
- rewardService.ts: Already uses getNUKEPriceSOL() - no changes needed
- dashboard.ts: Already returns tokenPrice.sol - no changes needed
- telegram-bot: Already displays SOL price - no changes needed

API Endpoint:
GET https://api-v3-devnet.raydium.io/pools/info/ids?ids=<RAYDIUM_POOL_ID>

Returns: { price: number | null, source: 'raydium' | null }
Logs: 'NUKE token price fetched from Raydium (SOL): <price>'

Files changed:
- backend/src/services/priceService.ts: Updated to use /pools/info/ids endpoint
- RAYDIUM_POOL_INFO_API_UPDATE.md: Documentation of changes"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

