# Backend API Analysis & Integration Plan

**Date**: 2025-01-15  
**Purpose**: Analyze current backend endpoints vs. frontend requirements and plan real data integration

---

## Executive Summary

### Current State
- **Frontend**: Using placeholder data for most pages (Harvesting, Distribution, Treasury, System Status, Analytics)
- **Backend**: Has endpoints for old design (rewards, holders, payouts) but missing endpoints for new page requirements
- **Gap**: New pages need harvesting, distribution, treasury, system status, and analytics endpoints

### Integration Priority
1. **High Priority**: Harvesting, Distribution, Treasury (core functionality)
2. **Medium Priority**: System Status, Analytics (monitoring and insights)
3. **Low Priority**: Liquidity Pools (can use placeholder data initially)

---

## Part 1: Current Backend Endpoints

### ✅ Existing Endpoints (Currently Used)

#### 1. `/health`
- **Status**: ✅ Active
- **Used By**: Health checks
- **Response**: `{ status: "ok" }`

#### 2. `/dashboard/rewards`
- **Status**: ✅ Active
- **Used By**: Dashboard page (main stats)
- **Response**: Includes:
  - `lastRun`, `nextRun`, `isRunning`
  - `statistics` (totalHolders, eligibleHolders, etc.)
  - `tokenPrice` (sol, usd, source)
  - `tax` (totalNukeHarvested, totalNukeSold, totalSolDistributed, etc.)
- **Note**: This endpoint provides tax statistics that are used on Dashboard

#### 3. `/dashboard/holders`
- **Status**: ✅ Active
- **Used By**: Not currently used in new design
- **Response**: List of holders with eligibility status
- **Note**: May be useful for future features

#### 4. `/dashboard/payouts`
- **Status**: ✅ Active (but returns empty array)
- **Used By**: Not currently used in new design
- **Response**: Empty payouts array (payouts are now immediate via tax distribution)
- **Note**: Legacy endpoint, can be deprecated

#### 5. `/dashboard/historical/rewards`
- **Status**: ✅ Active
- **Used By**: Dashboard page (Distribution cards)
- **Response**: Historical reward cycles with:
  - `id`, `timestamp`, `totalSOLDistributed`
  - `eligibleHoldersCount`, `excludedHoldersCount`
  - `tokenPriceUSD`
- **Note**: Used for Distribution cards on main page

#### 6. `/dashboard/historical/payouts`
- **Status**: ✅ Active
- **Used By**: Not currently used in new design
- **Response**: Historical payout records
- **Note**: Legacy endpoint, may be useful for analytics

#### 7. `/dashboard/historical/export/rewards`
- **Status**: ✅ Active
- **Used By**: Export functionality (if implemented)
- **Response**: CSV/Excel export of reward cycles

#### 8. `/dashboard/historical/export/payouts`
- **Status**: ✅ Active
- **Used By**: Export functionality (if implemented)
- **Response**: CSV/Excel export of payout data

#### 9. `/dashboard/raydium`
- **Status**: ✅ Active
- **Used By**: Not currently used
- **Response**: Raydium DEX analytics for NUKE token

#### 10. `/dashboard/diagnostics`
- **Status**: ✅ Active
- **Used By**: Not currently used
- **Response**: Diagnostic information about the system

#### 11. `/audit/latest`
- **Status**: ✅ Active
- **Used By**: Telegram bot (not frontend)
- **Response**: Latest export file

#### 12. `/audit/summary`
- **Status**: ✅ Active
- **Used By**: Telegram bot (not frontend)
- **Response**: Export summary

#### 13. `/audit/generate`
- **Status**: ✅ Active
- **Used By**: Telegram bot (not frontend)
- **Response**: Manually trigger export generation

---

## Part 2: Frontend Pages & Data Requirements

### 📊 Dashboard Page (`/`)
**Current Data Source**: `/dashboard/rewards`, `/dashboard/historical/rewards`

**Data Needed**:
- ✅ Token Statistics (from `/dashboard/rewards`)
- ✅ Processing Stats (from `/dashboard/rewards`)
- ✅ Distribution Cards (from `/dashboard/historical/rewards`)
- ❌ Liquidity Pools (placeholder data)

