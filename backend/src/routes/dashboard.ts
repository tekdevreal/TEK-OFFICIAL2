import { Router, Request, Response } from 'express';
import type { PublicKey } from '@solana/web3.js';
import {
  getAllHoldersWithStatus,
  getLastReward,
} from '../services/rewardService';
import { getSchedulerStatus } from '../scheduler/rewardScheduler';
import { getNUKEPriceSOL, getNUKEPriceUSD, getPriceDiagnostics } from '../services/priceService';
import { getRaydiumData, getSOLPriceUSD } from '../services/raydiumService';
import { isBlacklisted } from '../config/blacklist';
import { REWARD_CONFIG } from '../config/constants';
import { logger } from '../utils/logger';
import { rateLimitLogger } from '../utils/rateLimitLogger';
import { TaxService } from '../services/taxService';
import { getHistoricalRewardCycles } from '../services/rewardHistoryService';
import {
  getCurrentEpochInfo,
  getEpochState,
  getAllEpochStates,
  getEpochStatistics,
} from '../services/cycleService';

const router = Router();

// Request deduplication: Track pending requests to prevent concurrent duplicate calls
const pendingRequests = new Map<string, Promise<any>>();
const REQUEST_COOLDOWN = 5 * 1000; // 5 seconds minimum between same endpoint calls
const lastRequestTime = new Map<string, number>();

/**
 * Get or create a deduplicated request
 */
async function getDeduplicatedRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const lastTime = lastRequestTime.get(key) || 0;
  
  // If request was made recently, return cached promise if available
  if (now - lastTime < REQUEST_COOLDOWN && pendingRequests.has(key)) {
    logger.debug('Request deduplication: reusing pending request', { key });
    return pendingRequests.get(key)!;
  }

  // Create new request
  const requestPromise = fn().finally(() => {
    pendingRequests.delete(key);
    lastRequestTime.set(key, Date.now());
  });

  pendingRequests.set(key, requestPromise);
  return requestPromise;
}

/**
 * GET /dashboard/holders
 * Returns list of all holders with eligibility status and reward info
 * Query params:
 *   - eligibleOnly: boolean (default: false)
 *   - limit: number (default: 1000, max: 1000)
 *   - offset: number (default: 0) - for pagination
 */
router.get('/holders', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const eligibleOnly = req.query.eligibleOnly === 'true';
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 1000, 1000);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    logger.debug('Dashboard API: GET /dashboard/holders', {
      eligibleOnly,
      limit,
      offset,
    });

    // Get all holders with status
    let holders = await getAllHoldersWithStatus();

    // Filter by eligibility if requested
    if (eligibleOnly) {
      holders = holders.filter(h => h.eligibilityStatus === 'eligible');
    }

    // Sort by USD value (descending)
    holders.sort((a, b) => b.usdValue - a.usdValue);

    // Paginate
    const total = holders.length;
    const paginatedHolders = holders.slice(offset, offset + limit);

    // Format response
    const response = {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      holders: paginatedHolders.map(h => {
        // Defensive check: ensure usdValue is always a number
        const usdValue = (h.usdValue !== null && h.usdValue !== undefined && !isNaN(h.usdValue))
          ? parseFloat(Number(h.usdValue).toFixed(2))
          : 0;
        
        return {
          pubkey: h.pubkey || '',
          balance: h.balance || '0',
          usdValue,
          eligibilityStatus: h.eligibilityStatus || 'excluded',
          lastReward: h.lastReward ? new Date(h.lastReward).toISOString() : null,
          retryCount: h.retryCount || 0,
        };
      }),
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/holders completed', {
      duration: `${duration}ms`,
      total,
    });

    res.status(200).json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRateLimit = errorMessage.includes('429') || errorMessage.includes('Too Many Requests');
    
    // Don't log rate limit errors as errors, just warnings
    if (isRateLimit) {
      logger.warn('Rate limit error in dashboard/holders', {
        query: req.query,
      });
    } else {
      logger.error('Error fetching holders for dashboard', {
        error: errorMessage,
        query: req.query,
      });
    }
    
    res.status(500).json({
      error: errorMessage,
      holders: [],
      total: 0,
    });
  }
});

