# Immediate Action Plan - January 9, 2026

## Executive Summary

**Issue 1: SOL Distribution** - Cannot verify if system is distributing correctly because `taxState` is missing from state file. This indicates either:
- Backend is not running the latest code with the fix
- Backend hasn't processed any tax yet
- Tax is below threshold

**Issue 2: Telegram Bot** - Bot stopped due to multiple instances (409 Conflict error). Also, bot won't send notifications without `taxState` in backend.

**Critical Finding**: Both issues are interconnected. Without `taxState` in backend, the telegram bot cannot detect new distributions and won't send notifications.

---

## IMMEDIATE ACTIONS REQUIRED

### Action 1: Check Backend Deployment Status

**Run this script:**
```bash
cd /home/van/reward-project
bash check-backend-deployment.sh
```

**What it checks:**
- ✅ Git commit history (is fix committed?)
- ✅ State file (does taxState exist?)
- ✅ Backend process (is it running?)
- ✅ Code files (is fix in the code?)

**Expected Results:**
- Should find commit: "fix: only distribute SOL from NUKE swaps, not wallet balance"
- Should find `taxState` in `backend/reward-state.json`
- Should find fix comment in `solDistributionService.ts`

**If taxState is missing:**
- Backend may not be running the new code
- Or tax hasn't been collected yet
- Check Render logs immediately

### Action 2: Fix Telegram Bot

**Run this script:**
```bash
cd /home/van/reward-project
bash fix-telegram-bot.sh
```

**What it does:**
1. Kills all running bot instances
2. Clears Telegram webhook (if token is set)
3. Rebuilds and starts ONE bot instance
4. Verifies no 409 errors

**Expected Results:**
- ✅ Bot starts without 409 errors
- ✅ Logs show "Webhook registered successfully"
- ✅ No "409 Conflict" in logs

**If 409 errors persist:**
- Check Render dashboard (bot may be running there)
- Check PM2: `pm2 list`
- Check other terminals: `ps aux | grep telegram-bot`

### Action 3: Verify Reward Wallet Balance

**Check Solscan:**
```
Wallet: 6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
Network: Devnet
URL: https://solscan.io/account/6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo?cluster=devnet
```

**What to look for:**
- **Current balance**: Should be 0.5-1 SOL for operational costs
- **Recent transactions**: Check if distributions are happening
- **Transaction amounts**: Verify they match swap proceeds (not wallet balance)

**Red Flags:**
- ⚠️ Balance > 2 SOL: May indicate SOL accumulation from swaps
- ⚠️ Large outgoing transactions: May indicate distributing from wallet balance
- ⚠️ No recent transactions: Backend may not be running

### Action 4: Check Render Logs

**If backend is deployed on Render:**

1. **Log into Render dashboard**
2. **Find backend service**
3. **Check logs for:**
   - `[INFO] Tax distribution complete`
   - `[INFO] NUKE swapped to SOL successfully`
   - `[INFO] SOL distributed to holders`
   - `[INFO] Only SOL from NUKE swap distributed` ← **This confirms fix is working**

**Red Flags:**
- ❌ No tax processing logs
- ❌ Errors about insufficient balance
- ❌ Old code running (no "Only SOL from NUKE swap" messages)

---

## DECISION TREE

### If Backend Has NO taxState:

**Scenario A: Old Code Running**
```
Action: Deploy latest code immediately
Steps:
  1. Verify fix is committed: git log --oneline -10
  2. Push to main: git push origin main
  3. Trigger Render deployment
  4. Wait for deployment to complete
  5. Monitor logs for tax processing
```

**Scenario B: New Code, No Tax Yet**
```
Action: Wait and monitor
Steps:
  1. Verify backend is running
  2. Check logs for "Tax threshold check"
  3. If below threshold, wait for tax to accumulate
  4. Monitor next reward cycle (5 minutes)
```

**Scenario C: Backend Not Running**
```
Action: Start backend
Steps:
  1. cd /home/van/reward-project/backend
  2. npm run build
  3. npm start
  4. Monitor logs
```

### If Backend HAS taxState:

**Check Distribution Amounts:**
```typescript
// In reward-state.json
{
  "taxState": {
    "totalSolDistributed": "...",  // Total SOL to holders
    "totalSolToTreasury": "...",   // Total SOL to treasury
    "lastSwapTx": "...",            // Last swap signature
    "taxDistributions": [...]       // Distribution history
  }
}
```

**Verify Each Distribution:**
1. Check `taxDistributions` array
2. For each distribution:
   - `rewardAmount` (SOL to holders) + `treasuryAmount` (SOL to treasury) = Total from swap
   - Should be 75/25 split
   - Should match swap proceeds, not wallet balance

**If Amounts Look Wrong:**
- Check if they're cumulative (they should be)
- Compare with wallet transaction history on Solscan
- Check logs for "insufficient balance" warnings

---

## VERIFICATION CHECKLIST

After taking actions, verify:

