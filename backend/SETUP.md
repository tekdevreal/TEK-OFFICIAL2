# Backend Setup Guide

## Terminal Commands

Copy and paste these commands in order:

```bash
# Navigate to backend folder
cd backend

# Install production dependencies
npm install express dotenv

# Install dev dependencies
npm install --save-dev typescript ts-node-dev @types/node @types/express

# Initialize TypeScript (if not already done)
npx tsc --init

# Create .env file from template
cp .env.example .env

# Edit .env with your actual values (optional - use your preferred editor)
# nano .env
# or
# vim .env

# Run the development server
npm run dev
```

## Environment Variables Template

The `.env.example` file should contain:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Solana Configuration
SOLANA_NETWORK=devnet
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
TOKEN_MINT=CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq
ADMIN_WALLET_PATH=../admin.json

# Reward Configuration
TOTAL_REWARD_POOL_SOL=1.0
MIN_HOLDING_USD=5
MIN_SOL_PAYOUT=0.0001

# Telegram Bot Configuration (optional)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
POLLING_INTERVAL_MS=300000
```

## Testing

### 1. Test Health Endpoint

Once the server is running, test the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok"}
```

### 2. Production Build & Start

For production deployment:

```bash
# Build TypeScript to JavaScript
npm run build

# Start production server
npm start
```

## Quick Setup (All-in-One)

If you want to run everything at once:

```bash
cd backend && \
npm install express dotenv && \
npm install --save-dev typescript ts-node-dev @types/node @types/express && \
npx tsc --init && \
cp .env.example .env && \
echo "✅ Setup complete! Edit .env with your values, then run: npm run dev"
```