**Status**: **Partially Integrated** - Main stats work, but Liquidity Pools need real data

---

### 🌾 Harvesting Page (`/harvesting`)
**Current Data Source**: Placeholder data only

**Data Needed**:
- **Stats**:
  - Total Nuke Harvested
  - Next Harvesting (from scheduler)
  - Last Harvesting
  - Estimated SOL
- **Table Data**:
  - ID (harvesting batch ID)
  - DATE
  - TIME
  - NUKE SOLD
  - REWARD POOL (SOL)
  - ALLOCATED (SOL)

**Backend Data Available**:
- Tax service has: `totalNukeHarvested`, `totalNukeSold`, `lastTaxDistribution`
- Tax state file has: `taxDistributions[]` array with historical data

**Required Endpoint**: `/dashboard/harvesting`
- Should return list of harvesting events from `taxDistributions`
- Each event should include: timestamp, NUKE harvested, SOL from swap, allocation

**Status**: **Not Integrated** - Needs new endpoint

---

### 📤 Distribution Page (`/distribution`)
**Current Data Source**: Placeholder data only

**Data Needed**:
- **Stats**:
  - Total NUKE Sold
  - Next Distribution
  - Last Distribution
  - Estimated SOL
- **Table Data**:
  - ID (distribution batch ID / epoch number)
  - DATE
  - TIME
  - RECIPIENTS (number of holders)
  - TRANSACTIONS (number of transactions)
  - DISTRIBUTED (SOL)

**Backend Data Available**:
- Historical rewards endpoint has: `cycles[]` with `totalSOLDistributed`, `eligibleHoldersCount`
- Tax service has: `distributionCount`, `lastDistributionTx`

**Required Endpoint**: `/dashboard/distributions` or enhance `/dashboard/historical/rewards`
- Should return distribution events with recipient counts and transaction counts
- Can use existing `/dashboard/historical/rewards` but needs enhancement

**Status**: **Partially Integrated** - Can use historical rewards but needs enhancement

---

### 💰 Treasury Page (`/treasury`)
**Current Data Source**: Placeholder data only

**Data Needed**:
- **Stats**:
  - Treasury Balance (SOL or USD)
  - Pending Allocation
  - Active Deployments
  - Last Treasury Action
- **Wallet Address**: Treasury wallet address (from env)
- **Table Data**:
  - DATE
  - TIME
  - ACTION (Add Liquidity, Withdraw, Transfer, etc.)
  - AMOUNT
  - DETAIL
  - REFERENCE (transaction signature)

**Backend Data Available**:
- Tax service has: `totalSolToTreasury`, `totalTreasuryAmount`
- Treasury wallet address from env: `TREASURY_WALLET_ADDRESS`
- Need to track treasury transactions (not currently tracked)

**Required Endpoint**: `/dashboard/treasury`
- Should return:
  - Treasury balance (from on-chain query)
  - Treasury activity log (need to track this)
  - Pending allocations (if any)

**Status**: **Not Integrated** - Needs new endpoint and transaction tracking

---

### ⚙️ System Status Page (`/system-status`)
**Current Data Source**: Placeholder data only

**Data Needed**:
- **Stats**:
  - Distribution engine: Online/Offline
  - Harvesting engine: Online/Offline
  - Errors: Count or "None"
  - Last Update: Timestamp
- **Table Data**:
  - System Component
  - Status (Online/Offline)
  - Status Indicator (emoji)

**Backend Data Available**:
- Scheduler status: `getSchedulerStatus()` returns `isRunning`, `lastRun`, `nextRun`
- Tax service status: Can check if tax processing is working
- Error tracking: Need to implement error logging/counting

**Required Endpoint**: `/dashboard/system-status`
- Should return:
  - Distribution engine status
  - Harvesting engine status
  - Error count
  - Last update timestamp
  - Component status list

**Status**: **Not Integrated** - Needs new endpoint

---

### 📈 Analytics Page (`/analytics`)
**Current Data Source**: Placeholder data only

**Data Needed**:
- **Stats**:
  - Total SOL Distributed (All Time)
  - Average SOL per Epoch
  - Total Reward Epochs
  - Total Treasury Deployed
