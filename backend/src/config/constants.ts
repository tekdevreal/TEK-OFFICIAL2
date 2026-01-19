/**
 * Application constants
 */

import { env } from './env';
import { logger } from '../utils/logger';

export const APP_NAME = 'backend';
export const APP_VERSION = '1.0.0';

// Reward scheduler configuration (optional - can be extended)
export const REWARD_CONFIG = {
  SCHEDULER_INTERVAL: 5 * 60 * 1000, // 5 minutes (check interval - reduced frequency to prevent rate limiting)
  MIN_REWARD_INTERVAL: 5 * 60 * 1000, // 5 minutes (minimum time between reward runs)
  MIN_HOLDING_USD: 5, // Minimum holding value in USD to be eligible
  MAX_RETRIES: 3, // Maximum retries for failed reward transfers
  MIN_SOL_PAYOUT: process.env.MIN_SOL_PAYOUT 
    ? parseFloat(process.env.MIN_SOL_PAYOUT)
    : 0.0001, // Default: 0.0001 SOL (for testing with small amounts)
  TOTAL_REWARD_POOL_SOL: 1.0, // Total SOL reward pool per distribution cycle
} as const;

/**
 * Minimum Payout Threshold Configuration
 * 
 * Minimum reward amount before payout is processed (accumulates if below threshold).
 * Prevents small payouts that are not cost-effective.
 * 
 * - MIN_PAYOUT_TOKEN: Minimum payout in NUKE tokens (for TOKEN mode)
 *   Default: 60 (60 NUKE tokens)
 * 
 * - MIN_PAYOUT_USD: Minimum payout in USD (for USD mode)
 *   Default: 0.001 (0.001 USD)
 * 
 * Configuration:
 * Set via environment variables:
 * - MIN_PAYOUT_TOKEN (default: 60)
 * - MIN_PAYOUT_USD (default: 0.001)
 */
export const MIN_PAYOUT_CONFIG = {
  MIN_PAYOUT_TOKEN: process.env.MIN_PAYOUT_TOKEN 
    ? parseInt(process.env.MIN_PAYOUT_TOKEN, 10) 
    : 60, // Default: 60 NUKE tokens
  MIN_PAYOUT_USD: process.env.MIN_PAYOUT_USD 
    ? parseFloat(process.env.MIN_PAYOUT_USD) 
    : 0.001, // Default: 0.001 USD
} as const;

/**
 * Tax Harvest Threshold Configuration
 * 
 * Minimum tax collection threshold before harvesting can proceed.
 * Prevents harvesting when tax amount is too small to be cost-effective.
 * 
 * - MIN_TAX_THRESHOLD_TOKEN: Minimum tax in token units (for TOKEN mode)
 *   Default: 20000 (20,000 TEK tokens) - for production
 *   Testing: 5 (5 TEK tokens for faster testing cycles)
 * 
 * - MIN_TAX_THRESHOLD_USD: Minimum tax in USD (for USD mode)
 *   Default: 5 (5 USD)
 * 
 * Configuration:
 * Set via environment variables:
 * - MIN_TAX_THRESHOLD_TOKEN (default: 20000 for production, 5 for testing)
 * - MIN_TAX_THRESHOLD_USD (default: 5)
 */
export const TAX_THRESHOLD_CONFIG = {
  MIN_TAX_THRESHOLD_TOKEN: process.env.MIN_TAX_THRESHOLD_TOKEN 
    ? parseInt(process.env.MIN_TAX_THRESHOLD_TOKEN, 10) 
    : 5, // Default: 5 TEK tokens (for faster testing, set to 20000 for production)
  MIN_TAX_THRESHOLD_USD: process.env.MIN_TAX_THRESHOLD_USD 
    ? parseFloat(process.env.MIN_TAX_THRESHOLD_USD) 
    : 5.0, // Default: 5 USD
} as const;

/**
 * Batch Harvest Configuration
 * 
 * Controls batch harvesting for large tax amounts to prevent market impact
 * and ensure reliable execution.
 * 
 * - MAX_HARVEST_TOKEN: Maximum harvest amount in token units before batching (for TOKEN mode)
 *   Default: 12000000 (12,000,000 NUKE tokens)
 * 
 * - MAX_HARVEST_USD: Maximum harvest amount in USD before batching (for USD mode)
 *   Default: 2000 (2,000 USD)
 * 
 * - BATCH_COUNT: Number of batches to split large harvests into
 *   Default: 4
 * 
 * - BATCH_DELAY_TOKEN_MODE: Delay between batches in TOKEN mode (milliseconds)
 *   Default: 10000 (10 seconds)
 * 
 * - BATCH_DELAY_USD_MODE: Delay between batches in USD mode (milliseconds)
 *   Default: 30000 (30 seconds)
 * 
 * Configuration:
 * Set via environment variables:
 * - MAX_HARVEST_TOKEN (default: 12000000)
 * - MAX_HARVEST_USD (default: 2000)
 * - BATCH_COUNT (default: 4)
 * - BATCH_DELAY_TOKEN_MODE (default: 10000)
 * - BATCH_DELAY_USD_MODE (default: 30000)
 */
