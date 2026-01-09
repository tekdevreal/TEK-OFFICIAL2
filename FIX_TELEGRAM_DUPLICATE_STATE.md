# CRITICAL BUG: Telegram Bot State Not Persisted

## Root Cause Found!

Looking at the Railway logs, the telegram bot is detecting **TWO DIFFERENT swap transactions** correctly:

```
[AutoRewards] New swap + distribution detected, broadcasting to authorized chats {
  lastSwapTx: '2CWG6NjPEZ748gq6nL44xKPPD9ESp2rcuy78YuW3qMt28bhmfjVwkGFtdCtJMgfW9D8kVdFUeVaaiGDCK73UrnGo',
  authorizedChatIds: [ '-1003685345592', '2098893402' ]
}
[AutoRewards] New swap + distribution detected, broadcasting to authorized chats {
  lastSwapTx: '61a2rWw8Re5Y5SvRUrnHufZf7fbKkW2BNXaPnMSw3XkveCxQ1iynfYhKe96hkQAZEHqMWDwjxU8PptNoswgNccz',
  authorizedChatIds: [ '-1003685345592', '2098893402' ]
}
```

## The Problem

The telegram bot uses an **IN-MEMORY variable** `lastKnownSwapTx` to track which distributions it has already notified about:

```typescript
let lastKnownSwapTx: string | null = null;

const tickAutomaticRewards = async () => {
  const { message, lastSwapTx } = await fetchSwapDistributionNotification(backendUrl, lastKnownSwapTx);
  
  if (!message) {
    return; // No new swap
  }
  
  // Send notifications...
  
  lastKnownSwapTx = lastSwapTx; // UPDATE IN MEMORY ONLY!
};
```

**What happens:**
1. Distribution 1 occurs → Backend saves `lastSwapTx = '2CWG...'`
2. Bot polls → Sees new swap → Sends notifications → Sets `lastKnownSwapTx = '2CWG...'` **IN MEMORY**
3. Distribution 2 occurs → Backend saves `lastSwapTx = '61a2...'`
4. Bot polls → Sees new swap → Sends notifications → Sets `lastKnownSwapTx = '61a2...'` **IN MEMORY**

**But if the bot restarts (Railway redeployment):**
1. `lastKnownSwapTx` resets to `null`
2. Bot polls → Sees `lastSwapTx = '61a2...'` (most recent)
3. Compares `'61a2...'` !== `null` → NEW SWAP!
4. Sends duplicate notifications for old distribution

## The Fix

The bot needs to **persist `lastKnownSwapTx` to disk**, just like the backend does with `taxState`.

### Solution: Use the Existing Notification State File

The bot already has `telegram-bot/data/notification-state.json` and state management in `telegram-bot/src/state/notificationState.ts`!

```typescript
// telegram-bot/src/state/notificationState.ts
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, '../../data/notification-state.json');

interface NotificationState {
  lastRewardRunId: string;
  lastSwapTx?: string; // ADD THIS
}

export function getLastState(): NotificationState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[State] Failed to load state:', error);
  }
  return { lastRewardRunId: '' };
}

export function updateState(state: Partial<NotificationState>): void {
  try {
    const current = getLastState();
    const updated = { ...current, ...state };
    fs.writeFileSync(STATE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (error) {
    console.error('[State] Failed to save state:', error);
  }
}
```

### Updated Bot Code

```typescript
// telegram-bot/src/index.ts

import { getLastState, updateState } from './state/notificationState';

// ... in main() function ...

// Load last known swap tx from persistent state (NOT in-memory variable)
let lastKnownSwapTx: string | null = getLastState().lastSwapTx || null;

const tickAutomaticRewards = async () => {
  try {
    const { message, lastSwapTx } = await fetchSwapDistributionNotification(backendUrl, lastKnownSwapTx);
    
    if (!message) {
      // No new swap/distribution detected
      return;
    }

    console.log('[AutoRewards] New swap + distribution detected, broadcasting to authorized chats', {
      lastSwapTx,
      previousSwapTx: lastKnownSwapTx,
      authorizedChatIds,
    });

    for (const chatId of authorizedChatIds) {
      try {
        await bot.sendMessage(chatId, message);
        console.log('[AutoRewards] Sent swap/distribution notification', { chatId });
      } catch (sendErr) {
        console.error('[AutoRewards] Failed to send notification', { chatId, error: sendErr });
      }
    }

    // PERSIST to disk (not just in-memory)
    lastKnownSwapTx = lastSwapTx;
    updateState({ lastSwapTx });
    console.log('[AutoRewards] Updated persistent state', { lastSwapTx });
  } catch (err) {
    console.error('[AutoRewards] Error while fetching or broadcasting notifications:', err);
  }
};
```

## Why This Happened Last Night

1. You updated the telegram bot files last night
2. Railway redeployed the bot
3. Bot restarted with `lastKnownSwapTx = null`
4. Backend had already completed multiple distributions
5. Bot saw the most recent `lastSwapTx` and thought it was NEW
6. Sent "duplicate" notifications for old distributions

## Testing the Fix

After applying the fix:

1. Deploy to Railway
2. Bot will load the last known swap tx from `notification-state.json`
3. Only truly NEW distributions will trigger notifications
4. Bot restarts won't cause duplicate notifications

## Files to Modify

1. **`telegram-bot/src/state/notificationState.ts`** - Add `lastSwapTx` to interface
2. **`telegram-bot/src/index.ts`** - Load from state + persist updates
3. **`telegram-bot/data/notification-state.json`** - Will auto-update

## Expected Behavior

- ✅ 2 messages per NEW distribution (1 group + 1 private)
- ✅ No duplicates on bot restart
- ✅ State persists across Railway deployments
