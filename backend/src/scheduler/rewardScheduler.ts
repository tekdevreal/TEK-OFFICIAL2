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
import { updateEligibleWallets, getEligibleWalletsMetadata } from '../services/eligibleWalletsService';
import {
  getAllWalletsWithAccumulatedRewards,
  getTotalUnpaidRewards,
} from '../services/unpaidRewardsService';
import {
  getCurrentEpochInfo,
  recordCycleResult,
  CycleState,
  type CycleResult,
} from '../services/cycleService';

// Update eligible wallets list every hour (not every distribution cycle)
const ELIGIBLE_WALLETS_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour
let lastEligibleWalletsUpdate: number = 0;

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Process reward distribution for pending holders
 * Wrapped inside cycle/epoch system
 */
async function processRewards(): Promise<void> {
  if (isRunning) {
    logger.debug('Reward scheduler already running, skipping');
    return;
  }

  const startTime = Date.now();
  const now = startTime; // Alias for compatibility with existing code
  const lastRun = getLastRewardRun();

  // Check if enough time has passed since last run
  if (lastRun !== null && (startTime - lastRun) < REWARD_CONFIG.MIN_REWARD_INTERVAL) {
    const timeUntilNext = REWARD_CONFIG.MIN_REWARD_INTERVAL - (startTime - lastRun);
    logger.debug('Skipping reward run - too soon since last run', {
      lastRun: new Date(lastRun).toISOString(),
      timeUntilNext: `${Math.ceil(timeUntilNext / 1000)}s`,
    });
    return;
  }

  // Get current epoch and cycle information
  const epochInfo = getCurrentEpochInfo();
  const { epoch, cycleNumber } = epochInfo;

  isRunning = true;
  logger.info('🔄 Starting cycle execution', {
    epoch,
    cycleNumber,
    startTime: new Date(startTime).toISOString(),
  });

  // Initialize cycle result
  let cycleResult: CycleResult = {
    epoch,
    cycleNumber,
    state: CycleState.FAILED, // Default to FAILED, will be updated based on outcome
    timestamp: startTime,
  };

  try {
    // Update eligible wallets list periodically (not every distribution cycle)
    const timeSinceLastUpdate = startTime - lastEligibleWalletsUpdate;
    
    if (timeSinceLastUpdate >= ELIGIBLE_WALLETS_UPDATE_INTERVAL || lastEligibleWalletsUpdate === 0) {
      try {
        logger.info('Updating eligible wallets list (periodic update)', {
          timeSinceLastUpdate: Math.round(timeSinceLastUpdate / 1000),
        });
        await updateEligibleWallets();
        lastEligibleWalletsUpdate = startTime;
        
        const metadata = getEligibleWalletsMetadata();
        logger.info('Eligible wallets list updated successfully', {
          eligibleCount: metadata.count,
          lastUpdated: metadata.lastUpdated ? new Date(metadata.lastUpdated).toISOString() : null,
        });
      } catch (updateError) {
        logger.error('Failed to update eligible wallets list', {
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
        // Don't throw - continue with existing eligible wallets list
      }
    } else {
      logger.debug('Skipping eligible wallets update (too soon)', {
        timeSinceLastUpdate: Math.round(timeSinceLastUpdate / 1000),
        nextUpdateIn: Math.round((ELIGIBLE_WALLETS_UPDATE_INTERVAL - timeSinceLastUpdate) / 1000),
      });
    }

    // Process withheld tax from Token-2022 transfers
    // This: 1) Harvests NUKE taxes, 2) Swaps NUKE to SOL, 3) Distributes SOL to holders (75%) and treasury (25%)
    // Wrapped inside cycle system - determines cycle state
    let taxResult: Awaited<ReturnType<typeof TaxService.processWithheldTax>> | null = null;
    try {
      logger.info('Processing withheld tax from Token-2022 transfers');
      taxResult = await TaxService.processWithheldTax(epoch, cycleNumber);
      
      if (taxResult) {
        // DISTRIBUTED: Successful harvest + distribution
        cycleResult.state = CycleState.DISTRIBUTED;
        cycleResult.taxResult = {
          nukeHarvested: taxResult.totalTax.toString(),
          solToHolders: (Number(taxResult.rewardAmount) / 1e9).toFixed(6),
          solToTreasury: (Number(taxResult.treasuryAmount) / 1e9).toFixed(6),
          distributedCount: taxResult.distributionResult?.distributedCount || 0,
          swapSignature: taxResult.swapSignature,
        };
        
        logger.info('✅ Cycle completed: DISTRIBUTED', {
          epoch,
          cycleNumber,
          nukeHarvested: taxResult.totalTax.toString(),
          nukeSold: taxResult.totalTax.toString(),
          solReceived: (taxResult.rewardAmount + taxResult.treasuryAmount).toString(),
          solToHolders: taxResult.rewardAmount.toString(),
          solToTreasury: taxResult.treasuryAmount.toString(),
          holdersPaid: taxResult.distributionResult?.distributedCount || 0,
          swapSignature: taxResult.swapSignature,
        });
      } else {
        // ROLLED_OVER: Minimum tax not met, carry tax forward
        cycleResult.state = CycleState.ROLLED_OVER;
        logger.info('⏸️ Cycle completed: ROLLED_OVER', {
          epoch,
          cycleNumber,
          reason: 'Tax below minimum threshold, will accumulate for next cycle',
        });
      }
    } catch (taxError) {
      // FAILED: Unexpected error, safe to retry next cycle
      cycleResult.state = CycleState.FAILED;
      cycleResult.error = taxError instanceof Error ? taxError.message : String(taxError);
      
      logger.error('❌ Cycle completed: FAILED', {
        epoch,
        cycleNumber,
        error: taxError instanceof Error ? taxError.message : String(taxError),
        stack: taxError instanceof Error ? taxError.stack : undefined,
      });
      // Don't throw - allow scheduler to continue and record cycle state
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

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

    // Get tax stats for history and logging (get once, use multiple times)
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

    // Get unpaid rewards statistics for summary
    let walletsWithAccumulatedRewards = 0;
    let totalPendingRewardsSOL = 0;
    try {
      walletsWithAccumulatedRewards = getAllWalletsWithAccumulatedRewards().length;
      totalPendingRewardsSOL = getTotalUnpaidRewards();
    } catch (error) {
      logger.debug('Failed to get unpaid rewards statistics for summary', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Determine harvest status for summary (taxStats already retrieved above)
    const harvestStatus = taxResult 
      ? (taxResult.distributionResult ? 'EXECUTED' : 'HARVESTED_ONLY')
      : (taxStats.totalNukeHarvested !== '0' ? 'SKIPPED_THRESHOLD' : 'NO_TAX');

    // Determine if batch harvest was used
    const wasBatched = taxResult?.swapSignature?.includes(',') || false;

    // Create epoch summary report
    logger.info('📊 Epoch Summary Report', {
      epoch: new Date(startTime).toISOString(),
      duration: `${duration}ms`,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      tax: {
        totalCollected: taxStats.totalTaxCollected,
        harvestStatus,
        wasBatched,
        nukeHarvested: taxResult?.totalTax?.toString() || '0',
        solToHolders: taxResult ? (Number(taxResult.rewardAmount) / 1e9).toFixed(6) : '0',
        solToTreasury: taxResult ? (Number(taxResult.treasuryAmount) / 1e9).toFixed(6) : '0',
        swapSignature: taxResult?.swapSignature || null,
        swapSignatureCount: taxResult?.swapSignature?.split(',').length || 0,
      },
      payouts: {
        sent: taxResult?.distributionResult?.distributedCount || 0,
        skipped: taxResult?.distributionResult?.skippedCount || 0,
        failed: taxResult?.distributionResult?.errors?.length || 0,
        totalDistributedSOL: taxResult?.distributionResult 
          ? (Number(taxResult.distributionResult.totalDistributed) / 1e9).toFixed(6)
          : '0',
      },
      accumulatedRewards: {
        walletsWithAccumulatedRewards,
        totalPendingRewardsSOL: totalPendingRewardsSOL.toFixed(6),
      },
      holders: {
        total: totalHoldersCount,
        eligible: eligibleHoldersCount,
        excluded: excludedHoldersCount,
        blacklisted: blacklistedHoldersCount,
      },
      tokenPrice: {
        usd: tokenPriceUSD.toFixed(6),
      },
    });

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

    // Record cycle result (after all processing is complete)
    try {
      recordCycleResult(cycleResult);
    } catch (cycleError) {
      logger.error('Failed to record cycle result', {
        error: cycleError instanceof Error ? cycleError.message : String(cycleError),
        cycleResult,
      });
      // Don't throw - cycle execution was successful, just failed to record
    }
  } catch (error) {
    // Outer catch for unexpected errors - mark cycle as FAILED
    cycleResult.state = CycleState.FAILED;
    cycleResult.error = error instanceof Error ? error.message : String(error);
    
    logger.error('❌ Cycle execution failed with unexpected error', {
      epoch,
      cycleNumber,
      error: error instanceof Error ? error.message : String(error),
    });

    // Try to record the failed cycle
    try {
      recordCycleResult(cycleResult);
    } catch (cycleError) {
      logger.error('Failed to record failed cycle result', {
        error: cycleError instanceof Error ? cycleError.message : String(cycleError),
      });
    }
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

  logger.info('Starting reward scheduler with cycle/epoch system', {
    interval: `${REWARD_CONFIG.SCHEDULER_INTERVAL / 1000}s`,
    minRewardInterval: `${REWARD_CONFIG.MIN_REWARD_INTERVAL / 1000}s`,
    cyclesPerEpoch: 288,
    epochDuration: '1 UTC day',
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

