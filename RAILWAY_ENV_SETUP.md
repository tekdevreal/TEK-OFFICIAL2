# Railway Environment Variables Setup

## ⚠️ Critical: Backend Won't Start Without These

The backend is crashing because required environment variables are missing in Railway.

## Quick Fix: Add Environment Variables

Go to Railway Dashboard → Your Backend Service → **Variables** tab

### Required Variables (Copy from backend/env.md)

Add these variables one by one:

#### 1. Core Configuration
```
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://rewards.tekportal.app/
```

#### 2. Solana Configuration
```
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=ae896970-4803-4004-a1ab-92560091c9e4
TOKEN_MINT=DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K
```

#### 3. Admin Wallet (Mark as Secret)
```
ADMIN_WALLET_JSON=[228,90,164,192,155,203,112,233,18,250,115,189,46,155,54,13,214,141,101,62,226,209,135,233,216,62,92,28,131,200,189,3,55,21,218,39,48,33,114,116,206,138,233,5,184,176,159,237,168,117,71,91,15,97,106,117,253,115,243,228,67,119,8,28]
```

#### 4. Raydium DEX Configuration
```
RAYDIUM_POOL_ID=4U8vs7wMVNijhjJsxBUA2JAif47QJcfBN97RKVRk7XQs
RAYDIUM_CPMM_AMM_CONFIG=HTVWgp8CbUsRNmRE1p9RBYqopxe2qiyApSkiTFLrfxaW
RAYDIUM_CPMM_OBSERVATION_STATE=GdwHP2eUjXsF2DzW3sUupXmGo7RoCr665qSHHs4Qk66K
```

#### 5. Reward Wallet (Mark as Secret) ⚠️ REQUIRED - This is what's missing!
```
REWARD_WALLET_ADDRESS=6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
REWARD_WALLET_PRIVATE_KEY_JSON=[99,116,89,4,241,26,231,133,189,138,130,166,123,119,44,117,60,144,3,24,222,254,147,8,79,111,44,30,33,190,195,225,80,34,251,176,201,157,179,160,61,79,12,64,148,146,10,235,57,22,81,121,5,197,58,105,164,24,113,239,189,86,246,180]
```

#### 6. Treasury Wallet (Mark as Secret)
```
TREASURY_WALLET_ADDRESS=DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo
TREASURY_WALLET_PRIVATE_KEY_JSON=[96,30,74,213,190,54,215,141,177,6,161,123,181,107,48,205,168,230,166,210,151,133,45,123,114,61,189,109,202,36,239,229,192,79,53,195,50,237,50,155,83,155,166,138,20,222,236,57,79,245,87,125,230,35,133,56,53,90,22,216,111,108,104,130]
```

#### 7. Reward System Configuration
```
TOTAL_REWARD_POOL_SOL=1.0
MIN_HOLDING_USD=5
MIN_SOL_PAYOUT=0.0001
REWARD_VALUE_MODE=TOKEN
```

#### 8. Tax Harvest Configuration
```
MIN_TAX_THRESHOLD_TOKEN=20000
MIN_TAX_THRESHOLD_USD=5
MAX_HARVEST_TOKEN=12000000
MAX_HARVEST_USD=2000
BATCH_COUNT=4
BATCH_DELAY_TOKEN_MODE=10000
BATCH_DELAY_USD_MODE=30000
```

#### 9. Payout Configuration
```
MIN_PAYOUT_TOKEN=60
MIN_PAYOUT_USD=0.001
```

## How to Add in Railway

1. **Go to Railway Dashboard:**
   - https://railway.app/dashboard
   - Select your project
   - Click on your backend service

2. **Go to Variables Tab:**
   - Click **Variables** in the left sidebar

3. **Add Each Variable:**
   - Click **+ New Variable**
   - Enter the **Key** (e.g., `REWARD_WALLET_PRIVATE_KEY_JSON`)
   - Enter the **Value** (the entire JSON array)
   - For private keys, check **Mark as Secret** 🔒
   - Click **Add**

4. **Mark These as Secrets:**
   - `ADMIN_WALLET_JSON` 🔒
   - `REWARD_WALLET_PRIVATE_KEY_JSON` 🔒
   - `TREASURY_WALLET_PRIVATE_KEY_JSON` 🔒

5. **After Adding All Variables:**
   - Railway will automatically redeploy
   - Check logs to verify backend starts successfully

## Verification

After adding all variables, check Railway logs. You should see:

```
✅ Wallet validation passed
✅ Server listening on port 10000
✅ Solana connection verified
```

Instead of:
```
❌ Wallet validation failed
❌ Environment variable REWARD_WALLET_PRIVATE_KEY_JSON is required
```

## Complete Variable List

For a complete reference, see: `backend/env.md`

All values are already documented there with proper formatting.

## Note

This is a **backend configuration issue**, not related to frontend or telegram bot. The backend needs these environment variables to start. Once added, the backend will start successfully.