/**
 * GET /dashboard/rewards
 * Returns last reward cycle summary
 * Query params:
 *   - pubkey: string (optional) - filter by specific holder
 */
router.get('/rewards', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const filterPubkey = req.query.pubkey as string | undefined;

    logger.debug('Dashboard API: GET /dashboard/rewards', {
      filterPubkey,
    });

    // Get scheduler status
    const schedulerStatus = getSchedulerStatus();

    // Get holders with status (this function has built-in caching and uses cached getTokenHolders)
    // This prevents redundant RPC calls - all holder data comes from one cached source
    let holdersWithStatus: Array<{
      pubkey: string;
      balance: string;
      usdValue: number;
      eligibilityStatus: 'eligible' | 'excluded' | 'blacklisted';
      lastReward: number | null;
      retryCount: number;
    }> = [];
    let totalHoldersFallback: number | null = null;

    try {
      // Use cached getAllHoldersWithStatus which internally uses cached getTokenHolders
      holdersWithStatus = await getAllHoldersWithStatus();
      totalHoldersFallback = holdersWithStatus.length;
    } catch (error) {
      // If we get a rate limit error, return null and let frontend handle it
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests') || errorMessage.includes('max usage reached')) {
        rateLimitLogger.logRateLimit('Rate limit error in dashboard/rewards, holders unavailable', {
          query: req.query,
        });
        rateLimitLogger.recordRateLimitError();
        // Keep empty array - will use fallback count which is null
      } else {
        throw error;
      }
    }

    // Extract eligible holders from holders with status (no additional fetch needed)
    const eligibleHolders = holdersWithStatus.filter(h => h.eligibilityStatus === 'eligible');
    
    // Fetch Raydium-based pricing with strong fallbacks
    const [tokenPriceSOLResult, tokenPriceUSDResult, raydiumData] = await Promise.all([
      getNUKEPriceSOL().catch(() => ({ price: null as number | null, source: null as string | null })),
      getNUKEPriceUSD().catch(() => null as number | null),
      getRaydiumData().catch(() => null),
    ]);

    const tokenPriceSOL =
      tokenPriceSOLResult && tokenPriceSOLResult.price !== null && tokenPriceSOLResult.price > 0
        ? parseFloat(tokenPriceSOLResult.price.toFixed(8))
        : null;

    const tokenPriceUSD =
      tokenPriceUSDResult !== null && tokenPriceUSDResult > 0
        ? parseFloat(tokenPriceUSDResult.toFixed(6))
        : null;

    // Get tax statistics (SOL distributions come from tax processing, not pending payouts)
    const { TaxService } = await import('../services/taxService');
    const taxStats = TaxService.getTaxStatistics();
    const totalSOLDistributed = parseFloat(taxStats.totalSolDistributed || '0') / 1e9; // Convert lamports to SOL

    // Calculate statistics from holders with status
    const actualHolderCount = holdersWithStatus.length;
    const blacklistedCount = holdersWithStatus.filter(h => h.eligibilityStatus === 'blacklisted').length;
    const excludedCount = holdersWithStatus.filter(h => h.eligibilityStatus === 'excluded').length;

    // Filter by pubkey if provided (for eligible holders only - no pending payouts)
    let filteredEligible = eligibleHolders;
    if (filterPubkey) {
      filteredEligible = eligibleHolders.filter(h => h.pubkey === filterPubkey);
    }

    const response = {
      lastRun: schedulerStatus.lastRun ? new Date(schedulerStatus.lastRun).toISOString() : null,
      nextRun: schedulerStatus.nextRun ? new Date(schedulerStatus.nextRun).toISOString() : null,
      isRunning: schedulerStatus.isRunning,
      statistics: {
        totalHolders: actualHolderCount,
        eligibleHolders: eligibleHolders.length,
        excludedHolders: excludedCount,
        blacklistedHolders: blacklistedCount,
        pendingPayouts: 0, // No longer used - distributions happen immediately
        totalSOLDistributed: parseFloat((totalSOLDistributed || 0).toFixed(6)),
      },
      tokenPrice: {
        sol: tokenPriceSOL,
        usd: tokenPriceUSD,
        source: tokenPriceSOLResult?.source || (raydiumData && raydiumData.source) || null,
      },
      dex:
        raydiumData && raydiumData.source === 'raydium'
          ? {
              name: 'raydium' as const,
              price: raydiumData.price ? parseFloat(raydiumData.price.toFixed(8)) : null,
              source: raydiumData.source || null,
              updatedAt: raydiumData.updatedAt || null,
            }
          : null,
      tax: {
        totalTaxCollected: taxStats.totalTaxCollected, // TEK harvested
        totalNukeHarvested: taxStats.totalNukeHarvested, // TEK harvested (field name kept for API compatibility)
        totalNukeSold: taxStats.totalNukeSold, // TEK sold (field name kept for API compatibility)
        totalRewardAmount: taxStats.totalRewardAmount, // SOL distributed to holders
        totalTreasuryAmount: taxStats.totalTreasuryAmount, // SOL sent to treasury
        totalSolDistributed: taxStats.totalSolDistributed,
        totalSolToTreasury: taxStats.totalSolToTreasury,
        lastTaxDistribution: taxStats.lastTaxDistribution ? new Date(taxStats.lastTaxDistribution).toISOString() : null,
        lastDistributionCycleNumber: taxStats.lastDistributionCycleNumber,
        lastDistributionEpoch: taxStats.lastDistributionEpoch,
        lastDistributionEpochNumber: taxStats.lastDistributionEpoch 
          ? (() => {
              const allEpochs = getAllEpochStates();
              const sortedOldestFirst = allEpochs.sort((a, b) => a.epoch.localeCompare(b.epoch));
              return sortedOldestFirst.findIndex(e => e.epoch === taxStats.lastDistributionEpoch) + 1;
            })() || null
          : null,
        lastDistributionSolToHolders: taxStats.lastDistributionSolToHolders,
        lastDistributionSolToTreasury: taxStats.lastDistributionSolToTreasury,
        lastSwapTx: taxStats.lastSwapTx,
        lastDistributionTx: taxStats.lastDistributionTx,
        distributionCount: taxStats.distributionCount,
      },
      filtered: filterPubkey ? {
        pubkey: filterPubkey,
        eligible: filteredEligible.length > 0,
        pendingPayouts: 0, // No longer used
        totalSOLForHolder: 0, // Historical data only - check tax distributions
      } : null,
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/rewards completed', {
      duration: `${duration}ms`,
    });

    res.status(200).json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRateLimit = errorMessage.includes('429') || errorMessage.includes('Too Many Requests');
    
    // Don't log rate limit errors as errors, just warnings
    if (isRateLimit) {
      logger.warn('Rate limit error in dashboard/rewards', {
        query: req.query,
      });
    } else {
      logger.error('Error fetching rewards summary for dashboard', {
        error: errorMessage,
        query: req.query,
      });
    }
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      lastRun: null,
      nextRun: null,
      isRunning: false,
      statistics: {
        totalHolders: 0,
        eligibleHolders: 0,
        excludedHolders: 0,
        blacklistedHolders: 0,
        pendingPayouts: 0,
        totalSOLDistributed: 0,
      },
      tokenPrice: {
        sol: null,
        usd: null,
        source: null,
      },
      dex: null,
      tax: null,
      filtered: null,
    });
  }
});

