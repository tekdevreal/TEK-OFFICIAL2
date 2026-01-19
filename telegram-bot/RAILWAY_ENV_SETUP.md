# Telegram Bot Railway Environment Variables

## Railway Configuration

### Dockerfile Setup
- **Dockerfile Path**: `telegram-bot/Dockerfile`
- **Build Command**: (Leave empty - Railway auto-detects from Dockerfile)
- **Start Command**: (Leave empty - Railway auto-detects from Dockerfile)

The Telegram bot uses Dockerfile for deployment, similar to the backend.

## Required Environment Variables

When deploying the Telegram bot to Railway, set these environment variables:

### Backend Connection
```
BACKEND_URL=https://tek-backend-tek-studio.up.railway.app
```

**Important:** Use the **Public Networking** URL, not the Private Networking URL, because the Telegram bot makes HTTP requests from outside Railway's internal network.

### Telegram Configuration
```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_IDS=chat_id_1,chat_id_2,chat_id_3
```

Or use a single chat ID:
```
TELEGRAM_CHAT_ID=your_chat_id_here
```

### Optional Configuration
```
POLLING_INTERVAL_MS=60000
PORT=3000
```

## Railway URLs Reference

**Backend Service:**
- Public Networking: `https://tek-backend-tek-studio.up.railway.app`
- Private Networking: `tek-backend.railway.internal` (not used for Telegram bot)

**Telegram Bot Service:**
- Use Public Networking URL for `BACKEND_URL`
- The bot will make HTTP requests to the backend API

## Verification

After setting the environment variables, verify the bot is connected:

1. Check Railway logs for:
   ```
   [Bot] Backend URL: https://tek-backend-tek-studio.up.railway.app
   ```

2. Test the `/rewards` command in your Telegram channel

3. Wait for automatic notifications when rewards are distributed

## Notes

- The Telegram bot uses the same channels as before (no changes needed)
- Only the message format and token name have been updated to TEK
- The bot automatically polls the backend every `POLLING_INTERVAL_MS` milliseconds (default: 60 seconds)
