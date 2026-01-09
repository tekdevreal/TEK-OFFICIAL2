# Epoch Number Fix

## Problem

The telegram message was showing the epoch as a **date string** ("2026-01-09") instead of an **epoch number** (1, 2, 3, etc.).

## Root Cause

The `/dashboard/cycles/current` API was returning:
```json
{
  "epoch": "2026-01-09",  // Date string, not a number!
  "cycleNumber": 141,
  "cyclesPerEpoch": 288
}
```

The system tracks epochs by date (one epoch = one UTC day), but doesn't have a sequential epoch number.

## Solution

### 1. Added `epochNumber` to Backend API

Modified `backend/src/routes/dashboard.ts`:
```typescript
// Calculate epoch number by counting all epochs in state
const allEpochs = getAllEpochStates();
const epochNumber = allEpochs.findIndex(e => e.epoch === epochInfo.epoch) + 1;

const response = {
  epoch: epochInfo.epoch, // Date string (YYYY-MM-DD)
  epochNumber: epochNumber > 0 ? epochNumber : 1, // Sequential epoch number (1, 2, 3...)
  cycleNumber: epochInfo.cycleNumber,
  ...
};
```

### 2. Updated Telegram Bot to Use `epochNumber`

Modified `telegram-bot/src/index.ts`:
```typescript
// Use epochNumber instead of epoch date
messageLines.push(`*Epoch:* ${cycleInfo.epochNumber}`);
messageLines.push(`*Cycle:* ${cycleInfo.cycleNumber} / ${cycleInfo.cyclesPerEpoch}`);
```

## New API Response

```json
{
  "epoch": "2026-01-09",       // Date string (for internal use)
  "epochNumber": 1,            // Sequential number (for display)
  "cycleNumber": 141,
  "cyclesPerEpoch": 288,
  "nextCycleIn": 120000,
  "nextCycleInSeconds": 120
}
```

## New Message Format

```
💰 NUKE Rewards Distributed

Total: 0.603291 SOL
Holders: 0.452375 SOL
Treasury: 0.150916 SOL
Epoch: 1                     ← Now shows number instead of date!
Cycle: 141 / 288
Time: 2026-01-09 11:39:14
```

## Deploy

```bash
# Backend changes
cd /home/van/reward-project
git add backend/src/routes/dashboard.ts

# Telegram bot changes
git add telegram-bot/src/index.ts
git add EPOCH_NUMBER_FIX.md

git commit -m "fix: show epoch number instead of date in telegram messages

- Added epochNumber field to /dashboard/cycles/current API
- Calculate epochNumber by counting all epochs in state
- Updated telegram bot to use epochNumber for display
- Epoch now shows as 1, 2, 3... instead of date string

Backend and telegram bot both updated."

git push
```

Both services will auto-deploy:
- **Render** (backend) - ~2 minutes
- **Railway** (telegram bot) - ~2 minutes

## Testing

After deployment, check that telegram messages show:
- ✅ **Epoch: 1** (not "Epoch: 2026-01-09")
- ✅ **Cycle: 141 / 288**
- ✅ **Time: 2026-01-09 11:39:14** (date moved to separate field)
