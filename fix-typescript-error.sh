#!/bin/bash

set -e

echo "🔧 Fixing TypeScript error and rebuilding..."
echo ""

cd /home/van/reward-project/frontend
npm run build

cd ..
git add frontend/src/components/RewardSystem.tsx
git add fix-typescript-error.sh

git commit -m "fix: remove unused epoch parameter from Tooltip component"

git push

echo ""
echo "✅ TypeScript error fixed and deployed!"