/**
 * GET /dashboard/payouts
 * Returns list of pending payouts with status
 * Query params:
 *   - pubkey: string (optional) - filter by specific holder
 *   - status: 'pending' | 'failed' (optional)
 *   - limit: number (default: 100, max: 500)
 */
router.get('/payouts', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const filterPubkey = req.query.pubkey as string | undefined;
    const filterStatus = req.query.status as 'pending' | 'failed' | undefined;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);

    logger.debug('Dashboard API: GET /dashboard/payouts', {
      filterPubkey,
      filterStatus,
      limit,
      timestamp: new Date().toISOString(),
    });

    // Get historical payouts from tax distributions (payouts are now immediate, no pending queue)
    const { TaxService } = await import('../services/taxService');
    const taxStats = TaxService.getTaxStatistics();
    
    // Payouts are now immediate via tax distribution, so return empty for now
    // Historical payouts can be retrieved from tax distributions if needed
    const payouts: Array<{
      pubkey: string;
      rewardSOL: number;
      queuedAt: string;
      retryCount: number;
      status: 'pending' | 'success' | 'failed';
      lastReward: string | null;
    }> = [];

    const response = {
      total: 0,
      limit,
      payouts: [],
      summary: {
        pending: 0,
        failed: 0,
        totalSOL: parseFloat(taxStats.totalSolDistributed || '0') / 1e9, // Convert lamports to SOL
      },
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/payouts completed', {
      duration: `${duration}ms`,
      total: response.total,
      returned: response.payouts.length,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching payouts for dashboard', {
      error: error instanceof Error ? error.message : String(error),
      query: req.query,
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      payouts: [],
      total: 0,
    });
  }
});

