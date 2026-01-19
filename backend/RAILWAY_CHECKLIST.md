# Railway Deployment Checklist for TEK Backend

Use this checklist to ensure a smooth deployment to Railway.

---

## Pre-Deployment

- [ ] Railway account created and logged in
- [ ] GitHub repository: `tekdevreal/TEK-OFFICIAL2` pushed to GitHub
- [ ] GitHub repository connected to Railway
- [ ] All environment variables documented in `backend/env.md`
- [ ] Frontend URL confirmed: `https://rewards.tekportal.app/`
- [ ] Helius RPC URL and API key ready
- [ ] All wallet private keys ready (admin, reward, treasury)

---

## Railway Project Setup

- [ ] New Railway project created
- [ ] GitHub repository connected
- [ ] Branch set to `main` (or your deployment branch)

---

## Backend Service Configuration

- [ ] Service name set: `tek-backend` (or preferred name)
- [ ] Root directory set: `backend`
- [ ] Build command verified: `npm install && npm run build`
- [ ] Start command verified: `npm start`
- [ ] Node version: 20.6.0 (auto-detected from package.json)

---

## Environment Variables Setup

### Required Variables

- [ ] `NODE_ENV=production`
- [ ] `PORT=10000`
- [ ] `FRONTEND_URL=https://rewards.tekportal.app/`

### Solana Configuration

- [ ] `SOLANA_NETWORK=devnet`
- [ ] `SOLANA_RPC_URL` (with Helius API key)
- [ ] `TOKEN_MINT=DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K`

### Admin Wallet (Mark as Secret)

- [ ] `ADMIN_WALLET_JSON` (64-number array, marked as secret)

### Raydium DEX Configuration

- [ ] `RAYDIUM_POOL_ID=4U8vs7wMVNijhjJsxBUA2JAif47QJcfBN97RKVRk7XQs`
- [ ] `RAYDIUM_CPMM_AMM_CONFIG=HTVWgp8CbUsRNmRE1p9RBYqopxe2qiyApSkiTFLrfxaW`
- [ ] `RAYDIUM_CPMM_OBSERVATION_STATE=GdwHP2eUjXsF2DzW3sUupXmGo7RoCr665qSHHs4Qk66K`

### Tax Distribution Wallets (Mark as Secrets)

- [ ] `REWARD_WALLET_ADDRESS`
- [ ] `REWARD_WALLET_PRIVATE_KEY_JSON` (marked as secret)
- [ ] `TREASURY_WALLET_ADDRESS`
- [ ] `TREASURY_WALLET_PRIVATE_KEY_JSON` (marked as secret)

### Reward System Configuration

- [ ] `TOTAL_REWARD_POOL_SOL=1.0`
- [ ] `MIN_HOLDING_USD=5`
- [ ] `MIN_SOL_PAYOUT=0.0001`
- [ ] `REWARD_VALUE_MODE=TOKEN`

### Tax Harvest Configuration

- [ ] `MIN_TAX_THRESHOLD_TOKEN=20000`
- [ ] `MIN_TAX_THRESHOLD_USD=5`
- [ ] `MAX_HARVEST_TOKEN=12000000`
- [ ] `MAX_HARVEST_USD=2000`
- [ ] `BATCH_COUNT=4`
- [ ] `BATCH_DELAY_TOKEN_MODE=10000`
- [ ] `BATCH_DELAY_USD_MODE=30000`

### Payout Configuration

- [ ] `MIN_PAYOUT_TOKEN=60`
- [ ] `MIN_PAYOUT_USD=0.001`

---

## Deployment

- [ ] All environment variables added
- [ ] All secrets marked with lock icon
- [ ] Deployment triggered (auto or manual)
- [ ] Build logs checked for errors
- [ ] Deployment status: "Deployed" (green)

---

## Post-Deployment Verification

### Health Check

- [ ] Health endpoint responds: `curl https://your-service.up.railway.app/health`
- [ ] Response: `{"status":"ok"}`

### Logs Verification

- [ ] Logs show: `Server listening on port 10000`
- [ ] Logs show: `Solana connection verified`
- [ ] Logs show: `Token mint: DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K`
- [ ] No error messages in logs

### API Endpoints Test

- [ ] `/dashboard/cycles/current` returns data
- [ ] `/dashboard/rewards` returns data
- [ ] `/dashboard/liquidity` returns data
- [ ] All endpoints respond without errors

### CORS Verification

- [ ] Frontend can connect to backend
- [ ] No CORS errors in browser console
- [ ] `FRONTEND_URL` matches frontend domain

---

## Service URL & Domain

- [ ] Railway service URL noted: `https://your-service.up.railway.app`
- [ ] Custom domain configured (if needed)
- [ ] Domain verified and active

---

## Next Steps

- [ ] Backend deployment complete ✅
- [ ] Update frontend with new backend URL (Phase 2)
- [ ] Update telegram bot with new backend URL
- [ ] Deploy telegram bot to Railway

---

## Troubleshooting

If deployment fails:

- [ ] Check build logs for specific errors
- [ ] Verify all required environment variables are set
- [ ] Check Node version matches (20.6.0)
- [ ] Verify root directory is `backend`
- [ ] Check that secrets are marked correctly
- [ ] Review Railway deployment documentation

---

## Notes

- Railway auto-detects Node.js projects
- Environment variables can be set at project or service level
- Service-level variables override project-level
- Secrets are encrypted and hidden in logs
- Railway provides automatic HTTPS
- Custom domains available in Settings → Networking
