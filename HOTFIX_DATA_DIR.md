# URGENT FIX: Remove DATA_DIR Dependency

## Problem

Backend trying to write to `/data` directory that doesn't exist, causing:
```
[ERROR] EACCES: permission denied, mkdir '/data'
```

## Root Cause

The code checks for `DATA_DIR` environment variable, and something is still setting it even after you deleted it from Render dashboard.

Possible causes:
1. Render hasn't redeployed yet
2. .env file in backend/ directory has DATA_DIR set
3. Cached environment variable

## Fix Applied

**Temporarily disabled DATA_DIR logic completely:**

```typescript
// BEFORE:
const STATE_FILE_PATH = process.env.NODE_ENV === 'production' && process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'cycle-state.json')
  : path.join(process.cwd(), 'cycle-state.json');

// AFTER (SIMPLE):
const STATE_FILE_PATH = path.join(process.cwd(), 'cycle-state.json');
```

**Now it ALWAYS uses project directory, regardless of any environment variables!**

## Deploy Command

```bash
cd /home/van/reward-project

git add backend/src/services/cycleService.ts

git commit -m "HOTFIX: Disable DATA_DIR to fix permission errors

- Removed DATA_DIR logic completely
- Always use project directory for cycle-state.json
- Fixes: EACCES: permission denied, mkdir '/data'
- Cycles are calculating correctly (71-72), just can't save
- Will re-enable persistent storage after this works"

git push origin main
```

## What Will Happen

After deployment (2-3 minutes):
- ✅ No more permission errors
- ✅ Cycles will display correctly (71-72, not 1)
- ✅ State file will save successfully
- ⚠️ Epochs will reset on each deployment (we'll fix this later)

## Verification

After deployment, logs should show:
```
✅ GOOD:
[INFO] Cycle Service initialized
  stateFilePath: /opt/render/project/src/cycle-state.json
  nodeEnv: production

❌ BAD (if still broken):
[ERROR] EACCES: permission denied
```

## Later: Re-enable Persistent Storage

Once this works, we can:
1. Create persistent disk in Render
2. Update code to check if disk exists before using it
3. Add proper fallback logic