### Backend:
- [ ] Latest commit is deployed
- [ ] `taxState` exists in `reward-state.json`
- [ ] Logs show "Only SOL from NUKE swap distributed"
- [ ] No errors in logs
- [ ] Tax processing is happening

### Telegram Bot:
- [ ] Only ONE instance running
- [ ] No 409 errors in logs
- [ ] Webhook registered successfully
- [ ] `/rewards` command works
- [ ] Automatic notifications sent (after next distribution)

### Reward Wallet:
- [ ] Balance is 0.5-1 SOL (operational costs)
- [ ] Recent transactions match swap proceeds
- [ ] No large unexpected outflows

### Distribution Logic:
- [ ] Only distributing SOL from swaps
- [ ] Not distributing from wallet balance
- [ ] 75/25 split is correct
- [ ] Accumulated rewards NOT being paid

---

## MONITORING PLAN

### Next 24 Hours:

**Every Hour:**
1. Check backend logs for tax processing
2. Check reward wallet balance
3. Check telegram bot logs for errors

**After Each Distribution:**
1. Verify `taxState` updated
2. Check distribution amounts
3. Verify telegram notification sent
4. Compare with Solscan transactions

**Red Flags to Watch For:**
- ⚠️ Wallet balance decreasing rapidly
- ⚠️ Large distributions not matching swap amounts
- ⚠️ Bot not sending notifications
- ⚠️ 409 errors returning
- ⚠️ Backend errors in logs

---

## CONTACT INFORMATION

**Reward Wallet:**
- Address: `6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo`
- Network: Devnet
- Solscan: https://solscan.io/account/6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo?cluster=devnet

**State Files:**
- Backend: `/home/van/reward-project/backend/reward-state.json`
- Telegram: `/home/van/reward-project/telegram-bot/data/notification-state.json`

**Log Files:**
- Backend: Check Render dashboard
- Telegram: `/home/van/reward-project/telegram-bot/bot.log`

**Key Services:**
- Backend: Render (check dashboard)
- Telegram Bot: Local/Render (check both)
- Solana RPC: Helius/Devnet

---

## QUICK COMMANDS

**Check backend status:**
```bash
cd /home/van/reward-project
bash check-backend-deployment.sh
```

**Fix telegram bot:**
```bash
cd /home/van/reward-project
bash fix-telegram-bot.sh
```

**View backend state:**
```bash
cat /home/van/reward-project/backend/reward-state.json | jq '.taxState'
```

**View telegram bot logs:**
```bash
tail -f /home/van/reward-project/telegram-bot/bot.log
```

**Kill all bot instances:**
```bash
pkill -f "node.*telegram-bot"
```

**Check running processes:**
```bash
ps aux | grep -E "node.*telegram-bot|node.*backend"
```

---

## SUCCESS CRITERIA

You'll know everything is working when:

1. ✅ `taxState` exists in `backend/reward-state.json`
2. ✅ Backend logs show "Only SOL from NUKE swap distributed"
3. ✅ Telegram bot has no 409 errors
4. ✅ Telegram bot sends notifications after distributions
5. ✅ Reward wallet balance stays around 0.5-1 SOL
6. ✅ Distribution amounts match swap proceeds
7. ✅ No accumulated rewards being paid from wallet balance

---

## IF ALL ELSE FAILS

**Nuclear Option - Full Restart:**

```bash
# 1. Kill everything
pkill -f "node.*telegram-bot"
pkill -f "node.*backend"

# 2. Clean build
cd /home/van/reward-project/backend
rm -rf dist node_modules
npm install
npm run build

cd /home/van/reward-project/telegram-bot
rm -rf dist node_modules
npm install
npm run build

# 3. Start fresh
cd /home/van/reward-project/backend
npm start > backend.log 2>&1 &

cd /home/van/reward-project/telegram-bot
npm start > bot.log 2>&1 &

# 4. Monitor
tail -f /home/van/reward-project/backend/backend.log
tail -f /home/van/reward-project/telegram-bot/bot.log
```

**Then:**
1. Wait for next reward cycle (5 minutes)
2. Check if `taxState` appears
3. Check if bot sends notification
4. Verify on Solscan

---

## SUMMARY

**The core issue is: We cannot verify if the SOL distribution fix is working because `taxState` doesn't exist in the state file.**

**This could mean:**
1. Backend is not running the new code
2. Backend hasn't processed any tax yet
3. Tax is below threshold

**The telegram bot issue is a separate but related problem:**
- Multiple instances causing 409 errors
- Bot won't send notifications without `taxState`

**Priority:**
1. **FIRST**: Check if backend is running the latest code
2. **SECOND**: Fix telegram bot (kill duplicates)
3. **THIRD**: Monitor next reward cycle
4. **FOURTH**: Verify distributions match swap proceeds

**Most Likely Scenario:**
Backend is running but tax hasn't accumulated enough to meet threshold yet. Once threshold is met, tax will be harvested, swapped, and distributed. Then `taxState` will appear and bot will start sending notifications.

**Worst Case Scenario:**
Backend is running old code with the accumulated rewards bug. In this case, deploy the fix immediately and monitor wallet balance closely.
