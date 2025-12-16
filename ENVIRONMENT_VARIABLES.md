# Environment Variables Reference

Complete list of all environment variables needed for the NUKE Rewards System.

## Backend Service (Render/Railway)

### 🔴 Required Variables

#### Server Configuration
```bash
PORT=3000
NODE_ENV=production
```

#### Solana Configuration
```bash
SOLANA_NETWORK=devnet
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
TOKEN_MINT=CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq
ADMIN_WALLET_JSON=[...]  # JSON array of 64 numbers (admin wallet for reward payouts)
```

#### Tax Distribution (Required)
```bash
# Reward wallet receives 3% of transaction tax
REWARD_WALLET_PRIVATE_KEY_JSON=[...]  # JSON array of 64 numbers (REQUIRED)
REWARD_WALLET_ADDRESS=6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo  # Optional (derived from private key)
```

### 🟡 Optional Variables

#### Treasury Wallet (Optional - can be receive-only)
```bash
TREASURY_WALLET_ADDRESS=DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo
TREASURY_WALLET_PRIVATE_KEY_JSON=[...]  # JSON array of 64 numbers (optional)
```

#### Raydium DEX Configuration (Optional)
```bash
RAYDIUM_POOL_ID=YourRaydiumPoolIdHere
```

#### Reward Configuration (Optional - has defaults)
```bash
TOTAL_REWARD_POOL_SOL=1.0
MIN_HOLDING_USD=5
MIN_SOL_PAYOUT=0.0001
```

#### Frontend URL (Optional)
```bash
FRONTEND_URL=https://your-frontend-domain.com
```

---

## Telegram Bot Service (Railway)

### 🔴 Required Variables

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_IDS=chat_id1,chat_id2  # Comma-separated list of authorized chat IDs
BACKEND_URL=https://your-backend-url.onrender.com  # Backend API URL
PORT=3000
```

### 🟡 Optional Variables

```bash
TELEGRAM_CHAT_ID=your_chat_id  # Single chat ID (alternative to TELEGRAM_CHAT_IDS)
POLLING_INTERVAL_MS=60000  # How often to check for new rewards (default: 60000ms)
TELEGRAM_WEBHOOK_URL=https://your-bot-url.railway.app  # Webhook URL (auto-detected if not set)
NODE_ENV=production
```

---

## Format Details

### JSON Keypair Format

Private keys must be provided as JSON arrays of 64 numbers (Uint8Array format).

**Example:**
```json
[228,90,164,192,155,203,112,233,18,250,115,189,46,155,54,13,214,141,101,62,226,209,135,233,216,62,92,28,131,200,189,3,55,21,218,39,48,33,114,116,206,138,233,5,184,176,159,237,168,117,71,91,15,97,106,117,253,115,243,228,67,119,8,28]
```

**In Railway/Render:**
- Set as a single-line JSON array
- No line breaks
- All 64 numbers must be present
- Each number must be between 0-255

### Converting Base58 to JSON Array

If you have a base58 private key, convert it using this Node.js script:

```javascript
const bs58 = require('bs58');

// Your base58 private key
const base58Key = '2zL2NLzpdBM8JZdvQTaYYT96PEGKVdZV4JtLj6cPnLNVAvdGfz2DccocuSx9Ckp8tTBWpUFuqfnhKx4ASmnJ2Xoy';

// Decode to Uint8Array
const secretKey = bs58.decode(base58Key);

// Convert to JSON array
const jsonArray = Array.from(secretKey);
console.log(JSON.stringify(jsonArray));
```

---

## Quick Setup Checklist

### Backend Service
- [ ] `PORT` (default: 3000)
- [ ] `NODE_ENV=production`
- [ ] `SOLANA_NETWORK=devnet`
- [ ] `HELIUS_RPC_URL` (with API key)
- [ ] `TOKEN_MINT` (NUKE token address)
- [ ] `ADMIN_WALLET_JSON` (JSON array, 64 numbers)
- [ ] `REWARD_WALLET_PRIVATE_KEY_JSON` (JSON array, 64 numbers) ⚠️ REQUIRED
- [ ] `REWARD_WALLET_ADDRESS` (optional, but recommended)
- [ ] `TREASURY_WALLET_ADDRESS` (optional)
- [ ] `TREASURY_WALLET_PRIVATE_KEY_JSON` (optional)
- [ ] `RAYDIUM_POOL_ID` (optional, for DEX integration)

### Telegram Bot Service
- [ ] `TELEGRAM_BOT_TOKEN`
- [ ] `TELEGRAM_CHAT_IDS` or `TELEGRAM_CHAT_ID`
- [ ] `BACKEND_URL` (your backend API URL)
- [ ] `PORT` (default: 3000)

---

## Security Notes

⚠️ **NEVER commit private keys to git**
⚠️ **NEVER add .env files to repository**
⚠️ **All secrets must be in Railway/Render environment variables**
⚠️ **Only public keys are logged (never secret keys)**

---

## Your Specific Wallet Addresses

Based on your configuration:

**Reward Wallet:**
- Address: `6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo`
- Private Key (base58): `2zL2NLzpdBM8JZdvQTaYYT96PEGKVdZV4JtLj6cPnLNVAvdGfz2DccocuSx9Ckp8tTBWpUFuqfnhKx4ASmnJ2Xoy`
- ⚠️ **Convert to JSON array before setting in Railway/Render**

**Treasury Wallet:**
- Address: `DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo`
- Private Key (base58): `2vTeKWE9BEogsiAtvDm5FLhycuNSbsKU1DioCRsnyJNPRQnJ96ewYjWYsr4PetYuCYeEKoJyi9Jw6YXtjSsL5Kjf`
- ⚠️ **Convert to JSON array before setting in Railway/Render (optional)**

---

## Testing Locally

For local development, create a `.env` file in the `backend/` directory:

```bash
# .env (DO NOT COMMIT THIS FILE)
PORT=3000
NODE_ENV=development
SOLANA_NETWORK=devnet
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
TOKEN_MINT=CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq
ADMIN_WALLET_JSON=[...]
REWARD_WALLET_PRIVATE_KEY_JSON=[...]
REWARD_WALLET_ADDRESS=6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
TREASURY_WALLET_ADDRESS=DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo
```

Add `.env` to `.gitignore` to prevent accidental commits.

