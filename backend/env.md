# Backend Environment Variables Configuration

This file contains all environment variables needed for the TEK (The Eternal Key) rewards backend service.

---

## 🔴 Required Environment Variables

### Server Configuration
```bash
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://rewards.tekportal.app/
```

### Solana Network Configuration
```bash
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=ae896970-4803-4004-a1ab-92560091c9e4
```

### Token Configuration
```bash
# TEK (The Eternal Key) Token Mint Address
TOKEN_MINT=DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K
```

### Admin Wallet (Required)
```bash
# Admin wallet JSON secret key array (64 numbers)
# Used for reward payouts and system operations
ADMIN_WALLET_JSON=[228,90,164,192,155,203,112,233,18,250,115,189,46,155,54,13,214,141,101,62,226,209,135,233,216,62,92,28,131,200,189,3,55,21,218,39,48,33,114,116,206,138,233,5,184,176,159,237,168,117,71,91,15,97,106,117,253,115,243,228,67,119,8,28]
```

---

## 🟡 Raydium DEX Configuration

### Pool Configuration
```bash
# TEK/SOL CPMM Pool ID on devnet
RAYDIUM_POOL_ID=4U8vs7wMVNijhjJsxBUA2JAif47QJcfBN97RKVRk7XQs
```

### CPMM Pool Configuration (Required for CPMM pools)
```bash
# CPMM AMM Config ID (from pool configuration)
RAYDIUM_CPMM_AMM_CONFIG=HTVWgp8CbUsRNmRE1p9RBYqopxe2qiyApSkiTFLrfxaW

# CPMM Observation State ID (from pool configuration)
RAYDIUM_CPMM_OBSERVATION_STATE=GdwHP2eUjXsF2DzW3sUupXmGo7RoCr665qSHHs4Qk66K
```

**Note**: These CPMM configuration values are required for swap operations on CPMM pools. They are obtained from the Raydium API pool information.

---

## 🟡 Tax Distribution Wallets

### Reward Wallet (Receives 3% of transaction tax)
```bash
# Reward wallet address (optional - will be derived from private key if not set)
REWARD_WALLET_ADDRESS=6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo

# Reward wallet private key JSON array (64 numbers) - REQUIRED
REWARD_WALLET_PRIVATE_KEY_JSON=[99,116,89,4,241,26,231,133,189,138,130,166,123,119,44,117,60,144,3,24,222,254,147,8,79,111,44,30,33,190,195,225,80,34,251,176,201,157,179,160,61,79,12,64,148,146,10,235,57,22,81,121,5,197,58,105,164,24,113,239,189,86,246,180]
```

### Treasury Wallet (Receives 1% of transaction tax)
```bash
# Treasury wallet address (optional - will be derived from private key if not set)
TREASURY_WALLET_ADDRESS=DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo

# Treasury wallet private key JSON array (64 numbers) - OPTIONAL
# Treasury can be receive-only if private key is not provided
TREASURY_WALLET_PRIVATE_KEY_JSON=[96,30,74,213,190,54,215,141,177,6,161,123,181,107,48,205,168,230,166,210,151,133,45,123,114,61,189,109,202,36,239,229,192,79,53,195,50,237,50,155,83,155,166,138,20,222,236,57,79,245,87,125,230,35,133,56,53,90,22,216,111,108,104,130]
```

---

## 🟡 Reward System Configuration

### Reward Pool Settings
```bash
# Total reward pool size in SOL (reserved for rewards)
TOTAL_REWARD_POOL_SOL=1.0

# Minimum holding value in USD to be eligible for rewards
MIN_HOLDING_USD=5

# Minimum SOL payout amount per distribution
MIN_SOL_PAYOUT=0.0001
```

### Reward Value Mode
```bash
# Controls how reward values are calculated and displayed
# - TOKEN: For devnet - uses raw TEK token amounts (no USD conversion)
# - USD: For mainnet - uses USD values converted from token amounts
# Defaults to "TOKEN" if not specified
REWARD_VALUE_MODE=TOKEN
```

---

## 🟡 Tax Harvest Configuration

