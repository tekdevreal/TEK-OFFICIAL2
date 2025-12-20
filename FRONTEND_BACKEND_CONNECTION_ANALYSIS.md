# Frontend Dashboard - Backend Endpoint Connection Analysis

## Summary

This document analyzes whether the frontend Dashboard component has all backend endpoints properly connected.

## ✅ Connected Endpoints

### 1. `/dashboard/rewards` 
- **Frontend**: `useRewards()` hook → `fetchRewards()` → `/dashboard/rewards`
- **Backend**: `backend/src/routes/dashboard.ts` line 147
- **Status**: ✅ **FULLY CONNECTED**
- **Usage**: Provides reward statistics, token price, tax data, scheduler status
- **Data Used**: `rewardsData.statistics`, `rewardsData.tax`, `rewardsData.nextRun`

### 2. `/dashboard/historical/rewards`
- **Frontend**: `useHistoricalRewards()` hook → `fetchHistoricalRewards()` → `/dashboard/historical/rewards`
- **Backend**: `backend/src/routes/historical.ts` line 22
- **Status**: ✅ **FULLY CONNECTED**
- **Usage**: Provides historical reward cycles for distribution cards
- **Data Used**: `historicalData.cycles` for distribution history pagination

### 3. DEX Volume 24h
- **Frontend**: `useDexVolume24h()` hook → `fetchDexVolume24h()`
- **Backend**: External API (Birdeye), not backend endpoint
- **Status**: ✅ **CONNECTED** (external service)
- **Usage**: Shows 24h DEX volume in Token Statistics section

## ❌ NOT Connected (Using Hardcoded Data)

### 1. `/dashboard/liquidity/pools`
- **Backend Endpoint**: Exists at `backend/src/routes/dashboard.ts` line 731
- **Frontend**: `Dashboard.tsx` lines 99-124 uses **hardcoded placeholder data**
- **Status**: ❌ **NOT CONNECTED**
- **Impact**: Liquidity pool cards show static placeholder values instead of real data
- **Current Implementation**: 
  ```typescript
  // Hardcoded in Dashboard.tsx
  const liquidityPools: LiquidityPoolCardItem[] = useMemo(() => {
    return [
      { pairName: 'NUKE / SOL', totalLiquidityUSD: 482300, volume24h: 124800 },
      { pairName: 'NUKE / USDC', totalLiquidityUSD: 425000, volume24h: 98000 },
    ];
  }, []);
  ```
- **Backend Response Format**:
  ```json
  {
    "pools": [
      {
        "pair": "NUKE / SOL",
        "liquidityUSD": 482300,
        "volume24hUSD": 124800
      },
      {
        "pair": "NUKE / USDC",
        "liquidityUSD": 310500,
        "volume24hUSD": 98200
      }
    ]
  }
  ```

### 2. `/dashboard/liquidity/summary`
- **Backend Endpoint**: Exists at `backend/src/routes/dashboard.ts` line 691
- **Frontend**: `Dashboard.tsx` lines 349-365 uses **hardcoded placeholder values**
- **Status**: ❌ **NOT CONNECTED**
- **Impact**: LP Summary stats show static values:
  - "Total Liquidity": "$4.2M" (hardcoded)
  - "24H Volume": "$1.1M" (hardcoded)
  - "Active Pools": "27" (hardcoded)
  - "Treasury Pools": "18" (hardcoded)

## 🔍 Available Backend Endpoints Not Used by Dashboard

The following backend endpoints exist but are **not currently used** by the Dashboard component:

1. `/dashboard/holders` - Holder list with eligibility status
2. `/dashboard/payouts` - Payout records (returns empty as payouts are now immediate)
3. `/dashboard/raydium` - Raydium DEX analytics
4. `/dashboard/diagnostics` - System diagnostic information
5. `/dashboard/token-stats` - Aggregated token statistics
6. `/dashboard/processing` - Current processing state
7. `/dashboard/distributions/recent` - Recent distribution epochs
8. `/dashboard/liquidity/summary` - Liquidity pool summary (exists, not connected)
9. `/dashboard/liquidity/pools` - Individual pool data (exists, not connected)

## 📊 Connection Status Summary

| Endpoint | Frontend Usage | Backend Exists | Status |
|----------|---------------|----------------|--------|
| `/dashboard/rewards` | ✅ Yes | ✅ Yes | ✅ **CONNECTED** |
| `/dashboard/historical/rewards` | ✅ Yes | ✅ Yes | ✅ **CONNECTED** |
| DEX Volume 24h (external) | ✅ Yes | N/A | ✅ **CONNECTED** |
| `/dashboard/liquidity/pools` | ❌ No (hardcoded) | ✅ Yes | ❌ **NOT CONNECTED** |
| `/dashboard/liquidity/summary` | ❌ No (hardcoded) | ✅ Yes | ❌ **NOT CONNECTED** |

## 🔧 Recommendations

### High Priority: Connect Liquidity Pool Data

1. **Create API hook for liquidity pools**:
   - Add `fetchLiquidityPools()` to `frontend/src/services/api.ts`
   - Add `useLiquidityPools()` hook to `frontend/src/hooks/useApiData.ts`

2. **Update Dashboard.tsx**:
   - Replace hardcoded `liquidityPools` with API call
   - Replace hardcoded LP summary stats with API call to `/dashboard/liquidity/summary`

3. **Map backend response to frontend format**:
   - Backend returns `pair`, `liquidityUSD`, `volume24hUSD`
   - Frontend expects `pairName`, `totalLiquidityUSD`, `volume24h`
   - Create mapping function

### Implementation Example

```typescript
// In frontend/src/services/api.ts
export async function fetchLiquidityPools(): Promise<LiquidityPoolsResponse> {
  const response = await retryRequest(() =>
    apiClient.get<LiquidityPoolsResponse>('/dashboard/liquidity/pools')
  );
  return response.data;
}

export async function fetchLiquiditySummary(): Promise<LiquiditySummaryResponse> {
  const response = await retryRequest(() =>
    apiClient.get<LiquiditySummaryResponse>('/dashboard/liquidity/summary')
  );
  return response.data;
}

// In frontend/src/hooks/useApiData.ts
export function useLiquidityPools(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery<LiquidityPoolsResponse>(
    'liquidity-pools',
    () => fetchLiquidityPools(),
    {
      ttl: 5 * 60 * 1000,
      staleTime: 2.5 * 60 * 1000,
      refetchInterval: options?.refetchInterval ?? 5 * 60 * 1000,
      enabled: options?.enabled !== false,
    }
  );
}
```

## Notes

- The backend `/dashboard/liquidity/pools` endpoint currently returns **placeholder data** (see backend code line 740-753)
- Backend TODOs indicate real liquidity data fetching needs to be implemented
- Frontend should be ready to consume real data when backend implements it
- Current implementation allows frontend to work with placeholders until real data is available