- **Charts**:
  - Rewards Over Time (line chart)
  - Volume vs Rewards Correlation (dual line/bar chart)
  - Treasury Balance Over Time (line chart)
- **Tables**:
  - Liquidity Pool Performance
- **Metrics**:
  - Successful Reward Epochs (%)
  - Failed Reward Epochs (%)
  - Average Distribution Processing Time
  - Average Harvest to Distribution Delay

**Backend Data Available**:
- Historical rewards: `/dashboard/historical/rewards`
- Tax statistics: From `/dashboard/rewards` tax object
- Treasury data: Need treasury balance history
- Volume data: Need DEX volume tracking

**Required Endpoint**: `/dashboard/analytics`
- Should aggregate data from multiple sources:
  - Historical rewards for charts
  - Tax statistics for totals
  - Treasury balance history (need to track)
  - Volume data (need to track)

**Status**: **Not Integrated** - Needs new endpoint and data tracking

---

## Part 3: Required New Endpoints

### 🔴 High Priority

#### 1. `GET /dashboard/harvesting`
**Purpose**: Get harvesting data for Harvesting page

**Query Params**:
- `startDate` (optional): Filter by start date
- `endDate` (optional): Filter by end date
- `year` (optional): Filter by year
- `month` (optional): Filter by month
- `limit` (optional): Pagination limit
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "total": 150,
  "limit": 100,
  "offset": 0,
  "hasMore": true,
  "harvests": [
    {
      "id": "HARV-001",
      "timestamp": "2025-01-15T10:30:00Z",
      "date": "2025-01-15",
      "time": "10:30 AM EST",
      "nukeHarvested": "125000",
      "nukeSold": "125000",
      "rewardPoolSOL": "9.375",
      "allocatedSOL": "7.031",
      "swapTx": "5KJp8vN2mQr9xYz3wE7tR4bC6dF1gH8jL0pM9nQ2sT5uV7xY"
    }
  ],
  "summary": {
    "totalNukeHarvested": "15000000",
    "totalNukeSold": "15000000",
    "totalRewardPoolSOL": "1125.5",
    "totalAllocatedSOL": "843.75"
  }
}
```

**Implementation Notes**:
- Read from `taxDistributions[]` in tax state file
- Format timestamps to date/time strings
- Calculate summary statistics

---

#### 2. `GET /dashboard/distributions`
**Purpose**: Get distribution data for Distribution page

**Query Params**:
- `startDate` (optional): Filter by start date
- `endDate` (optional): Filter by end date
- `year` (optional): Filter by year
- `month` (optional): Filter by month
- `limit` (optional): Pagination limit
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "total": 120,
  "limit": 100,
  "offset": 0,
  "hasMore": true,
  "distributions": [
    {
      "id": "DIST-001",
      "epochNumber": 120,
      "timestamp": "2025-01-15T10:30:00Z",
      "date": "2025-01-15",
      "time": "10:30 AM EST",
      "recipients": 1250,
      "transactions": 1250,
      "distributedSOL": "7.031",
      "status": "completed",
      "distributionTx": "5KJp8vN2mQr9xYz3wE7tR4bC6dF1gH8jL0pM9nQ2sT5uV7xY"
    }
  ],
  "summary": {
    "totalNukeSold": "15000000",
    "totalDistributedSOL": "1125.5",
    "totalRecipients": 150000,
    "totalTransactions": 150000
  }
}
```

**Implementation Notes**:
- Can enhance existing `/dashboard/historical/rewards` or create new endpoint
- Map reward cycles to distribution format
- Include epoch numbers if available

---

#### 3. `GET /dashboard/treasury`
**Purpose**: Get treasury data for Treasury page