### Tax Harvest Thresholds
```bash
# Minimum tax collection threshold before harvesting can proceed
# Prevents harvesting when tax amount is too small to be cost-effective

# Minimum tax in token units (for TOKEN mode)
# Default: 20000 (20,000 TEK tokens) - for production
# Testing: 5 (5 TEK tokens for faster testing cycles)
MIN_TAX_THRESHOLD_TOKEN=5

# Minimum tax in USD (for USD mode)
# Default: 5 (5 USD)
MIN_TAX_THRESHOLD_USD=5
```

### Batch Harvest Configuration
```bash
# Controls batch harvesting for large tax amounts to prevent market impact

# Maximum harvest amount in token units before batching (for TOKEN mode)
# Default: 12000000 (12,000,000 TEK tokens)
MAX_HARVEST_TOKEN=12000000

# Maximum harvest amount in USD before batching (for USD mode)
# Default: 2000 (2,000 USD)
MAX_HARVEST_USD=2000

# Number of batches to split large harvests into
# Default: 4
BATCH_COUNT=4

# Delay between batches in TOKEN mode (milliseconds)
# Default: 10000 (10 seconds)
BATCH_DELAY_TOKEN_MODE=10000

# Delay between batches in USD mode (milliseconds)
# Default: 30000 (30 seconds)
BATCH_DELAY_USD_MODE=30000
```

---

## 🟡 Payout Configuration

### Minimum Payout Thresholds
```bash
# Minimum payout amount in token units (for TOKEN mode)
# Default: 60 (60 TEK tokens)
MIN_PAYOUT_TOKEN=60

# Minimum payout amount in USD (for USD mode)
# Default: 0.001 (0.001 USD)
MIN_PAYOUT_USD=0.001
```


---

## 🟢 Optional: Logging Configuration

### Debug Logging (Optional)
```bash
# Enable verbose CORS logging (default: disabled in production)
# Set to "true" to see all CORS allow messages
# LOG_CORS=true

# Enable verbose request logging (default: disabled in production)
# Set to "true" to see all HTTP request logs
# LOG_REQUESTS=true
```

**Note**: By default, CORS and request logging are disabled in production to reduce log noise. Only blocked CORS requests and startup configuration are logged. Set these variables to `true` only if you need detailed debugging logs.

---

## 📝 Notes

1. **Token Information**:
   - Token Name: The Eternal Key (TEK)
   - Token Mint: `DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K`
   - Decimals: 6
   - Transfer Fee: 300 basis points (3%)

2. **Pool Information**:
   - Pool Type: CPMM (Constant Product Market Maker)
   - Pool ID: `4U8vs7wMVNijhjJsxBUA2JAif47QJcfBN97RKVRk7XQs`
   - Pair: TEK/SOL
   - Network: Devnet

3. **Wallet Security**:
   - All wallet private keys should be kept secret
   - Use environment variable secrets in deployment platforms (Render/Railway)
   - Never commit private keys to version control

4. **Deployment (Railway)**:
   - Copy these values to Railway service environment variables
   - Mark sensitive values (private keys) as secrets using the lock icon
   - Set variables at service level (not just project level)
   - Railway auto-detects Node.js and uses `package.json` for build/start commands
   - Service URL format: `https://your-service-name.up.railway.app`
   - Update `FRONTEND_URL` to match your frontend domain: `https://rewards.tekportal.app/`
   - Update `SOLANA_RPC_URL` with your Helius API key
   - Railway auto-injects `$PORT` but we override with `PORT=10000`

5. **Railway Configuration**:
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build` (auto-detected)
   - Start Command: `npm start` (auto-detected)
   - Node Version: 20.6.0 (from `package.json` engines)
   - Dockerfile Path: `backend/Dockerfile` (if using Docker)

6. **Logging**:
   - CORS logging is disabled by default in production (cleaner logs)
   - Request logging is disabled by default in production
   - Only blocked CORS requests and startup config are logged
   - Set `LOG_CORS=true` or `LOG_REQUESTS=true` for verbose debugging

---

## 🔗 Related Files

- `backend/ENV_TEMPLATE.txt` - Template file with descriptions
- `backend/RAILWAY_DEPLOY.md` - Complete Railway deployment guide
- `TEK_MIGRATION_PLAN.md` - Complete migration guide
- `backend/src/config/env.ts` - Environment variable validation
- `railway.json` - Railway deployment configuration