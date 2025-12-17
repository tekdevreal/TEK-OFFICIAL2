#!/bin/bash

# Script to commit and push complete token price removal

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add backend/src/routes/dashboard.ts
git add frontend/src/types/api.ts
git add frontend/src/services/api.ts
git add TOKEN_PRICE_COMPLETE_REMOVAL.md

echo ""
echo "📝 Committing changes..."
git commit -m "Complete token price removal from dashboard for debugging

Remove all token price functionality to isolate dashboard crash:
- Remove getNUKEPriceSOL() calls from dashboard endpoints
- Remove getRaydiumData() calls from /dashboard/rewards
- Remove tokenPrice from API responses
- Remove dex data from responses
- Comment out tokenPrice in frontend types
- Remove tokenPrice from API service fallbacks

Backend Changes:
- dashboard.ts: Commented out price service imports
- dashboard.ts: Removed tokenPrice from /dashboard/rewards response
- dashboard.ts: Removed tokenPrice from /dashboard/diagnostics response
- dashboard.ts: Removed tokenPrice from error responses

Frontend Changes:
- types/api.ts: Commented out tokenPrice in RewardsResponse
- services/api.ts: Removed tokenPrice from fallback responses

Purpose:
- Isolate if token price fetching is causing dashboard crash
- Test dashboard load without any price-related API calls
- Identify root cause of white screen crash

Expected Result:
- Dashboard loads without crashing
- No Raydium API errors in logs
- All other functionality works (statistics, holders, payouts)
- Eligibility checks return empty array if price unavailable (expected)

Files changed:
- backend/src/routes/dashboard.ts: Complete token price removal
- frontend/src/types/api.ts: Commented out tokenPrice type
- frontend/src/services/api.ts: Removed tokenPrice from fallbacks"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

