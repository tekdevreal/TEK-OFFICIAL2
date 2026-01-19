# Fix Duplicate Telegram Notifications on Railway

## Root Cause

The duplicate notifications are caused by **multiple chat IDs** configured in the Railway environment variable, not duplicate bot instances.

The telegram bot code loops through all configured chat IDs and sends a message to each one:

```typescript
for (const chatId of authorizedChatIds) {
  await bot.sendMessage(chatId, message);
}
```

## How to Fix on Railway

### 1. Check Current Configuration

Go to your Railway project:
1. Open your **telegram-bot** service
2. Click on **Variables** tab
3. Look for `TELEGRAM_CHAT_IDS` or `TELEGRAM_CHAT_ID`

### 2. Verify the Value

**❌ WRONG (causes duplicates):**
```
TELEGRAM_CHAT_IDS=-1001234567890,-1001234567890
```
or
```
TELEGRAM_CHAT_IDS=-1001234567890, -1001234567890
```

**✅ CORRECT (single notification):**
```
TELEGRAM_CHAT_IDS=-1001234567890
```

### 3. Fix the Configuration

If you see duplicate chat IDs or multiple comma-separated values:

1. Edit the `TELEGRAM_CHAT_IDS` variable
2. Keep only ONE unique chat ID
3. Save the changes
4. Railway will automatically redeploy

### 4. Verify the Fix

After redeployment:
1. Wait for the next reward distribution cycle
2. You should receive **only one** notification

## About telegram-dashboard-bot Folder

The `telegram-dashboard-bot` folder is **empty** (only has `package.json` and `node_modules`, no source code). 

**Action:** You can safely delete this folder if desired:

```bash
rm -rf telegram-dashboard-bot
```

This folder is not being used and is not causing the duplicate notifications.

## How Multiple Chat IDs Work

The bot is designed to support broadcasting to multiple channels/groups. If you intentionally want notifications in multiple chats:

```
TELEGRAM_CHAT_IDS=-1001111111111,-1002222222222
```

This would send notifications to **two different chats**, which is valid if you want updates in multiple locations.

## Verification

After fixing, check Railway logs for confirmation:

```
[AutoRewards] New swap + distribution detected, broadcasting to authorized chats
[AutoRewards] Sent swap/distribution notification { chatId: '-1001234567890' }
```

You should see **only one** `Sent swap/distribution notification` log entry per distribution cycle.
