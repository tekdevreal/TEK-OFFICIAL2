# Render Deployment Guide

## Quick Deploy via Render Dashboard

### Step 1: Create New Web Service
1. Go to: https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository:
   - Repository: `tekdevreal/TEK-OFFICIAL2`
   - Branch: `main`

### Step 2: Configure Service
- **Name**: `nukerewards-backend`
- **Environment**: `Node`
- **Region**: Choose closest to you (e.g., `Oregon`)
- **Branch**: `main`
- **Root Directory**: `backend`
- **Runtime**: `Node 20` (or latest LTS)

### Step 3: Build & Start Commands
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### Step 4: Environment Variables
Add these in Render Dashboard → Environment:

**Required:**
```
NODE_ENV=production
PORT=10000
```

**Solana Configuration:**
```
SOLANA_NETWORK=devnet
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
TOKEN_MINT=CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq
```

**Optional (if using reward features):**
```
ADMIN_WALLET_PATH=/opt/render/project/src/backend/admin.json
FRONTEND_URL=https://nukerewards.imgprotocol.com
TOTAL_REWARD_POOL_SOL=0.1
MIN_HOLDING_USD=5
MIN_SOL_PAYOUT=0.0001
```

**Note**: For `ADMIN_WALLET_PATH`, you'll need to upload `admin.json` as a secret file or use Render's file storage.

### Step 5: Deploy
1. Click "Create Web Service"
2. Wait for build to complete (usually 2-5 minutes)
3. Service will be available at: `https://nukerewards-backend.onrender.com` (or your custom domain)

### Step 6: Verify Deployment
Once deployed, test the health endpoint:
```bash
curl https://your-service-url.onrender.com/health
```

Expected response:
```json
{"status":"ok"}
```

## Using Render Blueprint (render.yaml)

Alternatively, you can use the `render.yaml` file in the repository root:

1. Go to: https://dashboard.render.com
2. Click "New +" → "Blueprint"
3. Connect repository: `tekdevreal/TEK-OFFICIAL2`
4. Render will detect `render.yaml` and create the service
5. Add environment variables in the dashboard

## Important Notes

⚠️ **Security:**
- Never commit `.env` files
- Use Render's environment variables for secrets
- For `admin.json`, consider using Render's file storage or environment variables

⚠️ **File Storage:**
- Render's filesystem is ephemeral (resets on deploy)
- For persistent data (state files, exports), use:
  - Render Disk (paid plans)
  - External storage (S3, etc.)
  - Database (PostgreSQL, MongoDB)

⚠️ **Free Tier Limitations:**
- Service spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Consider upgrading for production use

## Troubleshooting

**Build fails:**
- Check Node version (should be 20+)
- Verify `package.json` scripts are correct
- Check build logs in Render dashboard

**Service won't start:**
- Verify `PORT` environment variable
- Check that `dist/index.js` exists after build
- Review logs in Render dashboard

**CORS errors:**
- Update `FRONTEND_URL` environment variable
- Check CORS configuration in `src/server.ts`

