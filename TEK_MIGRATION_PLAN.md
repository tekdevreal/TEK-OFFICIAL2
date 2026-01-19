# TEK Token Migration Plan

## Overview
This document outlines the complete plan for migrating the project from the old token (NUKE) to the new TEK token.

## New Token Information
- **Token Name**: The Eternal Key (TEK)
- **Token Mint**: `DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K`
- **Pool ID**: `4U8vs7wMVNijhjJsxBUA2JAif47QJcfBN97RKVRk7XQs` (TEK/SOL)
- **CPMM AMM Config**: `HTVWgp8CbUsRNmRE1p9RBYqopxe2qiyApSkiTFLrfxaW`
- **CPMM Observation State**: `GdwHP2eUjXsF2DzW3sUupXmGo7RoCr665qSHHs4Qk66K`
- **Decimals**: 6
- **Transfer Fee**: 300 basis points (3%)

---

## ✅ Phase 1: Backend Updates (COMPLETED)

### Completed Tasks
1. ✅ Updated `backend/ENV_TEMPLATE.txt` with new TEK token mint, pool ID, and CPMM config values
2. ✅ Updated hardcoded token mint in `backend/src/services/liquidityService.ts` to use config value
3. ✅ Updated pair names in liquidityService from "NUKE" to "TEK"
4. ✅ Updated fallback values in utility TypeScript files:
   - `diagnose-reward-system.ts`
   - `verify-transfer-fee-config.ts`
   - `activate-transfer-fee.ts`
   - `setWithdrawAuthority.ts`
   - `check-mint-authority.ts`
   - `raydium-price.ts`
5. ✅ Updated `backend/env.md` with organized structure and new TEK token information
6. ✅ Updated frontend URL to: `https://rewards.tekportal.app/`
7. ✅ Created Railway deployment documentation:
   - `backend/RAILWAY_DEPLOY.md` - Complete Railway deployment guide
   - `backend/RAILWAY_CHECKLIST.md` - Deployment checklist
   - `railway.json` - Railway configuration file

### Environment Variables to Update
When deploying to Railway, update these environment variables:
- `TOKEN_MINT=DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K`
- `RAYDIUM_POOL_ID=4U8vs7wMVNijhjJsxBUA2JAif47QJcfBN97RKVRk7XQs`
- `RAYDIUM_CPMM_AMM_CONFIG=HTVWgp8CbUsRNmRE1p9RBYqopxe2qiyApSkiTFLrfxaW`
- `RAYDIUM_CPMM_OBSERVATION_STATE=GdwHP2eUjXsF2DzW3sUupXmGo7RoCr665qSHHs4Qk66K`
- `FRONTEND_URL=https://rewards.tekportal.app/`

**Note**: Wallets (treasury, rewards) can stay the same as they are yours.

### Deployment Platform: Railway
- **Provider**: Railway (migrated from Render)
- **Documentation**: See `backend/RAILWAY_DEPLOY.md` for complete setup guide
- **Checklist**: Use `backend/RAILWAY_CHECKLIST.md` for deployment verification

---

## 📋 Phase 2: Frontend Updates

### Files to Update

#### 1. Configuration Files
- **Search for**: Hardcoded token mint addresses, pool IDs, or "NUKE" references
- **Files to check**:
  - `frontend/src/services/api.ts` - API endpoints and configurations
  - `frontend/src/utils/*.ts` - Utility functions
  - `frontend/vite.config.ts` - Build configuration

#### 2. Display Text Updates
- **Search for**: "NUKE" in component files
- **Files to check**:
  - `frontend/src/components/*.tsx` - All component files
  - `frontend/src/pages/*.tsx` - All page files
  - Replace "NUKE" with "TEK" in:
    - Button labels
    - Headers and titles
    - Tooltips
    - Chart labels
    - Table headers
    - Error messages
    - Success messages

#### 3. Image Assets
- **Location**: `frontend/Image/` or `frontend/src/assets/`
- **Action**: Replace logo images:
  - `nukelogo.png` → `teklogo.png` (or update existing)
  - Update references in components that use these images

#### 4. CSS/Styling
- **Search for**: "nuke" (case-insensitive) in CSS files
- **Files to check**:
  - `frontend/src/**/*.css`
  - Update class names, IDs, or comments if needed

#### 5. API Integration
- **Check**: `frontend/src/services/api.ts`
- **Action**: Verify API endpoints don't have hardcoded token/pool references
- **Note**: Most API calls should be dynamic and use backend configuration

### Specific Frontend Files to Review
```
frontend/src/
├── components/
│   ├── Dashboard.tsx
│   ├── RewardSystem.tsx
│   ├── LiquidityPool.tsx
│   ├── PriceChart.tsx
│   └── ... (all other components)
├── pages/
│   ├── Home.tsx
│   ├── Dashboard.tsx
│   └── ... (all other pages)
├── services/
│   └── api.ts
└── App.tsx
```

---

## 📋 Phase 3: Telegram Bot Updates

### Files to Update

#### 1. Configuration
- **File**: `telegram-bot/src/config/env.ts`
- **Action**: Check if any token-specific configuration exists
- **Note**: Bot likely uses backend API, so may not need direct token config

