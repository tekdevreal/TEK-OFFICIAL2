# Epoch Number Persistence - How It Works

## Understanding Epoch Counting

The epoch number **persists across restarts** and is stored in the backend state file.

### Backend State File
Location: `/home/van/reward-project/cycle-state.json`

The file structure looks like:
```json
{
  "epochs": {
    "2026-01-09": {
      "epoch": "2026-01-09",
      "cycles": [...],
      "createdAt": 1736380800000,
      "updatedAt": 1736467200000
    },
    "2026-01-10": {
      "epoch": "2026-01-10",
      "cycles": [...],
      "createdAt": 1736467200000,
      "updatedAt": 1736553600000
    }
  },
  "currentEpoch": "2026-01-10",
  "currentCycleNumber": 141,
  "lastCycleTimestamp": 1736553600000
}
```

### How Epoch Number is Calculated

In `backend/src/routes/dashboard.ts` (line 881-883):
```typescript
const allEpochs = getAllEpochStates();
const epochNumber = allEpochs.findIndex(e => e.epoch === epochInfo.epoch) + 1;
```

This counts **all epoch entries** in the state file:
- If there are 2 epochs in `cycle-state.json` → `epochNumber = 2`
- If there are 3 epochs in `cycle-state.json` → `epochNumber = 3`

### Why You Might See Epoch 1

If you're seeing Epoch 1, it could be because:

1. **First Day**: This is actually the first day the system has been running
2. **State File Reset**: The `cycle-state.json` file was deleted or cleared
3. **Only One Epoch Stored**: The backend is only keeping one epoch in memory

### To Verify

Check the backend state file:
```bash
cd /home/van/reward-project
cat cycle-state.json | grep -c '"epoch":'
```

This will show how many epochs are stored. The count should match your epoch number.

### Important Notes

- ✅ Epoch counter **DOES NOT** reset on bot restart
- ✅ Epoch counter **DOES** persist in `cycle-state.json`
- ✅ Each new UTC day creates a new epoch entry
- ✅ The backend keeps up to 30 epochs in memory (configurable)
- ❌ If the state file is deleted, counting restarts from 1

### Expected Behavior

- **Day 1 (2026-01-09)**: Epoch 1, Cycles 1-288
- **Day 2 (2026-01-10)**: Epoch 2, Cycles reset to 1-288
- **Day 3 (2026-01-11)**: Epoch 3, Cycles reset to 1-288
- And so on...

After a bot restart on Day 2, you should still see **Epoch 2** because the state file contains both Day 1 and Day 2 epoch entries.