/**
 * GET /dashboard/raydium
 * Returns Raydium DEX analytics for TEK token
 */
router.get('/raydium', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();

    logger.info('Dashboard API: GET /dashboard/raydium', {
      timestamp: new Date().toISOString(),
    });

    const raydiumData = await getRaydiumData();

    const response = {
      dex: 'raydium',
      price: raydiumData.price ? parseFloat(raydiumData.price.toFixed(8)) : null, // SOL per TEK
      source: raydiumData.source,
      updatedAt: raydiumData.updatedAt,
    };

    const duration = Date.now() - startTime;
    logger.info('Dashboard API: GET /dashboard/raydium completed', {
      duration: `${duration}ms`,
      hasData: raydiumData.source === 'raydium',
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching Raydium data for dashboard', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      dex: 'raydium',
      price: null,
      source: null,
      updatedAt: new Date().toISOString(),
    });
  }
});

/**
 * GET /dashboard/diagnostics
 * Returns diagnostic information about the system
 */
router.get('/diagnostics', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    logger.info('Dashboard API: GET /dashboard/diagnostics', {
      timestamp: new Date().toISOString(),
    });

    // Get holders with status (uses cached data)
    const allHoldersWithStatus = await getAllHoldersWithStatus().catch(() => []);
    const allHolders = allHoldersWithStatus.map((h) => ({
      owner: h.pubkey,
      amount: h.balance,
      address: h.pubkey,
    }));
    
    // Get scheduler status
    const schedulerStatus = getSchedulerStatus();
    
    // Payouts are now immediate via tax distribution (no pending queue)
    const pendingPayouts: any[] = [];
    
    // Extract eligible holders from cached data (no additional fetch)
    const eligibleHolders = allHoldersWithStatus.filter((h) => h.eligibilityStatus === 'eligible');
    
    // Temporarily removed token price fetching for debugging
    // const tokenPriceSOL = await getNUKEPriceSOL().catch(() => ({ price: null, source: null }));
    // const raydiumData = await getRaydiumData().catch(() => null);

    const response = {
      timestamp: new Date().toISOString(),
      token: {
        mint: process.env.TOKEN_MINT || 'not set',
        holders: {
          total: allHolders.length,
          eligible: eligibleHolders.length,
          pendingPayouts: pendingPayouts.length,
          sample: allHolders.slice(0, 5).map((h) => ({
            owner: h.owner,
            balance: h.amount,
            address: h.address,
          })),
        },
      },
      scheduler: {
        isRunning: schedulerStatus.isRunning,
        lastRun: schedulerStatus.lastRun ? new Date(schedulerStatus.lastRun).toISOString() : null,
        nextRun: schedulerStatus.nextRun ? new Date(schedulerStatus.nextRun).toISOString() : null,
      },
      // Temporarily removed price for debugging
      // price: {
      //   sol: tokenPriceSOL.price !== null ? parseFloat(tokenPriceSOL.price.toFixed(8)) : null,
      //   usd: null,
      //   source: tokenPriceSOL.source || null,
      //   raydium: raydiumData && raydiumData.source === 'raydium' ? {
      //     price: raydiumData.price ? parseFloat(raydiumData.price.toFixed(8)) : null,
      //     source: raydiumData.source,
      //   } : null,
      // },
      environment: {
        network: process.env.SOLANA_NETWORK || 'not set',
        raydiumPoolId: process.env.RAYDIUM_POOL_ID || 'not set',
        minHoldingUSD: REWARD_CONFIG.MIN_HOLDING_USD,
        minSOLPayout: REWARD_CONFIG.MIN_SOL_PAYOUT,
      },
    };

    const duration = Date.now() - startTime;
    logger.info('Dashboard API: GET /dashboard/diagnostics completed', {
      duration: `${duration}ms`,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching diagnostics', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /dashboard/token-stats
 * Returns aggregated token statistics for the main page
 */
router.get('/token-stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    logger.debug('Dashboard API: GET /dashboard/token-stats');

    // Get tax statistics
    const taxStats = TaxService.getTaxStatistics();
    const totalDistributionsSOL = parseFloat(taxStats.totalSolDistributed || '0') / 1e9; // Convert lamports to SOL

    // Get last distribution timestamp
    let lastDistribution: string | null = null;
    if (taxStats.lastTaxDistribution) {
      lastDistribution = new Date(taxStats.lastTaxDistribution).toISOString();
    }

    // Get total holders from cached getAllHoldersWithStatus
    let totalHolders = 0;
    try {
      const holdersWithStatus = await getAllHoldersWithStatus();
      totalHolders = holdersWithStatus.length;
    } catch (error) {
      logger.warn('Could not fetch total holders for token-stats', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Get DEX volume 24h (placeholder for now - can be enhanced with real data)
    // TODO: Implement real DEX volume tracking
    const dexVolume24h = 0; // Placeholder

    const response = {
      totalDistributionsSOL: parseFloat(totalDistributionsSOL.toFixed(6)),
      lastDistribution,
      totalHolders,
      dexVolume24h,
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/token-stats completed', {
      duration: `${duration}ms`,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching token stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      totalDistributionsSOL: 0,
      lastDistribution: null,
      totalHolders: 0,
      dexVolume24h: 0,
    });
  }
});

/**
 * GET /dashboard/processing
 * Returns current processing state for the main page
 */
router.get('/processing', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    logger.debug('Dashboard API: GET /dashboard/processing');

    // Get scheduler status
    const schedulerStatus = getSchedulerStatus();
    const nextDistribution = schedulerStatus.nextRun ? new Date(schedulerStatus.nextRun).toISOString() : null;

    // Get tax statistics for current cycle
    const taxStats = TaxService.getTaxStatistics();
    const tekCollected = parseFloat(taxStats.totalNukeHarvested || '0');

    // Estimate SOL from TEK collected (rough estimate - can be enhanced)
    // TODO: Use actual price data for more accurate estimation
    const estimatedSOL = tekCollected > 0 ? (tekCollected / 13333).toFixed(6) : '0.000000'; // Rough estimate

    // Determine status
    let status: 'Idle' | 'Processing' | 'Pending' | 'Error' = 'Idle';
    if (schedulerStatus.isRunning) {
      status = 'Processing';
    } else if (schedulerStatus.nextRun && schedulerStatus.nextRun > Date.now()) {
      status = 'Pending';
    }

    const response = {
      nextDistribution,
      nukeCollected: parseFloat(nukeCollected.toFixed(2)),
      estimatedSOL: parseFloat(estimatedSOL),
      status,
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/processing completed', {
      duration: `${duration}ms`,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching processing stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      nextDistribution: null,
      nukeCollected: 0,
      estimatedSOL: 0,
      status: 'Error',
    });
  }
});

