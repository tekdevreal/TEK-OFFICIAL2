# Harvesting and Distribution Page Stats Updates

## Summary
Updated stat cards on Harvesting and Distribution pages to show SOL/USD values and time-only displays.

## Changes Made

### 1. Backend - Added SOL Price Endpoint

**File**: `backend/src/routes/dashboard.ts`

Added new endpoint:
```
GET /dashboard/sol-price
```

Returns:
```json
{
  "price": 123.45,
  "source": "jupiter",
  "updatedAt": "2026-01-10T10:00:00Z"
}
```

**File**: `backend/src/services/raydiumService.ts`

Exported `getSOLPriceUSD()` function to be used by the endpoint.

### 2. Frontend - Added SOL Price Fetching

**File**: `frontend/src/types/api.ts`

Added interface:
```typescript
export interface SolPriceResponse {
  price: number;
  source: 'jupiter' | 'fallback';
  updatedAt: string;
}
```

**File**: `frontend/src/services/api.ts`

Added function:
```typescript
export async function fetchSolPrice(): Promise<SolPriceResponse>
```

**File**: `frontend/src/hooks/useApiData.ts`

Added hook:
```typescript
export function useSolPrice(options?: { enabled?: boolean; refetchInterval?: number })
```

### 3. Harvesting Page Updates

**File**: `frontend/src/pages/HarvestingPage.tsx`

**Old Stats:**
1. Total NUKE Harvested
2. Next Harvesting (date)
3. Last Harvesting (date)
4. Estimated SOL

**New Stats:**
1. Total NUKE Harvested (unchanged)
2. Allocated SOL: Total SOL allocated to holders
3. Allocated USD: SOL value × SOL price
4. Last Harvesting: Time only (HH:MM format)

### 4. Distribution Page Updates

**File**: `frontend/src/pages/DistributionPage.tsx`

**Old Stats:**
1. Total SOL Distributed
2. Next Distribution (date)
3. Last Distribution (date)
4. Estimated SOL

**New Stats:**
1. Total SOL Distributed (unchanged)
2. Distribution USD Value: SOL distributed × SOL price
3. Next Distribution: "5 Minutes"
4. Last Distribution: Time only (HH:MM format)

## Formulas

### Harvesting Page
- **Allocated SOL**: Sum of all `allocatedSOL` in filtered data
- **Allocated USD**: `Allocated SOL × SOL Price USD`
- **Last Harvesting**: Most recent harvest time (HH:MM format)

### Distribution Page
- **Distribution USD Value**: `Total SOL Distributed × SOL Price USD`
- **Next Distribution**: Always shows "5 Minutes" (cycle interval)
- **Last Distribution**: Most recent distribution time (HH:MM format)

## Deployment

1. Build backend:
```bash
cd backend && npm run build
```

2. Build frontend:
```bash
cd frontend && npm run build
```

3. Restart services or wait for auto-deployment

## Expected Behavior

### Harvesting Page Stats
```
┌─────────────────────────┐
│ Total NUKE Harvested    │
│ 1,234,567               │
└─────────────────────────┘

┌─────────────────────────┐
│ Allocated SOL           │
│ 12.345678 SOL           │
└─────────────────────────┘

┌─────────────────────────┐
│ Allocated USD           │
│ $1,234.56               │
└─────────────────────────┘

┌─────────────────────────┐
│ Last Harvesting         │
│ 14:35                   │
└─────────────────────────┘
```

### Distribution Page Stats
```
┌─────────────────────────┐
│ Total SOL Distributed   │
│ 45.123456 SOL           │
└─────────────────────────┘

┌─────────────────────────┐
│ Distribution USD Value  │
│ $4,512.34               │
└─────────────────────────┘

┌─────────────────────────┐
│ Next Distribution       │
│ 5 Minutes               │
└─────────────────────────┘

┌─────────────────────────┐
│ Last Distribution       │
│ 14:40                   │
└─────────────────────────┘
```

## Files Modified
1. ✅ `backend/src/services/raydiumService.ts` - Exported getSOLPriceUSD
2. ✅ `backend/src/routes/dashboard.ts` - Added /sol-price endpoint
3. ✅ `frontend/src/types/api.ts` - Added SolPriceResponse interface
4. ✅ `frontend/src/services/api.ts` - Added fetchSolPrice function
5. ✅ `frontend/src/hooks/useApiData.ts` - Added useSolPrice hook
6. ✅ `frontend/src/pages/HarvestingPage.tsx` - Updated stat cards
7. ✅ `frontend/src/pages/DistributionPage.tsx` - Updated stat cards

All changes completed successfully with no linter errors!