**Query Params**:
- `startDate` (optional): Filter by start date
- `endDate` (optional): Filter by end date
- `year` (optional): Filter by year
- `month` (optional): Filter by month
- `limit` (optional): Pagination limit
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "treasuryWallet": "6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo",
  "balance": {
    "sol": "125.5",
    "usd": "12500.00"
  },
  "summary": {
    "treasuryBalance": "$12,500",
    "pendingAllocation": "$0",
    "activeDeployments": 2,
    "lastTreasuryAction": "2025-01-15"
  },
  "total": 50,
  "limit": 100,
  "offset": 0,
  "hasMore": false,
  "activities": [
    {
      "id": "TREAS-001",
      "timestamp": "2025-01-15T14:30:00Z",
      "date": "2025-01-15",
      "time": "2:30 PM EST",
      "action": "Add Liquidity",
      "amount": "$5,000",
      "amountSOL": "50.0",
      "detail": "Added liquidity to NUKE/SOL Pool",
      "reference": "5KJp8vN2mQr9xYz3wE7tR4bC6dF1gH8jL0pM9nQ2sT5uV7xY"
    }
  ]
}
```

**Implementation Notes**:
- Query treasury wallet balance from Solana
- Track treasury transactions (need to implement transaction tracking)
- Calculate USD value from SOL price

---

### 🟡 Medium Priority

#### 4. `GET /dashboard/system-status`
**Purpose**: Get system status for System Status page

**Response**:
```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "lastUpdate": "2025-01-15",
  "components": [
    {
      "name": "Distribution engine",
      "status": "Online",
      "lastRun": "2025-01-15T10:00:00Z",
      "nextRun": "2025-01-15T11:00:00Z",
      "isRunning": false
    },
    {
      "name": "Harvesting engine",
      "status": "Online",
      "lastRun": "2025-01-15T10:00:00Z",
      "nextRun": "2025-01-15T10:30:00Z",
      "isRunning": false
    }
  ],
  "errors": {
    "count": 0,
    "recent": []
  },
  "summary": {
    "distributionEngine": "Online",
    "harvestingEngine": "Online",
    "errors": "None",
    "lastUpdate": "2025-01-15"
  }
}
```

**Implementation Notes**:
- Get scheduler status from `getSchedulerStatus()`
- Check tax service status
- Implement error tracking/counting

---

#### 5. `GET /dashboard/analytics`
**Purpose**: Get analytics data for Analytics page

**Query Params**:
- `startDate` (optional): Filter by start date
- `endDate` (optional): Filter by end date

**Response**:
```json
{
  "stats": {
    "totalSOLDistributed": "125450.75",
    "averageSOLPerEpoch": "1045.42",
    "totalRewardEpochs": 120,
    "totalTreasuryDeployed": "$45200"
  },
  "rewardsOverTime": [
    {
      "epoch": "Epoch 120",
      "date": "2025-01-15",
      "solDistributed": 1500
    }
  ],
  "volumeVsRewards": [
    {
      "date": "2025-01-15",
      "volume24h": 125000,
      "solDistributed": 1500
    }
  ],
  "treasuryBalance": [
    {
      "date": "2025-01-15",
      "treasuryBalance": 25000,
      "deployed": 15000,
      "available": 10000
    }
  ],
  "liquidityPoolPerformance": [
    {
      "poolPair": "NUKE / SOL",
      "totalFeesGenerated": "$12450",
      "average24HVolume": "$125800"
    }
  ],
  "reliabilityMetrics": {
    "successfulEpochsPercent": 98.5,
    "failedEpochsPercent": 1.5,
    "averageProcessingTime": "2.3 seconds",
    "averageHarvestToDistributionDelay": "15 minutes"
  }
}
```

**Implementation Notes**:
- Aggregate data from multiple sources
- Calculate metrics from historical data
- Track treasury balance over time (need to implement)

---

## Part 4: Data Sources & Implementation

### Available Backend Data

#### Tax Service (`taxService.ts`)
- `getTaxStatistics()`: Returns tax statistics including:
  - `totalNukeHarvested`
  - `totalNukeSold`
  - `totalSolDistributed`
  - `totalSolToTreasury`
  - `lastTaxDistribution`
  - `lastSwapTx`
  - `lastDistributionTx`
  - `distributionCount`
- Tax state file (`reward-state.json`): Contains `taxDistributions[]` array with historical data

#### Reward Service (`rewardService.ts`)
- `getLastReward()`: Last reward cycle
- `getEligibleHolders()`: List of eligible holders
- `getAllHoldersWithStatus()`: All holders with eligibility status

#### Scheduler (`rewardScheduler.ts`)
- `getSchedulerStatus()`: Returns:
  - `isRunning`
  - `lastRun`
  - `nextRun`

#### Historical Rewards (`rewardHistoryService.ts`)
- `getHistoricalRewardCycles()`: Historical reward cycles
- `getHistoricalPayouts()`: Historical payout records

---

## Part 5: Implementation Plan

### Phase 1: Harvesting Endpoint (High Priority)
1. Create `/dashboard/harvesting` route
2. Read from `taxDistributions[]` in tax state file
3. Format data for frontend table
4. Add summary statistics
5. Update frontend to use real data

### Phase 2: Distribution Endpoint (High Priority)
1. Enhance `/dashboard/historical/rewards` or create `/dashboard/distributions`
2. Map reward cycles to distribution format
3. Include epoch numbers
4. Add recipient and transaction counts
5. Update frontend to use real data

### Phase 3: Treasury Endpoint (High Priority)
1. Create `/dashboard/treasury` route
2. Query treasury wallet balance from Solana
3. Implement treasury transaction tracking
4. Format activity log
5. Update frontend to use real data

### Phase 4: System Status Endpoint (Medium Priority)
1. Create `/dashboard/system-status` route
2. Get scheduler status
3. Check tax service status
4. Implement error tracking
5. Update frontend to use real data

### Phase 5: Analytics Endpoint (Medium Priority)
1. Create `/dashboard/analytics` route
2. Aggregate data from multiple sources
3. Calculate metrics
4. Implement treasury balance tracking
5. Update frontend to use real data

---

## Part 6: Frontend Integration Checklist

### Harvesting Page
- [ ] Create `useHarvesting` hook in `useApiData.ts`
- [ ] Add `fetchHarvesting` function in `api.ts`
- [ ] Update `HarvestingPage.tsx` to use real data
- [ ] Remove placeholder data

### Distribution Page
- [ ] Create `useDistributions` hook in `useApiData.ts`
- [ ] Add `fetchDistributions` function in `api.ts`
- [ ] Update `DistributionPage.tsx` to use real data
- [ ] Remove placeholder data

### Treasury Page
- [ ] Create `useTreasury` hook in `useApiData.ts`
- [ ] Add `fetchTreasury` function in `api.ts`
- [ ] Update `HoldersPage.tsx` to use real data
- [ ] Remove placeholder data

### System Status Page
- [ ] Create `useSystemStatus` hook in `useApiData.ts`
- [ ] Add `fetchSystemStatus` function in `api.ts`
- [ ] Update `SystemStatusPage.tsx` to use real data
- [ ] Remove placeholder data

### Analytics Page
- [ ] Create `useAnalytics` hook in `useApiData.ts`
- [ ] Add `fetchAnalytics` function in `api.ts`
- [ ] Update `AnalyticsPage.tsx` to use real data
- [ ] Remove placeholder data

---

## Part 7: Notes & Considerations

### Data Tracking Requirements
1. **Treasury Transactions**: Need to track treasury wallet transactions (currently not tracked)
2. **Error Logging**: Need to implement error counting/tracking for system status
3. **Treasury Balance History**: Need to track treasury balance over time for analytics
4. **Volume Data**: Need to track DEX volume for analytics charts

### Performance Considerations
1. **Caching**: Use existing data fetching system with caching
2. **Pagination**: All list endpoints should support pagination
3. **Filtering**: Support date/year/month filtering for time-based queries
4. **Rate Limiting**: Already implemented in backend

### Backward Compatibility
1. Keep existing endpoints working
2. New endpoints should follow same patterns
3. Use same response format conventions

---

## Summary

### Current Status
- ✅ Dashboard: Partially integrated (main stats work, liquidity pools need data)
- ❌ Harvesting: Not integrated (needs new endpoint)
- ❌ Distribution: Partially integrated (can use historical rewards but needs enhancement)
- ❌ Treasury: Not integrated (needs new endpoint and transaction tracking)
- ❌ System Status: Not integrated (needs new endpoint)
- ❌ Analytics: Not integrated (needs new endpoint and data tracking)

### Next Steps
1. Start with Harvesting endpoint (highest priority, data already available)
2. Enhance Distribution endpoint (data mostly available)
3. Implement Treasury endpoint (needs transaction tracking)
4. Add System Status endpoint (status data available)
5. Create Analytics endpoint (needs data aggregation)

---

**End of Analysis**