/**
 * GET /dashboard/distributions/recent
 * Returns recent distribution epochs for the main page
 */
router.get('/distributions/recent', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50); // Max 50 recent distributions
    logger.debug('Dashboard API: GET /dashboard/distributions/recent', { limit });

    // Get recent reward cycles
    const { cycles } = getHistoricalRewardCycles({
      limit,
      offset: 0,
    });

    // Get tax statistics for harvested TEK data
    const taxStats = TaxService.getTaxStatistics();

    // Transform cycles to distribution format
    const distributions = cycles.map((cycle, index) => {
      // Determine status based on distribution success
      const status: 'Complete' | 'Failed' = cycle.totalSOLDistributed > 0 ? 'Complete' : 'Failed';
      
      // Calculate epoch number (most recent = highest number)
      // For now, use index + 1, but ideally this should come from cycle data
      const epoch = cycles.length - index;

      // Get harvested TEK - use actual tax statistics if available
      // Calculate from total tax collected for this cycle
      const harvestedTEK = taxStats.totalNukeHarvested 
        ? parseFloat(taxStats.totalNukeHarvested) / 1e6 // Convert from raw units to TEK (6 decimals)
        : (cycle.totalSOLDistributed > 0 
            ? Math.floor(cycle.totalSOLDistributed * 13333) // Rough estimate fallback
            : 0);

      return {
        epoch,
        status,
        harvestedNUKE: harvestedTEK, // Field name kept for API compatibility
        distributedSOL: parseFloat(cycle.totalSOLDistributed.toFixed(6)),
        timestamp: cycle.timestamp,
      };
    });

    const response = {
      distributions,
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/distributions/recent completed', {
      duration: `${duration}ms`,
      count: distributions.length,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching recent distributions', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      distributions: [],
    });
  }
});

