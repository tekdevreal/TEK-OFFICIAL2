# Render Environment Variables & Configuration

## Backend Service Configuration

### Root Directory Settings
- **Root Directory**: `backend`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Node Version**: 20.6.0 (via `.nvmrc`)

### Required Environment Variables

#### Core Application
```bash
NODE_ENV=production
PORT=10000
```

#### Solana Configuration
```bash
SOLANA_NETWORK=devnet
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=4e637579-10e2-40d8-8ead-87a929a9c6aa
TOKEN_MINT=CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq
```

#### Admin Wallet (CRITICAL - Mark as Secret)
```bash
ADMIN_WALLET_PATH=/opt/render/project/src/backend/admin.json
```
**Note**: You'll need to upload `admin.json` file to Render or use Render Secrets.

#### Frontend URL (for CORS)
```bash
FRONTEND_URL=https://nukerewards.imgprotocol.com
```

#### Reward Configuration (Optional - with defaults)
```bash
TOTAL_REWARD_POOL_SOL=0.1
MIN_HOLDING_USD=5
MIN_SOL_PAYOUT=0.0001
```

---

## Telegram Bot Worker Configuration

### Root Directory Settings
- **Root Directory**: `telegram-bot`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Node Version**: 18+ (or match backend)

### Required Environment Variables

#### Core Configuration
```bash
NODE_ENV=production
```

#### Telegram Bot (CRITICAL - Mark as Secret)
```bash
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=@nukerewards
```

#### Backend API
```bash
BACKEND_URL=https://nukerewards-backend.onrender.com
```

#### Polling Configuration (Optional - with defaults)
```bash
POLLING_INTERVAL_MS=60000
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=1000
```

---

## How to Set Environment Variables in Render

### Method 1: Render Dashboard
1. Go to your service in Render Dashboard
2. Click on "Environment" tab
3. Click "Add Environment Variable"
4. Enter key and value
5. For secrets, check "Mark as Secret" checkbox
6. Click "Save Changes"

### Method 2: render.yaml (Blueprint)
Add to `envVars` section:
```yaml
envVars:
  - key: NODE_ENV
    value: production
  - key: PORT
    value: 10000
  - key: HELIUS_RPC_URL
    sync: false  # Mark as secret
```

---

## Security Notes

### Mark as Secret (Never expose these):
- ✅ `TELEGRAM_BOT_TOKEN`
- ✅ `ADMIN_WALLET_PATH` (if contains sensitive path)
- ✅ `HELIUS_RPC_URL` (contains API key)

### Safe to expose:
- ✅ `NODE_ENV`
- ✅ `PORT`
- ✅ `FRONTEND_URL`
- ✅ `TOKEN_MINT`
- ✅ `SOLANA_NETWORK`
- ✅ Configuration values (TOTAL_REWARD_POOL_SOL, etc.)

---

## File Upload for Admin Wallet

If you need to upload `admin.json` to Render:

1. **Option 1: Render Secrets** (Recommended)
   - Go to Render Dashboard → Secrets
   - Create a new secret with the wallet JSON content
   - Reference it in environment variables

2. **Option 2: Manual Upload**
   - Use Render's file system (if available)
   - Upload to: `/opt/render/project/src/backend/admin.json`
   - Set `ADMIN_WALLET_PATH` to this path

3. **Option 3: Environment Variable** (Not Recommended)
   - Store wallet JSON as base64 in environment variable
   - Decode in application code
   - **Security Risk**: Not recommended for production

---

## Verification Checklist

After setting environment variables:

- [ ] All required variables are set
- [ ] Secrets are marked as secret
- [ ] Root directory is set correctly (`backend` or `telegram-bot`)
- [ ] Build command works (`npm install && npm run build`)
- [ ] Start command works (`npm start`)
- [ ] Health endpoint responds: `curl https://nukerewards-backend.onrender.com/health`
- [ ] CORS allows frontend origin
- [ ] Admin wallet is accessible (if using file path)

---

## Quick Setup Commands

### Test Backend Locally with Production-like Environment
```bash
cd backend
export NODE_ENV=production
export PORT=10000
export SOLANA_NETWORK=devnet
export HELIUS_RPC_URL=your_rpc_url
export TOKEN_MINT=CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq
export FRONTEND_URL=https://nukerewards.imgprotocol.com
npm run build
npm start
```

### Test Telegram Bot Locally
```bash
cd telegram-bot
export NODE_ENV=production
export TELEGRAM_BOT_TOKEN=your_token
export TELEGRAM_CHAT_ID=@nukerewards
export BACKEND_URL=https://nukerewards-backend.onrender.com
npm run build
npm start
```

---

## Troubleshooting

### Build Fails: "Cannot find module '@types/express'"
- **Fix**: Ensure `rootDir: backend` is set in render.yaml
- **Fix**: Verify devDependencies are installed (they should be for build)

### Runtime Error: "ADMIN_WALLET_PATH not found"
- **Fix**: Upload admin.json file to Render
- **Fix**: Verify path in `ADMIN_WALLET_PATH` environment variable
- **Fix**: Check file permissions

### CORS Errors from Frontend
- **Fix**: Set `FRONTEND_URL` environment variable
- **Fix**: Verify CORS configuration in `server.ts` allows the origin

### Telegram Bot Not Starting
- **Fix**: Verify `TELEGRAM_BOT_TOKEN` is set and valid
- **Fix**: Check `BACKEND_URL` points to correct backend service
- **Fix**: Verify bot token is marked as secret

