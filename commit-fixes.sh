#!/bin/bash

# Script to commit and push the fixes for token holder detection and Raydium integration

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add backend/src/services/solanaService.ts
git add backend/src/services/raydiumService.ts
git add backend/src/routes/dashboard.ts
git add backend/ENV_TEMPLATE.txt
git add TROUBLESHOOTING.md

echo ""
echo "📝 Committing changes..."
git commit -m "Fix token holder detection and Raydium pool parsing

- Remove dataSize filter for Token-2022 accounts (handles variable account sizes)
- Fix Raydium pool parsing to support both TOKEN and TOKEN_2022 program IDs
- Add diagnostic endpoint (/dashboard/diagnostics) for troubleshooting
- Improve logging for token holder detection
- Update ENV_TEMPLATE with Raydium pool ID
- Add comprehensive troubleshooting guide

Fixes:
- Token holders now correctly detected (was showing 0)
- Raydium vault accounts now properly fetched
- Better error handling and diagnostics"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

