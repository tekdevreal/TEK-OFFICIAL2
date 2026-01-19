# Telegram Bot TEK Migration

## Changes Made

### 1. Token Name Update
- Changed all "NUKE" references to "TEK" in messages
- Updated emoji from 💰 to 🟩
- Updated help command text

### 2. Message Format Update
The notification message format has been updated to match the new TEK branding:

```
🟩 TEK Rewards Distributed

Total: 0.044009 SOL
Holders: 0.033007 SOL
Treasury: 0.011002 SOL

Epoch: 4
Cycle: 257 / 288
Time: 01/14/2026, 22:21 CET
```

**Key Changes:**
- Emoji: Changed from 💰 to 🟩
- Token name: Changed from NUKE to TEK
- Removed markdown bold formatting (asterisks)
- Added spacing between Treasury and Epoch sections
- Updated date format to: `MM/DD/YYYY, HH:mm CET`

### 3. Files Modified
- `telegram-bot/src/index.ts` - Updated notification message format and /rewards command
- `telegram-bot/src/services/telegramBot.ts` - Updated help command text

## Backend Connection

The Telegram bot connects to the backend via the `BACKEND_URL` environment variable.

**Important:** When deploying the Telegram bot to Railway, ensure the `BACKEND_URL` environment variable is set to your TEK backend **Public Networking** URL:

```
BACKEND_URL=https://tek-backend-tek-studio.up.railway.app
```

**Note:** Use the Public Networking URL (not the Private Networking URL) because the Telegram bot makes HTTP requests from outside Railway's internal network.

## Testing

After deployment, the bot will send notifications in the new format when rewards are distributed. The format matches the example provided:

- ✅ Emoji: 🟩
- ✅ Token: TEK
- ✅ Spacing between Treasury and Epoch
- ✅ Date format: MM/DD/YYYY, HH:mm CET
- ✅ No markdown bold formatting

## Environment Variables Required

Make sure these are set in Railway for the Telegram bot service:

- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `TELEGRAM_CHAT_IDS` or `TELEGRAM_CHAT_ID` - Comma-separated chat IDs or single chat ID
- `BACKEND_URL` - **Must point to TEK backend URL** (e.g., `https://tek-backend-tek-studio.up.railway.app`)
- `POLLING_INTERVAL_MS` - Optional, defaults to 60000 (1 minute)
- `PORT` - Optional, defaults to 3000
