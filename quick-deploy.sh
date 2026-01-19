#!/bin/bash

cd /home/van/reward-project

echo "=== Quick Deploy with Force ==="
echo ""

# Add the trigger file to force a new commit
git add FORCE_DEPLOY_TRIGGER.txt
git add backend/src/routes/dashboard.ts
git add telegram-bot/src/index.ts
git add EPOCH_NUMBER_FIX.md
git add quick-deploy.sh

git commit -m "fix: telegram epoch number + force deployment trigger

- Backend: Added epochNumber to API
- Telegram: Shows Epoch: 1 instead of date
- Trigger file added to force deployment

Both services will redeploy automatically."

git push

echo ""
echo "✅ Pushed! Deployments starting..."
echo "  - Render: ~2 minutes"
echo "  - Railway: ~2 minutes"