/**
 * GET /dashboard/liquidity/summary
 * Returns liquidity pool summary statistics for the main page
 */
router.get('/liquidity/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    logger.debug('Dashboard API: GET /dashboard/liquidity/summary');

    const { fetchLiquidityPoolsData } = await import('../services/liquidityService');
    const { summary } = await fetchLiquidityPoolsData();

    const response = {
      totalLiquidityUSD: summary.totalLiquidityUSD,
      volume24hUSD: summary.volume24hUSD,
      activePools: summary.activePools,
      treasuryPools: summary.treasuryPools,
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/liquidity/summary completed', {
      duration: `${duration}ms`,
      summary,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching liquidity summary', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      totalLiquidityUSD: 0,
      volume24hUSD: 0,
      activePools: 0,
      treasuryPools: 0,
    });
  }
});

/**
 * GET /dashboard/treasury/balance
 * Returns treasury wallet balance in SOL using Helius RPC
 * Query params:
 *   - address: string (optional) - treasury wallet address (defaults to TREASURY_WALLET_ADDRESS env var)
 */
router.get('/treasury/balance', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const treasuryAddress = (req.query.address as string) || process.env.TREASURY_WALLET_ADDRESS || 'DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo';
    
    logger.info('Dashboard API: GET /dashboard/treasury/balance', {
      treasuryAddress,
      rpcUrl: process.env.SOLANA_RPC_URL ? 'configured' : 'not configured',
    });

    const { connection } = await import('../config/solana');
    const { PublicKey } = await import('@solana/web3.js');

    let treasuryPubkey: PublicKey;
    try {
      treasuryPubkey = new PublicKey(treasuryAddress);
      logger.debug('Treasury wallet address validated', {
        address: treasuryPubkey.toBase58(),
      });
    } catch (error) {
      logger.error('Invalid treasury wallet address', {
        address: treasuryAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(400).json({
        error: 'Invalid treasury wallet address',
        address: treasuryAddress,
        balanceSOL: null,
        balanceLamports: null,
      });
      return;
    }

    // Get treasury wallet balance from Helius RPC
    logger.debug('Fetching treasury balance from Solana RPC (Helius)', {
      address: treasuryPubkey.toBase58(),
    });
    
    const balanceLamports = await connection.getBalance(treasuryPubkey, 'confirmed');
    const balanceSOL = balanceLamports / 1e9;

    logger.info('Treasury balance fetched successfully', {
      address: treasuryAddress,
      balanceSOL: balanceSOL.toFixed(9),
      balanceLamports: balanceLamports.toString(),
    });

    const response = {
      address: treasuryAddress,
      balanceSOL: parseFloat(balanceSOL.toFixed(9)),
      balanceLamports: balanceLamports.toString(),
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/treasury/balance completed', {
      duration: `${duration}ms`,
      balanceSOL: response.balanceSOL,
    });

    res.status(200).json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRateLimit = errorMessage.includes('429') || errorMessage.includes('Too Many Requests') || errorMessage.includes('rate limit');
    
    logger.error('Error fetching treasury balance', {
      error: errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
      isRateLimit,
      treasuryAddress: (req.query.address as string) || process.env.TREASURY_WALLET_ADDRESS || 'DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo',
    });
    
    res.status(500).json({
      error: errorMessage,
      address: (req.query.address as string) || process.env.TREASURY_WALLET_ADDRESS || 'DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo',
      balanceSOL: null,
      balanceLamports: null,
    });
  }
});

/**
 * GET /dashboard/liquidity/pools
 * Returns individual liquidity pool data for the main page
 */
