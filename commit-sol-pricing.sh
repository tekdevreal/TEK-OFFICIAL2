#!/bin/bash

# Script to commit and push SOL-only pricing changes

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add backend/src/services/priceService.ts
git add backend/src/services/rewardService.ts
git add backend/src/routes/dashboard.ts
git add telegram-bot/src/index.ts
git add SOL_ONLY_PRICING.md

echo ""
echo "📝 Committing changes..."
git commit -m "Implement SOL-only pricing from Raydium devnet pool

- Remove Jupiter API and USD conversion logic
- Add getNUKEPriceSOL() function for Raydium devnet pool pricing
- Update reward service to use SOL price for eligibility checks
- Update dashboard API endpoints to return SOL price (tokenPrice.sol)
- Update Telegram bot to display price in SOL format
- Remove all USD price calculations and fallbacks
- Add comprehensive documentation in SOL_ONLY_PRICING.md

Changes:
- priceService.ts: Complete rewrite for SOL-only pricing from Raydium
- rewardService.ts: Eligibility checks now use SOL price with devnet conversion
- dashboard.ts: All endpoints return SOL price, removed USD references
- telegram-bot/index.ts: Display price in SOL format, removed USD logic

Devnet only: Uses RAYDIUM_POOL_ID for NUKE/SOL price from devnet pool.
No Jupiter, CoinGecko, or USD feeds. All displays show SOL price."

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

