# Terminal Setup Commands

## Complete Setup (Copy-Paste Ready)

### 1. Navigate to Backend Folder

```bash
cd backend
```

### 2. Install Production Dependencies

```bash
npm install express dotenv
```

### 3. Install Dev Dependencies

```bash
npm install --save-dev typescript ts-node-dev @types/node @types/express
```

### 4. Initialize TypeScript

```bash
npx tsc --init
```

### 5. Create .env File from Template

```bash
cp .env.example .env
```

### 6. Run Development Server

```bash
npm run dev
```

---

## All-in-One Command

```bash
cd backend && \
npm install express dotenv && \
npm install --save-dev typescript ts-node-dev @types/node @types/express && \
npx tsc --init && \
cp .env.example .env && \
echo "✅ Setup complete! Edit .env with your values, then run: npm run dev"
```

---

## .env.example Template

Create or update `.env.example` with the following content:

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

---

## Testing Instructions

### Test Health Endpoint

Once the server is running (`npm run dev`), test the health endpoint:

```bash
curl http://localhost:3000/health
```

**Expected Response:**
```json
{"status":"ok"}
```

### Production Build & Start

For production deployment:

```bash
npm run build
npm start
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Start production server |
| `curl http://localhost:3000/health` | Test health endpoint |

---

## Troubleshooting

**Port already in use:**
```bash
# Change PORT in .env file or kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

**TypeScript errors:**
```bash
# Rebuild
npm run build
```

**Missing dependencies:**
```bash
# Reinstall
rm -rf node_modules package-lock.json
npm install
```

