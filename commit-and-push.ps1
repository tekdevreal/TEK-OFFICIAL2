# PowerShell script to commit and push changes
# Run this from PowerShell if bash script doesn't work

Write-Host "=== Committing Diagnostic Tools and Documentation ===" -ForegroundColor Cyan
Write-Host ""

$projectPath = "\\wsl.localhost\Ubuntu-20.04\home\van\reward-project"
Set-Location $projectPath

Write-Host "Files to be committed:" -ForegroundColor Yellow
Write-Host ""

# Add all new diagnostic files
$files = @(
    "diagnose-sol-distribution.ts",
    "fix-telegram-bot.sh",
    "check-backend-deployment.sh",
    "commit-and-push.sh",
    "commit-and-push.ps1",
    "ISSUE_ANALYSIS_JAN_9_2026.md",
    "IMMEDIATE_ACTION_PLAN.md",
    "ISSUE_RESOLUTION_SUMMARY.md",
    "fix-telegram-bot.md"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        git add $file
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (not found)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Git status:" -ForegroundColor Yellow
git status

Write-Host ""
Write-Host "=== Creating commit ===" -ForegroundColor Cyan

$commitMessage = @"
feat: add diagnostic tools for SOL distribution and telegram bot issues

Added comprehensive diagnostic and fix tools:
- diagnose-sol-distribution.ts: Check wallet balance and distribution history
- fix-telegram-bot.sh: Fix 409 conflict errors from multiple bot instances
- check-backend-deployment.sh: Verify backend deployment and taxState
- commit-and-push.sh/ps1: Helper scripts for git operations

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
- Both issues are interconnected (bot needs taxState to send notifications)
"@

git commit -m $commitMessage

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Commit created successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "=== Pushing to GitHub ===" -ForegroundColor Cyan
    
    git push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
        Write-Host ""
        Write-Host "=== Next Steps ===" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "1. Check Render dashboard to verify deployment"
        Write-Host "2. Run: bash fix-telegram-bot.sh"
        Write-Host "3. Run: bash check-backend-deployment.sh"
        Write-Host "4. Monitor next reward cycle (5 minutes)"
        Write-Host "5. Check reward wallet on Solscan:"
        Write-Host "   https://solscan.io/account/6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo?cluster=devnet"
        Write-Host ""
        Write-Host "6. Test telegram bot:"
        Write-Host "   - Send /rewards command"
        Write-Host "   - Wait for automatic notification after next distribution"
    } else {
        Write-Host "❌ Failed to push to GitHub" -ForegroundColor Red
        Write-Host "Error details above"
        exit 1
    }
} else {
    Write-Host "❌ Failed to create commit" -ForegroundColor Red
    Write-Host "This may be because there are no changes to commit"
    exit 1
}
