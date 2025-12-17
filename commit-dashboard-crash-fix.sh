#!/bin/bash

# Script to commit and push dashboard crash fix

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add frontend/src/pages/HarvestPage.tsx
git add frontend/src/components/RewardSummary.tsx
git add frontend/src/services/api.ts
git add DASHBOARD_CRASH_FIX.md

echo ""
echo "📝 Committing changes..."
git commit -m "Fix dashboard crash - add null safety for tokenPrice

Fix white screen crash caused by accessing tokenPrice.sol without null checks:
- Add optional chaining for all tokenPrice access
- Add fallback values before calling .toFixed()
- Ensure tokenPrice exists in response validation
- Fix fallback structure in api.ts

Changes:
- HarvestPage.tsx: Add optional chaining and fallback for tokenPrice.sol
- RewardSummary.tsx: Add tokenPrice existence check before access
- api.ts: Validate response structure and ensure tokenPrice exists
- api.ts: Fix fallback structure to match expected format

Fixes:
- Dashboard no longer crashes with white screen
- Handles null/undefined tokenPrice gracefully
- Price displays as 'N/A (Raydium)' when unavailable
- No more 'Cannot read properties of null' errors

Error fixed:
Uncaught TypeError: Cannot read properties of null (reading 'toFixed')"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

