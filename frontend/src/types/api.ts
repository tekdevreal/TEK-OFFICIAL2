// API Response Types

export interface Holder {
  pubkey: string;
  balance: string;
  usdValue: number;
  eligibilityStatus: 'eligible' | 'excluded' | 'blacklisted';
  lastReward: string | null;
  retryCount: number;
}

export interface HoldersResponse {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  holders: Holder[];
}

export interface RewardStatistics {
  totalHolders: number;
  eligibleHolders: number;
  excludedHolders: number;
  blacklistedHolders: number;
  pendingPayouts: number;
  totalSOLDistributed: number;
}

export interface TaxStatistics {
  totalTaxCollected: string;
  totalNukeHarvested: string;
  totalNukeSold: string;
  totalRewardAmount: string;
  totalTreasuryAmount: string;
  totalSolDistributed: string;
  totalSolToTreasury: string;
  lastTaxDistribution: string | null;
  lastSwapTx: string | null;
  lastDistributionTx: string | null;
  distributionCount: number;
}

export interface RewardsResponse {
  lastRun: string | null;
  nextRun: string | null;
  isRunning: boolean;
  statistics: RewardStatistics;
  tokenPrice?: {
    sol: number | null;
    usd: number | null;
    source?: string | null;
  } | null;
  dex?: {
    name: string;
    price: number | null;
    source: string | null;
    updatedAt: string | null;
  } | null;
  tax?: TaxStatistics;
  filtered: {
    pubkey: string;
    eligible: boolean;
    pendingPayouts: number;
    totalSOLForHolder: number;
  } | null;
}

export interface Payout {
  pubkey: string;
  rewardSOL: number;
  queuedAt: string;
  retryCount: number;
  status: 'pending' | 'failed';
  lastReward: string | null;
}

export interface PayoutsResponse {
  total: number;
  limit: number;
  payouts: Payout[];
  hasMore: boolean;
  summary: {
    pending: number;
    failed: number;
    totalSOL: number;
  };
}

export interface ApiError {
  error: string;
}

// Historical Reward Cycle
export interface RewardCycle {
  id: string;
  timestamp: string;
  totalSOLDistributed: number;
  eligibleHoldersCount: number;
  excludedHoldersCount: number;
  blacklistedHoldersCount: number;
  totalHoldersCount: number;
  tokenPriceUSD: number;
  rewardDetails?: Array<{
    pubkey: string;
    rewardSOL: number;
    eligibilityStatus: 'eligible' | 'excluded' | 'blacklisted';
    retryCount: number;
  }>;
}

export interface RewardCyclesResponse {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  cycles: RewardCycle[];
}

// Historical Payout
export interface HistoricalPayout {
  id: string;
  timestamp: string;
  pubkey: string;
  rewardSOL: number;
  status: 'pending' | 'failed' | 'success';
  retryCount: number;
  queuedAt: string;
  executedAt: string | null;
  transactionSignature: string | null;
}

export interface HistoricalPayoutsResponse {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  payouts: HistoricalPayout[];
}

// Export Response
export interface ExportResponse {
  format: string;
  count: number;
  data: Array<Record<string, string | number>>;
  metadata: {
    exportedAt: string;
    dateRange: {
      start: string;
      end: string;
    };
    filters?: {
      pubkey?: string;
      status?: string;
    };
  };
}

// Liquidity Pool
export interface LiquidityPool {
  pair: string;
  liquidityUSD: number;
  volume24hUSD: number;
}

export interface LiquidityPoolsResponse {
  pools: LiquidityPool[];
}

export interface LiquiditySummaryResponse {
  totalLiquidityUSD: number;
  volume24hUSD: number;
  activePools: number;
  treasuryPools: number;
}

export interface TreasuryBalanceResponse {
  address: string;
  balanceSOL: number;
  balanceLamports: string;
}

export interface SolPriceResponse {
  price: number; // USD price
  source: 'jupiter' | 'fallback';
  updatedAt: string;
}

// Cycle/Epoch Types
export type CycleState = 'DISTRIBUTED' | 'ROLLED_OVER' | 'FAILED';

export interface CycleResult {
  epoch: string; // ISO date string (YYYY-MM-DD)
  cycleNumber: number; // 1-288
  state: CycleState;
  timestamp: number; // Unix timestamp in milliseconds
  error?: string;
  taxResult?: {
    harvested: string; // TEK amount harvested (in raw token units)
    solToHolders: string;
    solToTreasury: string;
    distributedCount: number;
    swapSignature?: string;
  };
}

export interface EpochState {
  epoch: string;
  cycles: CycleResult[];
  createdAt: number;
  updatedAt: number;
}

export interface CurrentCycleInfo {
  epoch: string;
  epochNumber: number; // Sequential epoch counter
  cycleNumber: number;
  nextCycleIn: number; // Milliseconds until next cycle
  nextCycleInSeconds: number;
  cyclesPerEpoch: number;
}

export interface EpochCycleResponse {
  epoch: string;
  statistics: {
    epoch: string;
    totalCycles: number;
    distributed: number;
    rolledOver: number;
    failed: number;
    cycles: CycleResult[];
  };
  cycles: CycleResult[];
  createdAt: number | null;
  updatedAt: number | null;
}

export interface EpochsResponse {
  epochs: Array<{
    epoch: string;
    totalCycles: number;
    distributed: number;
    rolledOver: number;
    failed: number;
    cycles: CycleResult[];
    createdAt: number;
    updatedAt: number;
  }>;
  total: number;
  limit: number;
}

