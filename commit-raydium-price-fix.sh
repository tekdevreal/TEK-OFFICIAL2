#!/bin/bash

# Script to commit and push Raydium price fetch fix

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add backend/src/services/priceService.ts
git add backend/src/routes/dashboard.ts
git add telegram-bot/src/index.ts
git add RAYDIUM_PRICE_FIX.md

echo ""
echo "📝 Committing changes..."
git commit -m "Fix Raydium price fetching - direct pool vault access

- Rewrite priceService.ts to directly fetch from Raydium pool vaults
- Read RAYDIUM_POOL_ID from environment variables
- Fetch pool account and extract vault addresses directly
- Calculate price as: vault_SOL_balance / vault_NUKE_balance
- Handle both TOKEN and TOKEN_2022 program IDs correctly
- Add comprehensive error handling and logging
- Update dashboard to validate price > 0
- Update Telegram bot to prioritize tokenPrice.sol
- Fix 'Price: N/A' issue in Telegram bot

Changes:
- priceService.ts: Direct Raydium pool vault fetching (no dependency on raydiumService)
- dashboard.ts: Better price validation
- telegram-bot/index.ts: Improved price display logic

Fixes:
- Telegram bot now shows correct SOL price instead of N/A
- Dashboard correctly loads and displays price
- Proper logging: 'NUKE token price fetched from Raydium: {price} SOL'"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

