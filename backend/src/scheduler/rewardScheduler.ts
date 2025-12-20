import { REWARD_CONFIG } from '../config/constants';
import { logger } from '../utils/logger';
import {
  getLastRewardRun,
  setLastRewardRun,
  getAllHoldersWithStatus,
} from '../services/rewardService';
import { saveRewardCycle, type RewardCycle } from '../services/rewardHistoryService';
import { generateCombinedExcel } from '../services/rewardExportService';
import { getNUKEPriceUSD } from '../services/priceService';
import { isBlacklisted } from '../config/blacklist';
import { TaxService } from '../services/taxService';

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Process reward distribution for pending holders
 */
async function processRewards(): Promise<void> {
  if (isRunning) {
    logger.debug('Reward scheduler already running, skipping');
    return;
  }

  const startTime = Date.now();
  const lastRun = getLastRewardRun();
  const now = startTime;

  // Check if enough time has passed since last run
  if (lastRun !== null && (now - lastRun) < REWARD_CONFIG.MIN_REWARD_INTERVAL) {
    const timeUntilNext = REWARD_CONFIG.MIN_REWARD_INTERVAL - (now - lastRun);
    logger.debug('Skipping reward run - too soon since last run', {
      lastRun: new Date(lastRun).toISOString(),
      timeUntilNext: `${Math.ceil(timeUntilNext / 1000)}s`,
    });
    return;
  }

  isRunning = true;
  logger.info('Starting reward distribution run', {
    startTime: new Date(startTime).toISOString(),
  });

  try {
    // Process withheld tax from Token-2022 transfers
    // This: 1) Harvests NUKE taxes, 2) Swaps NUKE to SOL, 3) Distributes SOL to holders (75%) and treasury (25%)
    try {
      logger.info('Processing withheld tax from Token-2022 transfers');
      const taxResult = await TaxService.processWithheldTax();
      if (taxResult) {
        logger.info('Tax distribution completed', {
          nukeHarvested: taxResult.totalTax.toString(),
          nukeSold: taxResult.totalTax.toString(),
          solReceived: (taxResult.rewardAmount + taxResult.treasuryAmount).toString(),
          solToHolders: taxResult.rewardAmount.toString(),
          solToTreasury: taxResult.treasuryAmount.toString(),
          holdersPaid: taxResult.distributionResult?.distributedCount || 0,
          swapSignature: taxResult.swapSignature,
        });
      } else {
        logger.info('No withheld tax to process - this is normal if no trades have occurred or no tax was collected');
      }
    } catch (taxError) {
      logger.error('Error processing withheld tax', {
        error: taxError instanceof Error ? taxError.message : String(taxError),
        stack: taxError instanceof Error ? taxError.stack : undefined,
      });
      // Don't throw - allow scheduler to continue
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Get tax result for historical record (already processed above, but we need it for history)
    let taxResult: Awaited<ReturnType<typeof TaxService.processWithheldTax>> | null = null;
    try {
      // Re-fetch tax result if we need it (or store it from above)
      // For now, we'll get stats separately
    } catch {
      // Already logged above
    }

    // Get additional statistics for historical record
    let excludedHoldersCount = 0;
    let blacklistedHoldersCount = 0;
    let totalHoldersCount = 0;
    let eligibleHoldersCount = 0;
    let tokenPriceUSD = 0.01; // Fallback

    try {
      // Use cached getAllHoldersWithStatus to prevent redundant RPC calls
      // This internally uses cached getTokenHolders and calculates eligibility
      const holdersWithStatus = await getAllHoldersWithStatus().catch(() => []);
      totalHoldersCount = holdersWithStatus.length;
      
      // Count by eligibility status
      for (const holder of holdersWithStatus) {
        if (holder.eligibilityStatus === 'eligible') {
          eligibleHoldersCount++;
        } else if (holder.eligibilityStatus === 'blacklisted') {
          blacklistedHoldersCount++;
        } else {
          excludedHoldersCount++;
        }
      }

      // Get token price
      try {
        tokenPriceUSD = await getNUKEPriceUSD();
      } catch (priceError) {
        logger.debug('Failed to fetch token price for history, using fallback', {
          error: priceError instanceof Error ? priceError.message : String(priceError),
        });
      }
    } catch (error) {
      logger.debug('Error getting holder statistics for history', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Get tax stats for history and logging
    const taxStats = TaxService.getTaxStatistics();
    const lastDistribution = taxStats.lastTaxDistribution 
      ? new Date(taxStats.lastTaxDistribution).getTime()
      : null;
    
    // Calculate total SOL distributed (only if distribution happened in this cycle)
    let totalSolDistributed = 0;
    if (lastDistribution && (now - lastDistribution) < 60000) {
      totalSolDistributed = parseFloat(taxStats.totalSolDistributed || '0') / 1e9; // Convert lamports to SOL
    }

    // Save reward cycle to history
    try {
      const cycleId = new Date(now).toISOString();
      
      const cycle: RewardCycle = {
        id: cycleId,
        timestamp: cycleId,
        totalSOLDistributed: totalSolDistributed,
        eligibleHoldersCount: eligibleHoldersCount,
        excludedHoldersCount,
        blacklistedHoldersCount,
        totalHoldersCount,
        tokenPriceUSD,
        rewardDetails: [], // Will be populated from tax distribution result if available
      };

      saveRewardCycle(cycle);
      logger.info('Reward cycle saved to history', { cycleId });
    } catch (historyError) {
      logger.error('Failed to save reward cycle to history', {
        error: historyError instanceof Error ? historyError.message : String(historyError),
      });
      // Don't throw - allow scheduler to continue
    }

    logger.info('Reward distribution run completed', {
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      duration: `${duration}ms`,
      eligibleHolders: eligibleHoldersCount,
      totalSolDistributed: totalSolDistributed.toFixed(6),
    });

    // Generate automated export file
    try {
      const exportFilepath = await generateCombinedExcel();
      logger.info('Automated export file generated', {
        filepath: exportFilepath,
      });
    } catch (exportError) {
      logger.error('Failed to generate automated export file', {
        error: exportError instanceof Error ? exportError.message : String(exportError),
      });
      // Don't throw - allow scheduler to continue
    }

    // Update last run timestamp
    setLastRewardRun(now);
  } catch (error) {
    logger.error('Error in reward distribution run', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Start the reward scheduler
 */
export function startRewardScheduler(): void {
  if (schedulerInterval !== null) {
    logger.warn('Reward scheduler already started');
    return;
  }

  logger.info('Starting reward scheduler', {
    interval: `${REWARD_CONFIG.SCHEDULER_INTERVAL / 1000}s`,
    minRewardInterval: `${REWARD_CONFIG.MIN_REWARD_INTERVAL / 1000}s`,
  });

  // Don't run immediately on startup - wait for first scheduled interval
  // This prevents rate limiting on startup when multiple services are initializing
  logger.debug('Skipping immediate run on startup to prevent rate limiting');

  // Schedule periodic runs
  schedulerInterval = setInterval(() => {
    processRewards().catch((error) => {
      logger.error('Error in scheduled reward run', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, REWARD_CONFIG.SCHEDULER_INTERVAL);
}

/**
 * Stop the reward scheduler
 */
export function stopRewardScheduler(): void {
  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Reward scheduler stopped');
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  lastRun: number | null;
  nextRun: number | null;
} {
  const lastRun = getLastRewardRun();
  const now = Date.now();
  
  let nextRun: number | null = null;
  if (lastRun !== null) {
    const timeSinceLastRun = now - lastRun;
    if (timeSinceLastRun < REWARD_CONFIG.MIN_REWARD_INTERVAL) {
      nextRun = lastRun + REWARD_CONFIG.MIN_REWARD_INTERVAL;
    } else {
      // Next run will be at next scheduler interval
      nextRun = now + REWARD_CONFIG.SCHEDULER_INTERVAL;
    }
  } else {
    // First run will be at next scheduler interval
    nextRun = now + REWARD_CONFIG.SCHEDULER_INTERVAL;
  }

  return {
    isRunning,
    lastRun,
    nextRun,
  };
}

