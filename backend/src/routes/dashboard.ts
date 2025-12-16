import { Router, Request, Response } from 'express';
import {
  getAllHoldersWithStatus,
  getEligibleHolders,
  getPendingPayouts,
  getLastReward,
} from '../services/rewardService';
import { getSchedulerStatus } from '../scheduler/rewardScheduler';
import { getTokenHolders } from '../services/solanaService';
// Temporarily removed price service imports for debugging
// import { getNUKEPriceSOL, getNUKEPriceUSD, getPriceSource, getPriceDiagnostics } from '../services/priceService';
import { getRaydiumData } from '../services/raydiumService';
import { isBlacklisted } from '../config/blacklist';
import { REWARD_CONFIG } from '../config/constants';
import { logger } from '../utils/logger';

const router = Router();

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

    logger.info('Dashboard API: GET /dashboard/holders', {
      eligibleOnly,
      limit,
      offset,
      timestamp: new Date().toISOString(),
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
    logger.info('Dashboard API: GET /dashboard/holders completed', {
      duration: `${duration}ms`,
      total,
      returned: paginatedHolders.length,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching holders for dashboard', {
      error: error instanceof Error ? error.message : String(error),
      query: req.query,
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
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

    logger.info('Dashboard API: GET /dashboard/rewards', {
      filterPubkey,
      timestamp: new Date().toISOString(),
    });

    // Get scheduler status
    const schedulerStatus = getSchedulerStatus();

    // Get all holders and eligible holders
    const allHolders = await getTokenHolders();
    const eligibleHolders = await getEligibleHolders().catch(() => []);
    
    // Temporarily removed token price fetching for debugging
    // const tokenPriceSOL = await getNUKEPriceSOL().catch(() => ({ price: null, source: null }));

    // Get pending payouts
    const pendingPayouts = getPendingPayouts();
    const totalSOLDistributed = pendingPayouts
      .filter(p => !filterPubkey || p.pubkey === filterPubkey)
      .reduce((sum, p) => sum + (p.rewardSOL || 0), 0);

    // Calculate statistics
    const blacklistedCount = allHolders.filter(h => isBlacklisted(h.owner)).length;
    const excludedCount = allHolders.length - eligibleHolders.length - blacklistedCount;

    // Filter by pubkey if provided
    let filteredEligible = eligibleHolders;
    let filteredPending = pendingPayouts;
    if (filterPubkey) {
      filteredEligible = eligibleHolders.filter(h => h.pubkey === filterPubkey);
      filteredPending = pendingPayouts.filter(p => p.pubkey === filterPubkey);
    }

    // Temporarily removed Raydium data fetching for debugging
    // const raydiumData = await getRaydiumData().catch(() => null);

    // Get tax statistics
    const { TaxService } = await import('../services/taxService');
    const taxStats = TaxService.getTaxStatistics();

    const response = {
      lastRun: schedulerStatus.lastRun ? new Date(schedulerStatus.lastRun).toISOString() : null,
      nextRun: schedulerStatus.nextRun ? new Date(schedulerStatus.nextRun).toISOString() : null,
      isRunning: schedulerStatus.isRunning,
      statistics: {
        totalHolders: allHolders.length,
        eligibleHolders: eligibleHolders.length,
        excludedHolders: excludedCount,
        blacklistedHolders: blacklistedCount,
        pendingPayouts: pendingPayouts.length,
        totalSOLDistributed: parseFloat((totalSOLDistributed || 0).toFixed(6)),
      },
      // Temporarily removed tokenPrice for debugging
      // tokenPrice: {
      //   sol: tokenPriceSOL.price !== null && tokenPriceSOL.price > 0 ? parseFloat(tokenPriceSOL.price.toFixed(8)) : null,
      //   usd: null,
      //   source: tokenPriceSOL.source || null,
      // },
      // Temporarily removed dex data for debugging
      // dex: raydiumData && raydiumData.source === 'raydium' ? {
      //   name: 'raydium',
      //   price: raydiumData.price ? parseFloat(raydiumData.price.toFixed(8)) : null,
      //   source: 'raydium',
      //   updatedAt: raydiumData.updatedAt,
      // } : null,
      tax: {
        totalTaxCollected: taxStats.totalTaxCollected,
        totalRewardAmount: taxStats.totalRewardAmount,
        totalTreasuryAmount: taxStats.totalTreasuryAmount,
        lastTaxDistribution: taxStats.lastTaxDistribution ? new Date(taxStats.lastTaxDistribution).toISOString() : null,
        distributionCount: taxStats.distributionCount,
      },
      filtered: filterPubkey ? {
        pubkey: filterPubkey,
        eligible: filteredEligible.length > 0,
        pendingPayouts: filteredPending.length,
        totalSOLForHolder: parseFloat(
          filteredPending.reduce((sum, p) => sum + (p.rewardSOL || 0), 0).toFixed(6)
        ),
      } : null,
    };

    const duration = Date.now() - startTime;
    logger.info('Dashboard API: GET /dashboard/rewards completed', {
      duration: `${duration}ms`,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching rewards summary for dashboard', {
      error: error instanceof Error ? error.message : String(error),
      query: req.query,
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      lastRun: null,
      nextRun: null,
              statistics: {
                totalHolders: 0,
                eligibleHolders: 0,
                excludedHolders: 0,
                blacklistedHolders: 0,
                pendingPayouts: 0,
                totalSOLDistributed: 0,
              },
              // Temporarily removed tokenPrice for debugging
              // tokenPrice: {
              //   sol: null,
              //   usd: null,
              //   source: null,
              // },
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

    logger.info('Dashboard API: GET /dashboard/payouts', {
      filterPubkey,
      filterStatus,
      limit,
      timestamp: new Date().toISOString(),
    });

    // Get pending payouts
    let payouts = getPendingPayouts();

    // Enrich payouts with status
    // Note: Items in pendingPayouts are either pending or failed
    // Successful payouts are removed from pendingPayouts after execution
    const enrichedPayouts = payouts.map(payout => {
      const lastReward = getLastReward(payout.pubkey);
      const retryCount = payout.retryCount;
      
      // Determine status:
      // - failed: retryCount >= MAX_RETRIES (max retries exceeded)
      // - pending: retryCount < MAX_RETRIES (still being retried)
      let status: 'pending' | 'success' | 'failed';
      if (retryCount >= REWARD_CONFIG.MAX_RETRIES) {
        status = 'failed';
      } else {
        status = 'pending';
      }

      return {
        pubkey: payout.pubkey,
        rewardSOL: parseFloat(payout.rewardSOL.toFixed(6)),
        queuedAt: new Date(payout.queuedAt).toISOString(),
        retryCount: payout.retryCount,
        status,
        lastReward: lastReward ? new Date(lastReward).toISOString() : null,
      };
    });

    // Apply filters
    let filteredPayouts = enrichedPayouts;
    if (filterPubkey) {
      filteredPayouts = filteredPayouts.filter(p => p.pubkey === filterPubkey);
    }
    if (filterStatus) {
      filteredPayouts = filteredPayouts.filter(p => p.status === filterStatus);
    }

    // Sort by queuedAt (newest first)
    filteredPayouts.sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime());

    // Apply limit
    const limitedPayouts = filteredPayouts.slice(0, limit);

    const response = {
      total: filteredPayouts.length,
      limit,
      payouts: limitedPayouts,
      summary: {
        pending: filteredPayouts.filter(p => p.status === 'pending').length,
        failed: filteredPayouts.filter(p => p.status === 'failed').length,
        totalSOL: parseFloat(
          filteredPayouts.reduce((sum, p) => sum + p.rewardSOL, 0).toFixed(6)
        ),
      },
    };

    const duration = Date.now() - startTime;
    logger.info('Dashboard API: GET /dashboard/payouts completed', {
      duration: `${duration}ms`,
      total: filteredPayouts.length,
      returned: limitedPayouts.length,
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
    
    // Get pending payouts
    const pendingPayouts = getPendingPayouts();
    
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

