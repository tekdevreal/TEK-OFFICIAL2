# Push Epoch Fix Now

## Run These Commands:

```bash
cd /home/van/reward-project

# Build backend
cd backend
npm run build

# Build telegram bot
cd ../telegram-bot
npm run build

# Commit and push
cd ..
git add backend/src/routes/dashboard.ts backend/dist/
git add telegram-bot/src/index.ts telegram-bot/dist/
git add EPOCH_NUMBER_FIX.md

git commit -m "fix: show epoch number instead of date in telegram messages

- Added epochNumber to backend API
- Telegram bot now shows Epoch: 1 instead of date
- Both backend and telegram bot rebuilt"

git push
```

## OR Simpler Version (if dist is in .gitignore):

```bash
cd /home/van/reward-project/telegram-bot
npm run build

cd /home/van/reward-project/backend
npm run build

cd /home/van/reward-project
git add backend/src/routes/dashboard.ts
git add telegram-bot/src/index.ts
git add EPOCH_NUMBER_FIX.md

git commit -m "fix: epoch number instead of date in telegram"
git push
```

## What This Will Deploy:

### Backend (Render)
- New `epochNumber` field in `/dashboard/cycles/current`
- Returns: `{ epoch: "2026-01-09", epochNumber: 1, cycleNumber: 141, ... }`

### Telegram Bot (Railway)
- Shows `*Epoch:* 1` instead of `*Epoch:* 2026-01-09`
- Shows `*Cycle:* 141 / 288`
- Shows `*Time:* 2026-01-09 11:39:14`

## After Push:

Wait ~2-3 minutes for auto-deploy:
- ✅ Render deploys backend
- ✅ Railway deploys telegram bot
- ✅ Next distribution shows correct epoch number!

## Testing:

Send `/rewards` command in Telegram to test immediately, or wait for next auto-distribution (every 5 minutes).
