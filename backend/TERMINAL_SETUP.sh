#!/bin/bash

# Backend Setup Script
# This script sets up the Node.js + TypeScript backend project

set -e  # Exit on error

echo "🚀 Setting up backend project..."

# Navigate to backend folder
cd "$(dirname "$0")" || exit 1
echo "📁 Current directory: $(pwd)"

# Install production dependencies
echo "📦 Installing production dependencies..."
npm install express dotenv

# Install dev dependencies
echo "📦 Installing dev dependencies..."
npm install --save-dev typescript ts-node-dev @types/node @types/express

# Initialize TypeScript (if tsconfig.json doesn't exist)
if [ ! -f "tsconfig.json" ]; then
    echo "⚙️  Initializing TypeScript..."
    npx tsc --init
else
    echo "✅ TypeScript already configured"
fi

# Create .env file from template
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "📝 Creating .env from .env.example..."
        cp .env.example .env
        echo "⚠️  Please edit .env with your actual values"
    else
        echo "⚠️  .env.example not found, creating basic .env..."
        cat > .env << 'EOF'
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
EOF
    fi
else
    echo "✅ .env file already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your actual values"
echo "2. Run: npm run dev"
echo "3. Test: curl http://localhost:3000/health"