#### 2. Message Templates
- **Search for**: "NUKE" in bot message templates
- **Files to check**:
  - `telegram-bot/src/services/telegramBot.ts`
  - `telegram-bot/src/services/bot.ts`
  - Update message text from "NUKE" to "TEK"

#### 3. API Integration
- **File**: `telegram-bot/src/services/backendClient.ts`
- **Action**: Verify bot correctly calls backend API (should be dynamic)

### Specific Telegram Bot Files to Review
```
telegram-bot/src/
├── services/
│   ├── telegramBot.ts
│   ├── bot.ts
│   └── backendClient.ts
└── config/
    └── env.ts
```

---

## 📋 Phase 4: Root Configuration Files

### Files to Update

#### 1. `config.js`
- **Current**: Contains "NUKE" token configuration
- **Action**: Update to TEK:
  ```javascript
  token: {
    name: 'The Eternal Key',
    symbol: 'TEK',
    decimals: 6,
    // ... rest of config
  }
  ```

#### 2. Documentation Files
- **Action**: Update references in:
  - `README.md`
  - `ENVIRONMENT_VARIABLES.md`
  - Any other documentation files
- **Note**: These are less critical but good for consistency

---

## 📋 Phase 5: Deployment Checklist

### Pre-Deployment
- [ ] Update all environment variables in Railway
- [ ] Verify backend builds successfully
- [ ] Verify frontend builds successfully
- [ ] Verify telegram bot builds successfully

### Backend Deployment (Railway)
- [ ] Create Railway project and connect GitHub repository
- [ ] Add backend service with root directory: `backend`
- [ ] Set all environment variables from `backend/env.md`
- [ ] Mark sensitive variables (private keys) as secrets
- [ ] Set `TOKEN_MINT` environment variable
- [ ] Set `RAYDIUM_POOL_ID` environment variable
- [ ] Set `RAYDIUM_CPMM_AMM_CONFIG` environment variable
- [ ] Set `RAYDIUM_CPMM_OBSERVATION_STATE` environment variable
- [ ] Set `FRONTEND_URL=https://rewards.tekportal.app/`
- [ ] Verify backend starts without errors
- [ ] Test API endpoints return correct data
- [ ] Get Railway service URL for frontend/bot configuration

### Frontend Deployment
- [ ] Update all "NUKE" references to "TEK"
- [ ] Replace logo images
- [ ] Verify frontend builds successfully
- [ ] Test frontend connects to backend correctly
- [ ] Verify dashboard displays correct data

### Telegram Bot Deployment
- [ ] Update message templates from "NUKE" to "TEK"
- [ ] Verify bot connects to backend correctly
- [ ] Test bot sends notifications correctly

### Post-Deployment Verification
- [ ] Test token price fetching
- [ ] Test liquidity pool data
- [ ] Test reward distribution (if applicable)
- [ ] Test swap functionality
- [ ] Verify telegram bot notifications work
- [ ] Check all dashboard metrics display correctly

---

## 🔍 Search Commands

Use these commands to find all references:

### Find "NUKE" references (case-insensitive)
```bash
grep -r -i "nuke" frontend/src/ telegram-bot/src/ --exclude-dir=node_modules
```

### Find old token mint
```bash
grep -r "CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq" frontend/ telegram-bot/
```

### Find old pool ID
```bash
grep -r "GFPwg4JVyRbsmNSvPGd8Wi3vvR3WVyChkjY56U7FKrc9" frontend/ telegram-bot/
```

---

## 📝 Notes

1. **Wallets**: Treasury and reward wallets can stay the same (they're yours)
2. **Backend API**: Should work automatically once environment variables are updated
3. **Frontend**: Most API calls are dynamic, but display text needs updating
4. **Telegram Bot**: Primarily needs message text updates
5. **Images**: Logo files need to be replaced or updated
6. **Testing**: Test thoroughly after each phase before moving to the next

---

## 🚀 Quick Start for Next Phases

### Frontend Updates
1. Search and replace "NUKE" with "TEK" in all component files
2. Update logo image references
3. Test build and deployment

### Telegram Bot Updates
1. Search and replace "NUKE" with "TEK" in message templates
2. Test bot functionality

### Final Deployment
1. Update all environment variables
2. Deploy backend first
3. Deploy frontend
4. Deploy telegram bot
5. Verify all systems working

---

## ✅ Summary

**Backend**: ✅ Complete & Ready for Railway
- All configuration files updated
- All hardcoded values updated
- Environment variables documented in `backend/env.md`
- Railway deployment guide created (`backend/RAILWAY_DEPLOY.md`)
- Railway deployment checklist created (`backend/RAILWAY_CHECKLIST.md`)
- Railway configuration file created (`railway.json`)
- Frontend URL updated to: `https://rewards.tekportal.app/`
- Ready for Railway deployment with new environment variables

**Frontend**: ⏳ Pending (Phase 2)
- Need to update display text ("NUKE" → "TEK")
- Need to update logo images
- Need to verify API integration
- Need to update backend URL to Railway service URL

**Telegram Bot**: ⏳ Pending
- Need to update message templates ("NUKE" → "TEK")
- Need to verify API integration
- Need to update backend URL to Railway service URL
- Need to deploy to Railway

**Root Config**: ⏳ Pending
- Need to update `config.js`
- Need to update documentation files