export const BATCH_HARVEST_CONFIG = {
  MAX_HARVEST_TOKEN: process.env.MAX_HARVEST_TOKEN 
    ? parseInt(process.env.MAX_HARVEST_TOKEN, 10) 
    : 12000000, // Default: 12,000,000 NUKE tokens
  MAX_HARVEST_USD: process.env.MAX_HARVEST_USD 
    ? parseFloat(process.env.MAX_HARVEST_USD) 
    : 2000.0, // Default: 2,000 USD
  BATCH_COUNT: process.env.BATCH_COUNT 
    ? parseInt(process.env.BATCH_COUNT, 10) 
    : 4, // Default: 4 batches
  BATCH_DELAY_TOKEN_MODE: process.env.BATCH_DELAY_TOKEN_MODE 
    ? parseInt(process.env.BATCH_DELAY_TOKEN_MODE, 10) 
    : 10000, // Default: 10 seconds
  BATCH_DELAY_USD_MODE: process.env.BATCH_DELAY_USD_MODE 
    ? parseInt(process.env.BATCH_DELAY_USD_MODE, 10) 
    : 30000, // Default: 30 seconds
} as const;

/**
 * Reward Value Mode Configuration
 * 
 * Controls how reward values are calculated and displayed throughout the application.
 * 
 * MODES:
 * - TOKEN: For devnet environments - uses raw NUKE token amounts without USD conversion
 *   - Use when: Testing on devnet, token prices may not be accurate, or USD conversion is not needed
 *   - Example: Display "1,000,000 NUKE" instead of "$50.00"
 * 
 * - USD: For mainnet environments - uses USD values converted from token amounts
 *   - Use when: Production on mainnet, accurate pricing is available, users expect USD values
 *   - Example: Display "$50.00" instead of "1,000,000 NUKE"
 * 
 * Configuration:
 * Set REWARD_VALUE_MODE environment variable to "TOKEN" or "USD"
 * Defaults to "TOKEN" if not specified
 */

/**
 * Checks if the application is running in TOKEN mode
 * @returns true if REWARD_VALUE_MODE is "TOKEN", false otherwise
 */
export function isTokenMode(): boolean {
  return env.REWARD_VALUE_MODE === 'TOKEN';
}

/**
 * Checks if the application is running in USD mode
 * @returns true if REWARD_VALUE_MODE is "USD", false otherwise
 */
export function isUsdMode(): boolean {
  return env.REWARD_VALUE_MODE === 'USD';
}

/**
 * Get minimum payout threshold in SOL based on REWARD_VALUE_MODE
 * 
 * This function converts the configured threshold to SOL for comparison:
 * - TOKEN mode: Converts MIN_PAYOUT_TOKEN (NUKE tokens) to SOL using NUKE price
 * - USD mode: Converts MIN_PAYOUT_USD (USD) to SOL using fixed devnet rate (100 SOL = 1 USD)
 * 
 * @returns Minimum payout threshold in SOL, or null if price data unavailable
 */
export async function getMinimumPayoutThreshold(): Promise<number | null> {
  // Dynamic import to avoid circular dependency
  const { getNUKEPriceSOL } = await import('../services/priceService');
  
  try {
    if (isTokenMode()) {
      // TOKEN mode: Convert MIN_PAYOUT_TOKEN (NUKE tokens) to SOL
      try {
        const priceData = await getNUKEPriceSOL();
        if (!priceData.price || priceData.price <= 0) {
          logger.warn('NUKE price unavailable for threshold calculation', {
            source: priceData.source,
            mode: 'TOKEN',
            thresholdToken: MIN_PAYOUT_CONFIG.MIN_PAYOUT_TOKEN,
          });
          return null;
        }
        
        // NUKE price is in SOL per NUKE
        // For MIN_PAYOUT_TOKEN NUKE tokens, we need: SOL = MIN_PAYOUT_TOKEN × (SOL_per_NUKE)
        const thresholdSOL = MIN_PAYOUT_CONFIG.MIN_PAYOUT_TOKEN * priceData.price;
        
        logger.debug('Minimum payout threshold calculated (TOKEN mode)', {
          mode: 'TOKEN',
          thresholdToken: MIN_PAYOUT_CONFIG.MIN_PAYOUT_TOKEN,
          nukePriceSOL: priceData.price,
          thresholdSOL: thresholdSOL.toFixed(6),
        });
        
        return thresholdSOL;
      } catch (error) {
        logger.error('Error calculating minimum payout threshold in TOKEN mode', {
          error: error instanceof Error ? error.message : String(error),
          mode: 'TOKEN',
          thresholdToken: MIN_PAYOUT_CONFIG.MIN_PAYOUT_TOKEN,
        });
        return null;
      }
    } else {
      // USD mode: Convert MIN_PAYOUT_USD (USD) to SOL
      // Use fixed devnet rate: 100 SOL = 1 USD (same as used elsewhere in codebase)
      const SOL_TO_USD_RATE = 100; // Devnet conversion rate
      const thresholdSOL = MIN_PAYOUT_CONFIG.MIN_PAYOUT_USD / SOL_TO_USD_RATE;
      
      logger.debug('Minimum payout threshold calculated (USD mode)', {
        mode: 'USD',
        thresholdUSD: MIN_PAYOUT_CONFIG.MIN_PAYOUT_USD,
        solToUsdRate: SOL_TO_USD_RATE,
        thresholdSOL: thresholdSOL.toFixed(6),
      });
      
      return thresholdSOL;
    }
  } catch (error) {
    logger.error('Error calculating minimum payout threshold', {
      error: error instanceof Error ? error.message : String(error),
      mode: isTokenMode() ? 'TOKEN' : 'USD',
    });
    return null;
  }
}
