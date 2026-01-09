#!/bin/bash

# Commit and Push Diagnostic Tools and Documentation
# Run this script to push all changes to GitHub

echo "=== Committing Diagnostic Tools and Documentation ==="
echo ""

cd /home/van/reward-project || exit 1

# Show what will be committed
echo "Files to be committed:"
echo ""

# Add all new diagnostic files
git add diagnose-sol-distribution.ts
git add fix-telegram-bot.sh
git add check-backend-deployment.sh
git add commit-and-push.sh
git add ISSUE_ANALYSIS_JAN_9_2026.md
git add IMMEDIATE_ACTION_PLAN.md
git add ISSUE_RESOLUTION_SUMMARY.md
git add fix-telegram-bot.md

# Show status
git status

echo ""
echo "=== Creating commit ==="

# Commit with descriptive message
git commit -m "feat: add diagnostic tools for SOL distribution and telegram bot issues

Added comprehensive diagnostic and fix tools:
- diagnose-sol-distribution.ts: Check wallet balance and distribution history
- fix-telegram-bot.sh: Fix 409 conflict errors from multiple bot instances
- check-backend-deployment.sh: Verify backend deployment and taxState
- commit-and-push.sh: Helper script for git operations

Added documentation:
- ISSUE_ANALYSIS_JAN_9_2026.md: Detailed analysis of both issues
- IMMEDIATE_ACTION_PLAN.md: Step-by-step action plan
- ISSUE_RESOLUTION_SUMMARY.md: Executive summary and resolution
- fix-telegram-bot.md: Telegram bot 409 error fix guide

These tools help diagnose and resolve:
1. SOL distribution issue (verifying only swap proceeds are distributed)
2. Telegram bot 409 conflict (multiple instances)
3. Missing taxState in reward-state.json

Key findings:
- reward-state.json missing taxState property (backend may not be running new code)
- Telegram bot stopped due to multiple instances (409 Conflict)
- Both issues are interconnected (bot needs taxState to send notifications)"

if [ $? -eq 0 ]; then
    echo "✅ Commit created successfully"
    echo ""
    echo "=== Pushing to GitHub ==="
    
    # Push to origin
    git push origin main
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Successfully pushed to GitHub!"
        echo ""
        echo "=== Next Steps ==="
        echo ""
        echo "1. Check Render dashboard to verify deployment"
        echo "2. Run: bash fix-telegram-bot.sh"
        echo "3. Run: bash check-backend-deployment.sh"
        echo "4. Monitor next reward cycle (5 minutes)"
        echo "5. Check reward wallet on Solscan:"
        echo "   https://solscan.io/account/6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo?cluster=devnet"
        echo ""
        echo "6. Test telegram bot:"
        echo "   - Send /rewards command"
        echo "   - Wait for automatic notification after next distribution"
    else
        echo "❌ Failed to push to GitHub"
        echo "Error details above"
        exit 1
    fi
else
    echo "❌ Failed to create commit"
    echo "This may be because there are no changes to commit"
    echo "or there was an error with git"
    exit 1
fi
