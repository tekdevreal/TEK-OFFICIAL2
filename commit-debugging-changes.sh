#!/bin/bash

# Script to commit and push debugging changes (token price removal + backend fixes)

set -e

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changed files..."
git add frontend/src/components/RewardSummary.tsx
git add frontend/src/pages/HarvestPage.tsx
git add frontend/src/services/api.ts
git add backend/src/routes/dashboard.ts
git add TEMPORARY_TOKEN_PRICE_REMOVAL.md
git add DEBUGGING_CHANGES.md

echo ""
echo "📝 Committing changes..."
git commit -m "Temporarily remove token price display and fix backend data structure issues

Debugging changes to isolate dashboard crash:
- Temporarily remove token price display from RewardSummary and HarvestPage
- Comment out tokenPrice validation in api.ts
- Fix backend null safety issues in dashboard.ts

Backend Fixes:
- Add null safety to totalSOLDistributed calculation
- Fix missing filteredPending variable declaration
- Add null safety to all reduce operations with rewardSOL
- Ensure all numeric operations handle null values

Frontend Changes:
- Comment out NUKE Price card in RewardSummary
- Comment out token price from HarvestPage Excel export
- Comment out tokenPrice validation in fetchRewards

Purpose:
- Isolate if tokenPrice structure is causing the crash
- Fix potential backend data structure mismatches
- Test dashboard load without token price to identify root cause

Files changed:
- frontend/src/components/RewardSummary.tsx: Commented out token price display
- frontend/src/pages/HarvestPage.tsx: Commented out token price from export
- frontend/src/services/api.ts: Commented out tokenPrice validation
- backend/src/routes/dashboard.ts: Fixed null safety in calculations"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Changes pushed successfully!"

