# Git Commit Instructions

## Quick Start

### Option 1: Use Bash Script (Recommended)

```bash
cd /home/van/reward-project
chmod +x commit-and-push.sh
bash commit-and-push.sh
```

### Option 2: Use PowerShell Script

```powershell
cd \\wsl.localhost\Ubuntu-20.04\home\van\reward-project
.\commit-and-push.ps1
```

### Option 3: Manual Commands

```bash
cd /home/van/reward-project

# Add all new files
git add diagnose-sol-distribution.ts
git add fix-telegram-bot.sh
git add check-backend-deployment.sh
git add commit-and-push.sh
git add commit-and-push.ps1
git add ISSUE_ANALYSIS_JAN_9_2026.md
git add IMMEDIATE_ACTION_PLAN.md
git add ISSUE_RESOLUTION_SUMMARY.md
git add fix-telegram-bot.md
git add COMMIT_INSTRUCTIONS.md

# Check what will be committed
git status

# Commit
git commit -m "feat: add diagnostic tools for SOL distribution and telegram bot issues"

# Push
git push origin main
```

## Files Being Committed

### Diagnostic Tools
- `diagnose-sol-distribution.ts` - Check wallet balance and distribution history
- `fix-telegram-bot.sh` - Fix 409 conflict errors from multiple bot instances
- `check-backend-deployment.sh` - Verify backend deployment and taxState

### Documentation
- `ISSUE_ANALYSIS_JAN_9_2026.md` - Detailed analysis of both issues
- `IMMEDIATE_ACTION_PLAN.md` - Step-by-step action plan
- `ISSUE_RESOLUTION_SUMMARY.md` - Executive summary and resolution
- `fix-telegram-bot.md` - Telegram bot 409 error fix guide

### Helper Scripts
- `commit-and-push.sh` - Bash script for git operations
- `commit-and-push.ps1` - PowerShell script for git operations
- `COMMIT_INSTRUCTIONS.md` - This file

## After Pushing

### 1. Verify Render Deployment

- Log into Render dashboard
- Check that backend service deploys successfully
- Monitor logs for any errors

### 2. Fix Telegram Bot

```bash
cd /home/van/reward-project
bash fix-telegram-bot.sh
```

This will:
- Kill all running bot instances
- Clear webhook
- Restart ONE instance
- Verify no 409 errors

### 3. Check Backend Deployment

```bash
cd /home/van/reward-project
bash check-backend-deployment.sh
```

This will:
- Verify fix is in code
- Check for taxState in state file
- Show reward wallet info
- Identify any issues

### 4. Monitor Reward Wallet

Check Solscan:
```
https://solscan.io/account/6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo?cluster=devnet
```

Look for:
- Current balance (should be 0.5-1 SOL)
- Recent transactions
- Distribution amounts

### 5. Test Telegram Bot

**Manual test:**
1. Open Telegram
2. Send `/rewards` command to bot
3. Verify you get a response

**Automatic test:**
1. Wait for next reward cycle (5 minutes)
2. Check if bot sends notification automatically
3. Notification should show:
   - Total SOL distributed
   - SOL to holders
   - SOL to treasury
   - Epoch time

### 6. Check Backend Logs

On Render dashboard, look for:
- `[INFO] Tax distribution complete`
- `[INFO] NUKE swapped to SOL successfully`
- `[INFO] SOL distributed to holders`
- `[INFO] Only SOL from NUKE swap distributed` ← **This confirms fix is working**

## Verification Checklist

After pushing and deploying:

- [ ] Code pushed to GitHub successfully
- [ ] Render deployed latest code
- [ ] Telegram bot running (no 409 errors)
- [ ] Backend running (check Render logs)
- [ ] `taxState` appears in `reward-state.json`
- [ ] Backend logs show "Only SOL from NUKE swap distributed"
- [ ] Telegram `/rewards` command works
- [ ] Telegram automatic notifications work
- [ ] Reward wallet balance is ~0.5-1 SOL
- [ ] Distribution amounts match swap proceeds

## Troubleshooting

### If commit fails:

```bash
# Check what's staged
git status

# Check if there are changes to commit
git diff

# If files aren't staged, add them manually
git add <file>
```

### If push fails:

```bash
# Check remote
git remote -v

# Pull first if needed
git pull origin main

# Try push again
git push origin main
```

### If Render doesn't deploy:

1. Check Render dashboard for errors
2. Manually trigger deployment
3. Check build logs
4. Verify environment variables are set

## Support

If you encounter issues:

1. Check the relevant documentation:
   - `ISSUE_ANALYSIS_JAN_9_2026.md` - Detailed technical analysis
   - `IMMEDIATE_ACTION_PLAN.md` - Step-by-step troubleshooting
   - `ISSUE_RESOLUTION_SUMMARY.md` - Executive summary

2. Run the diagnostic scripts:
   - `bash check-backend-deployment.sh`
   - `bash fix-telegram-bot.sh`

3. Check logs:
   - Backend: Render dashboard
   - Telegram: `tail -f telegram-bot/bot.log`
   - Reward wallet: Solscan

## Summary

The diagnostic tools and documentation help identify and resolve:

1. **SOL Distribution Issue**
   - Verify only swap proceeds are distributed
   - Check if taxState exists
   - Monitor wallet balance

2. **Telegram Bot Issue**
   - Fix 409 Conflict errors
   - Ensure only one instance runs
   - Verify notifications work

3. **Backend Deployment**
   - Confirm latest code is running
   - Check tax processing
   - Monitor reward cycles

All tools are now committed and ready to deploy to Render for testing.