router.get('/liquidity/pools', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    logger.debug('Dashboard API: GET /dashboard/liquidity/pools');

    const { fetchLiquidityPoolsData } = await import('../services/liquidityService');
    const { pools } = await fetchLiquidityPoolsData();

    const response = {
      pools,
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/liquidity/pools completed', {
      duration: `${duration}ms`,
      count: pools.length,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching liquidity pools', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      pools: [],
    });
  }
});

/**
 * GET /dashboard/cycles/current
 * Returns current epoch and cycle information
 */
router.get('/cycles/current', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    logger.debug('Dashboard API: GET /dashboard/cycles/current');

    const epochInfo = getCurrentEpochInfo();
    
    // Calculate epoch number (count of all epochs in state)
    // getAllEpochStates() returns epochs sorted newest first, but we need to count from oldest
    const allEpochs = getAllEpochStates();
    const sortedOldestFirst = allEpochs.sort((a, b) => a.epoch.localeCompare(b.epoch));
    const epochNumber = sortedOldestFirst.findIndex(e => e.epoch === epochInfo.epoch) + 1;

    const response = {
      epoch: epochInfo.epoch, // Date string (YYYY-MM-DD)
      epochNumber: epochNumber > 0 ? epochNumber : 1, // Sequential epoch number
      cycleNumber: epochInfo.cycleNumber,
      nextCycleIn: epochInfo.nextCycleIn,
      nextCycleInSeconds: Math.floor(epochInfo.nextCycleIn / 1000),
      cyclesPerEpoch: 288,
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/cycles/current completed', {
      duration: `${duration}ms`,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching current cycle info', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /dashboard/cycles/epoch/:epoch
 * Returns cycle data for a specific epoch
 * Query params:
 *   - epoch: string (YYYY-MM-DD format, defaults to current epoch)
 */
router.get('/cycles/epoch/:epoch?', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const epoch = req.params.epoch || getCurrentEpochInfo().epoch;
    
    logger.debug('Dashboard API: GET /dashboard/cycles/epoch/:epoch', {
      epoch,
    });

    const epochState = getEpochState(epoch);
    const statistics = getEpochStatistics(epoch);

    const response = {
      epoch,
      statistics,
      cycles: epochState?.cycles || [],
      createdAt: epochState?.createdAt || null,
      updatedAt: epochState?.updatedAt || null,
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/cycles/epoch/:epoch completed', {
      duration: `${duration}ms`,
      cyclesCount: response.cycles.length,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching epoch cycle data', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      epoch: req.params.epoch || null,
    });
  }
});

/**
 * GET /dashboard/cycles/epochs
 * Returns all available epochs with summary statistics
 * Query params:
 *   - limit: number (default: 30, max: 100)
 */
router.get('/cycles/epochs', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 30, 100);
    
    logger.debug('Dashboard API: GET /dashboard/cycles/epochs', {
      limit,
    });

    const allEpochs = getAllEpochStates();
    const epochsWithStats = allEpochs.slice(0, limit).map(epochState => {
      const stats = getEpochStatistics(epochState.epoch);
      return {
        ...stats, // This already includes 'epoch'
        createdAt: epochState.createdAt,
        updatedAt: epochState.updatedAt,
      };
    });

    const response = {
      epochs: epochsWithStats,
      total: allEpochs.length,
      limit,
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/cycles/epochs completed', {
      duration: `${duration}ms`,
      count: epochsWithStats.length,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching epochs data', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      epochs: [],
    });
  }
});

/**
 * GET /dashboard/sol-price
 * Returns current SOL price in USD from Jupiter/CoinGecko
 */
router.get('/sol-price', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    logger.debug('Dashboard API: GET /dashboard/sol-price');

    const solPriceUSD = await getSOLPriceUSD();

    const response = {
      price: solPriceUSD,
      source: 'jupiter',
      updatedAt: new Date().toISOString(),
    };

    const duration = Date.now() - startTime;
    logger.debug('Dashboard API: GET /dashboard/sol-price completed', {
      duration: `${duration}ms`,
      price: solPriceUSD,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching SOL price', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      price: 100, // Fallback price
      source: 'fallback',
    });
  }
});

export default router;

