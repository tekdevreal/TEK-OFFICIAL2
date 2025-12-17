#!/bin/bash

# Script to commit and push tax harvesting and price fixes

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add backend/src/services/taxService.ts
git add backend/src/services/rewardService.ts
git add backend/src/services/raydiumService.ts
git add check-mint-authority.ts
git add TAX_AND_PRICE_FIXES.md

echo ""
echo "📝 Committing changes..."
git commit -m "Fix tax harvesting authority detection and improve price logging

- Automatically detect withdraw authority from mint transfer fee config
- Support both reward wallet and admin wallet as withdraw authority
- Improve balance tracking (before/after withdrawal) for accurate tax calculation
- Enhanced error messages for authority mismatches
- Add detailed price calculation logging in Raydium service
- Export getAdminWallet function from rewardService
- Add check-mint-authority.ts diagnostic script
- Add comprehensive documentation in TAX_AND_PRICE_FIXES.md

Fixes:
- Tax harvesting now works with correct authority detection
- Better error handling when authority doesn't match
- Detailed price calculation logs for debugging"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

