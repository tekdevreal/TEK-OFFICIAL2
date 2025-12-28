/**
 * API-specific hooks using the new data fetching system
 */

import { useQuery } from './useDataFetching';
import {
  fetchRewards,
  fetchHolders,
  fetchPayouts,
  fetchHistoricalRewards,
  fetchHistoricalPayouts,
  fetchDexVolume24h,
  fetchLiquidityPools,
  fetchLiquiditySummary,
  fetchTreasuryBalance,
} from '../services/api';
import type {
  RewardsResponse,
  HoldersResponse,
  PayoutsResponse,
  RewardCyclesResponse,
  HistoricalPayoutsResponse,
  LiquidityPoolsResponse,
  LiquiditySummaryResponse,
  TreasuryBalanceResponse,
} from '../types/api';

/**
 * Hook for fetching rewards data
 */
export function useRewards(pubkey?: string, options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery<RewardsResponse>(
    ['rewards', pubkey].filter(Boolean).join(':'),
    () => fetchRewards(pubkey),
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      staleTime: 2.5 * 60 * 1000, // 2.5 minutes
      refetchInterval: options?.refetchInterval ?? 5 * 60 * 1000, // 5 minutes
      enabled: options?.enabled !== false,
    }
  );
}

/**
 * Hook for fetching holders data
 */
export function useHolders(
  params?: { eligibleOnly?: boolean; limit?: number; offset?: number },
  options?: { enabled?: boolean; refetchInterval?: number }
) {
  const key = ['holders', JSON.stringify(params || {})].join(':');
  return useQuery<HoldersResponse>(
    key,
    () => fetchHolders(params),
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      staleTime: 2.5 * 60 * 1000, // 2.5 minutes
      refetchInterval: options?.refetchInterval ?? 5 * 60 * 1000, // 5 minutes
      enabled: options?.enabled !== false,
    }
  );
}

/**
 * Hook for fetching payouts data
 */
export function usePayouts(
  params?: { pubkey?: string; status?: 'pending' | 'failed'; limit?: number },
  options?: { enabled?: boolean; refetchInterval?: number }
) {
  const key = ['payouts', JSON.stringify(params || {})].join(':');
  return useQuery<PayoutsResponse>(
    key,
    () => fetchPayouts(params),
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      staleTime: 2.5 * 60 * 1000, // 2.5 minutes
      refetchInterval: options?.refetchInterval ?? 5 * 60 * 1000, // 5 minutes
      enabled: options?.enabled !== false,
    }
  );
}

/**
 * Hook for fetching historical rewards
 */
export function useHistoricalRewards(
  params?: { startDate?: string; endDate?: string; limit?: number; offset?: number },
  options?: { enabled?: boolean }
) {
  const key = ['historical-rewards', JSON.stringify(params || {})].join(':');
  return useQuery<RewardCyclesResponse>(
    key,
    () => fetchHistoricalRewards(params),
    {
      ttl: 10 * 60 * 1000, // 10 minutes (historical data changes less frequently)
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: options?.enabled !== false,
    }
  );
}

/**
 * Hook for fetching historical payouts
 */
export function useHistoricalPayouts(
  params?: {
    startDate?: string;
    endDate?: string;
    pubkey?: string;
    status?: 'pending' | 'failed' | 'success';
    limit?: number;
    offset?: number;
  },
  options?: { enabled?: boolean }
) {
  const key = ['historical-payouts', JSON.stringify(params || {})].join(':');
  return useQuery<HistoricalPayoutsResponse>(
    key,
    () => fetchHistoricalPayouts(params),
    {
      ttl: 10 * 60 * 1000, // 10 minutes
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: options?.enabled !== false,
    }
  );
}

/**
 * Hook for fetching DEX volume
 */
export function useDexVolume24h(tokenAddress: string, options?: { enabled?: boolean }) {
  return useQuery<number | null>(
    ['dex-volume-24h', tokenAddress].join(':'),
    () => fetchDexVolume24h(tokenAddress),
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      staleTime: 2.5 * 60 * 1000, // 2.5 minutes
      enabled: options?.enabled !== false && !!tokenAddress,
    }
  );
}

/**
 * Hook for fetching liquidity pools
 */
export function useLiquidityPools(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery<LiquidityPoolsResponse>(
    'liquidity-pools',
    () => fetchLiquidityPools(),
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      staleTime: 2.5 * 60 * 1000, // 2.5 minutes
      refetchInterval: options?.refetchInterval ?? 5 * 60 * 1000, // 5 minutes
      enabled: options?.enabled !== false,
    }
  );
}

/**
 * Hook for fetching liquidity summary
 */
export function useLiquiditySummary(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery<LiquiditySummaryResponse>(
    'liquidity-summary',
    () => fetchLiquiditySummary(),
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      staleTime: 2.5 * 60 * 1000, // 2.5 minutes
      refetchInterval: options?.refetchInterval ?? 5 * 60 * 1000, // 5 minutes
      enabled: options?.enabled !== false,
    }
  );
}

/**
 * Hook for fetching treasury balance
 */
export function useTreasuryBalance(address?: string, options?: { enabled?: boolean; refetchInterval?: number }) {
  const key = ['treasury-balance', address].filter(Boolean).join(':');
  return useQuery<TreasuryBalanceResponse>(
    key,
    () => fetchTreasuryBalance(address),
    {
      ttl: 2 * 60 * 1000, // 2 minutes (balance changes more frequently)
      staleTime: 1 * 60 * 1000, // 1 minute
      refetchInterval: options?.refetchInterval ?? 2 * 60 * 1000, // 2 minutes
      enabled: options?.enabled !== false,
    }
  );
}

