import { PublicKey } from '@solana/web3.js';
import { env } from './env';
import { tokenMint } from './solana';
import { logger } from '../utils/logger';

// Raydium AMM Program ID (same for devnet and mainnet)
export const RAYDIUM_AMM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

// WSOL mint (wrapped SOL) - same for devnet and mainnet
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Base mint = NUKE token
export const BASE_MINT = tokenMint;

// Quote mint = WSOL
export const QUOTE_MINT = WSOL_MINT;

// Pool ID from environment (optional - will try to find pool if not provided)
let poolIdInstance: PublicKey | null = null;

/**
 * Get Raydium pool ID from environment or return null
 */
export function getRaydiumPoolId(): PublicKey | null {
  const poolIdStr = process.env.RAYDIUM_POOL_ID;
  
  if (!poolIdStr) {
    logger.debug('RAYDIUM_POOL_ID not set in environment variables');
    return null;
  }

  try {
    if (!poolIdInstance) {
      poolIdInstance = new PublicKey(poolIdStr);
    }
    return poolIdInstance;
  } catch (error) {
    logger.warn('Invalid RAYDIUM_POOL_ID in environment', {
      error: error instanceof Error ? error.message : String(error),
      poolId: poolIdStr,
    });
    return null;
  }
}

/**
 * Raydium pool configuration
 */
export const RAYDIUM_CONFIG = {
  programId: RAYDIUM_AMM_PROGRAM_ID,
  baseMint: BASE_MINT,
  quoteMint: QUOTE_MINT,
  poolId: getRaydiumPoolId(),
};

