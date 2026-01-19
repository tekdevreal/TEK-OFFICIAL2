# Railway Deployment Guide for TEK Backend

This guide covers deploying the TEK (The Eternal Key) rewards backend to Railway.

---

## Prerequisites

- Railway account (sign up at https://railway.app)
- GitHub repository connected to Railway
- All environment variables ready (see `backend/env.md`)

---

## Quick Deployment Steps

### Step 1: Create New Project on Railway

1. **Go to Railway Dashboard:**
   - Visit: https://railway.app/dashboard
   - Sign in with GitHub

2. **Create New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository: `tekdevreal/TEK-OFFICIAL2`
   - Select branch: `main`

### Step 2: Add Backend Service

1. **Add New Service:**
   - Click "+ New" → "GitHub Repo"
   - Select your repository
   - Railway will auto-detect the project

2. **Configure Service:**
   - **Name**: `tek-backend` (or `tek-rewards-backend`)
   - **Root Directory**: `backend`
   - Railway will auto-detect Node.js and use `package.json`

3. **Build Settings (Auto-detected):**
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Node Version**: 20.6.0 (from `package.json` engines)

### Step 3: Configure Environment Variables

Go to your service → **Variables** tab and add all required environment variables from `backend/env.md`:

#### Required Variables

```bash
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://rewards.tekportal.app/
```

#### Solana Configuration

```bash
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
TOKEN_MINT=DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K
```

#### Admin Wallet (Mark as Secret)

```bash
ADMIN_WALLET_JSON=[228,90,164,192,155,203,112,233,18,250,115,189,46,155,54,13,214,141,101,62,226,209,135,233,216,62,92,28,131,200,189,3,55,21,218,39,48,33,114,116,206,138,233,5,184,176,159,237,168,117,71,91,15,97,106,117,253,115,243,228,67,119,8,28]
```

#### Raydium DEX Configuration

```bash
RAYDIUM_POOL_ID=4U8vs7wMVNijhjJsxBUA2JAif47QJcfBN97RKVRk7XQs
RAYDIUM_CPMM_AMM_CONFIG=HTVWgp8CbUsRNmRE1p9RBYqopxe2qiyApSkiTFLrfxaW
RAYDIUM_CPMM_OBSERVATION_STATE=GdwHP2eUjXsF2DzW3sUupXmGo7RoCr665qSHHs4Qk66K
```

#### Tax Distribution Wallets (Mark as Secrets)

```bash
REWARD_WALLET_ADDRESS=6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
REWARD_WALLET_PRIVATE_KEY_JSON=[99,116,89,4,241,26,231,133,189,138,130,166,123,119,44,117,60,144,3,24,222,254,147,8,79,111,44,30,33,190,195,225,80,34,251,176,201,157,179,160,61,79,12,64,148,146,10,235,57,22,81,121,5,197,58,105,164,24,113,239,189,86,246,180]

TREASURY_WALLET_ADDRESS=DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo
TREASURY_WALLET_PRIVATE_KEY_JSON=[96,30,74,213,190,54,215,141,177,6,161,123,181,107,48,205,168,230,166,210,151,133,45,123,114,61,189,109,202,36,239,229,192,79,53,195,50,237,50,155,83,155,166,138,20,222,236,57,79,245,87,125,230,35,133,56,53,90,22,216,111,108,104,130]
```

#### Reward System Configuration

```bash
TOTAL_REWARD_POOL_SOL=1.0
MIN_HOLDING_USD=5
MIN_SOL_PAYOUT=0.0001
REWARD_VALUE_MODE=TOKEN
```

#### Tax Harvest Configuration

```bash
MIN_TAX_THRESHOLD_TOKEN=20000
MIN_TAX_THRESHOLD_USD=5
MAX_HARVEST_TOKEN=12000000
MAX_HARVEST_USD=2000
BATCH_COUNT=4
BATCH_DELAY_TOKEN_MODE=10000
BATCH_DELAY_USD_MODE=30000
```

#### Payout Configuration

```bash
MIN_PAYOUT_TOKEN=60
MIN_PAYOUT_USD=0.001
```

**Important**: Mark sensitive variables (private keys, API keys) as **Secret** in Railway by clicking the lock icon.

### Step 4: Deploy

1. **Railway will auto-deploy** when you:
   - Push to the connected branch
   - Add/modify environment variables
   - Manually trigger deployment

2. **Monitor Deployment:**
   - Go to **Deployments** tab
   - Watch build logs
   - Wait for "Deployed" status (usually 2-5 minutes)

3. **Get Your Service URL:**
   - Railway provides a public URL automatically
   - Format: `https://your-service-name.up.railway.app`
   - You can also set a custom domain in **Settings** → **Networking**

### Step 5: Verify Deployment

1. **Check Health Endpoint:**
   ```bash
   curl https://your-service-name.up.railway.app/health
   ```
   
   Expected response:
   ```json
   {"status":"ok"}
   ```

2. **Check Logs:**
   - Go to **Logs** tab in Railway dashboard
   - Look for: `Server listening on port 10000`
   - Look for: `Solana connection verified`
   - No error messages

3. **Test API Endpoints:**
   ```bash
   # Test dashboard endpoint
   curl https://your-service-name.up.railway.app/dashboard/cycles/current
   
   # Test rewards endpoint
   curl https://your-service-name.up.railway.app/dashboard/rewards
   ```

---

## Railway-Specific Features

### Custom Domain

1. Go to **Settings** → **Networking**
2. Click **Generate Domain** or **Add Custom Domain**
3. Update `FRONTEND_URL` if needed for CORS

### Environment Variables

- **Shared Variables**: Set at project level (applies to all services)
- **Service Variables**: Set at service level (specific to backend)
- **Secrets**: Mark sensitive variables with lock icon

### Monitoring

- **Metrics**: View CPU, Memory, Network usage
- **Logs**: Real-time logs in dashboard
- **Deployments**: Track all deployments and rollback if needed

### Scaling

- **Replicas**: Set to 1 for single instance (default)
- **Resource Limits**: Adjust CPU/Memory if needed
- **Auto-scaling**: Available on paid plans

---

## Troubleshooting

### Build Fails

**Issue**: Build command fails
- **Solution**: Check Node version matches `package.json` engines
- **Solution**: Verify all dependencies in `package.json`
- **Solution**: Check build logs for specific errors

### Service Won't Start

**Issue**: Service crashes on startup
- **Solution**: Check environment variables are set correctly
- **Solution**: Verify `PORT` is set (Railway auto-assigns, but we use 10000)
- **Solution**: Check logs for missing required variables

### Environment Variables Not Working

**Issue**: Variables not being read
- **Solution**: Ensure variables are set at service level (not just project level)
- **Solution**: Redeploy after adding variables
- **Solution**: Check variable names match exactly (case-sensitive)

### Port Issues

**Issue**: Port already in use or wrong port
- **Solution**: Railway auto-assigns `PORT` via `$PORT` environment variable
- **Solution**: Our code uses `PORT` from env, Railway will inject `$PORT`
- **Note**: Railway uses dynamic ports, but we can override with our `PORT=10000`

---

## Migration from Render

If migrating from Render:

1. **Export Environment Variables from Render:**
   - Copy all variables from Render dashboard
   - Note which are secrets

2. **Import to Railway:**
   - Add all variables to Railway
   - Mark secrets appropriately

3. **Update Frontend/Bot:**
   - Update `BACKEND_URL` in frontend and telegram bot
   - Point to new Railway URL

4. **Test Everything:**
   - Verify all endpoints work
   - Check telegram bot connects correctly
   - Test reward distribution

5. **Decommission Render:**
   - After confirming Railway works, delete Render service

---

## Next Steps

After backend is deployed:

1. ✅ **Backend**: Deployed on Railway
2. ⏳ **Frontend**: Update and deploy (Phase 2)
3. ⏳ **Telegram Bot**: Update and deploy to Railway

---

## Related Files

- `backend/env.md` - Complete environment variables reference
- `backend/ENV_TEMPLATE.txt` - Environment template with descriptions
- `TEK_MIGRATION_PLAN.md` - Complete migration guide
