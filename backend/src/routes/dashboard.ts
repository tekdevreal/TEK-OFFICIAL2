import { Router, Request, Response } from 'express';
import {
  getAllHoldersWithStatus,
  getEligibleHolders,
  getLastReward,
} from '../services/rewardService';
import { getSchedulerStatus } from '../scheduler/rewardScheduler';
import { getTokenHolders } from '../services/solanaService';
import { getNUKEPriceSOL, getNUKEPriceUSD, getPriceDiagnostics } from '../services/priceService';
import { getRaydiumData } from '../services/raydiumService';
import { isBlacklisted } from '../config/blacklist';
import { REWARD_CONFIG } from '../config/constants';
import { logger } from '../utils/logger';
import { rateLimitLogger } from '../utils/rateLimitLogger';

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

    // Get all holders and eligible holders (with graceful error handling and deduplication)
    let allHolders: Array<{ address: string; owner: string; amount: string; decimals: number }> = [];
    try {
      // Use deduplication to prevent concurrent requests
      allHolders = await getDeduplicatedRequest('tokenHolders', () => getTokenHolders());
    } catch (error) {
      // If we get a rate limit error, try to use cached data from rewardService
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests') || errorMessage.includes('max usage reached')) {
        rateLimitLogger.logRateLimit('Rate limit error in dashboard/rewards, using fallback data', {
          query: req.query,
        });
        rateLimitLogger.recordRateLimitError();
        // Return empty array - the response will still work with tax stats
        allHolders = [];
      } else {
        throw error;
      }
    }
    
    const eligibleHolders = await getDeduplicatedRequest('eligibleHolders', () => getEligibleHolders()).catch(() => []);
    
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

    // Calculate statistics
    const blacklistedCount = allHolders.filter(h => isBlacklisted(h.owner)).length;
    const excludedCount = allHolders.length - eligibleHolders.length - blacklistedCount;

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
        totalHolders: allHolders.length,
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
        totalTaxCollected: taxStats.totalTaxCollected, // NUKE harvested
        totalNukeHarvested: taxStats.totalNukeHarvested,
        totalNukeSold: taxStats.totalNukeSold,
        totalRewardAmount: taxStats.totalRewardAmount, // SOL distributed to holders
        totalTreasuryAmount: taxStats.totalTreasuryAmount, // SOL sent to treasury
        totalSolDistributed: taxStats.totalSolDistributed,
        totalSolToTreasury: taxStats.totalSolToTreasury,
        lastTaxDistribution: taxStats.lastTaxDistribution ? new Date(taxStats.lastTaxDistribution).toISOString() : null,
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
 * Returns Raydium DEX analytics for NUKE token
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
      price: raydiumData.price ? parseFloat(raydiumData.price.toFixed(8)) : null, // SOL per NUKE
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

    // Get token holders
    const allHolders = await getTokenHolders();
    
    // Get scheduler status
    const schedulerStatus = getSchedulerStatus();
    
    // Payouts are now immediate via tax distribution (no pending queue)
    const pendingPayouts: any[] = [];
    
    // Get eligible holders
    const eligibleHolders = await getEligibleHolders().catch(() => []);
    
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
          sample: allHolders.slice(0, 5).map(h => ({
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

export default router;

