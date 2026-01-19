# TEK Telegram Bot Environment Variables Template
# Copy these to Railway environment variables (or .env for local development)

# Backend API URL (Required)
# Use the Public Networking URL from Railway backend service
BACKEND_URL="https://tek-backend-tek-studio.up.railway.app"

# Telegram Bot Configuration (Required)
TELEGRAM_BOT_TOKEN="8507265258:AAEXN9YmJW-uJBA3Tfopbp-88V3FZWw_Q_E"
TELEGRAM_CHAT_IDS="-1003685345592,2098893402"
# Or use single chat ID:
# TELEGRAM_CHAT_ID="your_chat_id_here"

# Webhook URL (Required for webhook mode)
# Use your Railway Public Networking URL for the telegram-bot service
# This is used to register the webhook with Telegram
TELEGRAM_WEBHOOK_URL="tek-telegram-bot-tek-studio.up.railway.app"

# Optional Configuration
POLLING_INTERVAL_MS="60000"
NODE_ENV="production"
PORT="3000"