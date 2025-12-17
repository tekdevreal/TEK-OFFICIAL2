#!/bin/bash

# Script to commit tokenPrice removal and safety checks

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add frontend/src/services/api.ts
git add frontend/src/components/RewardSummary.tsx
git add frontend/src/pages/HarvestPage.tsx
git add frontend/src/pages/Dashboard.tsx

echo ""
echo "📝 Committing changes..."
git commit -m "Remove tokenPrice from API response and add safety checks

Frontend Changes:
- Remove tokenPrice from API response in fetchRewards (safety check)
- Clean up commented tokenPrice code in RewardSummary
- Clean up commented tokenPrice code in HarvestPage
- Add try-catch wrapper in Dashboard component

Purpose:
- Fix 'Cannot read properties of undefined (reading usd)' error
- Ensure tokenPrice is never accessed even if backend returns it
- Add error handling in Dashboard component

Files changed:
- frontend/src/services/api.ts: Remove tokenPrice from response
- frontend/src/components/RewardSummary.tsx: Clean up comments
- frontend/src/pages/HarvestPage.tsx: Clean up comments
- frontend/src/pages/Dashboard.tsx: Add try-catch error handling"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

