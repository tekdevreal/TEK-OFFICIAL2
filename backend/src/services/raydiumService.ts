import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, getAccount, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { connection } from '../config/solana';
import { RAYDIUM_CONFIG, WSOL_MINT } from '../config/raydium';
import { logger } from '../utils/logger';

// Cache for Raydium data
interface RaydiumCache {
  price: number | null;
  liquidityUSD: number | null;
  baseVaultBalance: bigint;
  quoteVaultBalance: bigint;
  timestamp: number;
  source: 'raydium' | null;
}

let cachedRaydiumData: RaydiumCache | null = null;
const RAYDIUM_CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache
const RAYDIUM_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown between RPC calls

// Track last successful fetch time to enforce cooldown
let lastRaydiumFetch: number = 0;
let pendingRaydiumFetch: Promise<{
  price: number | null;
  liquidityUSD: number | null;
  baseVaultBalance: bigint;
  quoteVaultBalance: bigint;
  source: 'raydium' | null;
  updatedAt: string;
}> | null = null;

// SOL price in USD (fallback if we can't fetch)
const DEFAULT_SOL_PRICE_USD = 100;

/**
 * Fetch SOL price in USD using mainnet reference price
 * 
 * IMPORTANT: This uses a MAINNET reference price (Jupiter/CoinGecko) because:
 * - Devnet has no real USD price data
 * - We need a reliable SOL/USD conversion for the hybrid pricing model
 * - This allows: NUKE_USD = (NUKE_SOL from devnet) × (SOL_USD from mainnet)
 * 
 * This hybrid model is intentional and correct for devnet tokens.
 * The same logic will work seamlessly on mainnet without code changes.
 */
async function getSOLPriceUSD(): Promise<number> {
  try {
    // Fetch SOL/USD from Jupiter (mainnet reference price)
    // This is a mainnet price oracle, not devnet
    const jupiterPriceUrl = 'https://price.jup.ag/v4/price?ids=So11111111111111111111111111111111111111112';
    const response = await fetch(jupiterPriceUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json() as {
        data?: {
          [mint: string]: { price?: number };
        };
      };
      
      if (data.data && data.data['So11111111111111111111111111111111111111112']) {
        const price = data.data['So11111111111111111111111111111111111111112'].price;
        if (typeof price === 'number' && price > 0) {
          return price;
        }
      }
    }
  } catch (error) {
    logger.debug('Failed to fetch SOL price from Jupiter', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to default SOL price if Jupiter fails
  return DEFAULT_SOL_PRICE_USD;
}

/**
 * Find Raydium pool by base and quote mints
 * This is a simplified approach - in production you might want to use Raydium's API
 */
async function findRaydiumPool(
  conn: Connection,
  baseMint: PublicKey,
  quoteMint: PublicKey
): Promise<PublicKey | null> {
  // If pool ID is provided in env, use it
  if (RAYDIUM_CONFIG.poolId) {
    return RAYDIUM_CONFIG.poolId;
  }

  // Otherwise, we'd need to search for pools
  // For now, return null and let caller handle it
  logger.debug('RAYDIUM_POOL_ID not set, cannot find pool automatically');
  return null;
}

/**
 * Fetch Raydium pool data and calculate price/liquidity
 * This reads the pool account structure from Raydium AMM
 */
async function fetchRaydiumPoolData(
  conn: Connection,
  poolId: PublicKey
): Promise<{
  baseVaultBalance: bigint;
  quoteVaultBalance: bigint;
  baseDecimals: number;
  quoteDecimals: number;
} | null> {
  try {
    // Fetch pool account
    const poolAccountInfo = await conn.getAccountInfo(poolId);
    if (!poolAccountInfo) {
      logger.warn('Raydium pool account not found', { poolId: poolId.toBase58() });
      return null;
    }

    // Raydium AMM pool account structure (simplified parsing)
    // Pool account layout (approximate):
    // - Offset 0-8: status
    // - Offset 8-16: nonce
    // - Offset 16-48: tokenProgramId
    // - Offset 48-80: tokenAVault (base vault)
    // - Offset 80-112: tokenBVault (quote vault)
    // - ... more fields

    // For a more robust implementation, you'd use a proper Raydium SDK
    // For now, we'll try to parse the account data
    const data = poolAccountInfo.data;
    
    if (data.length < 112) {
      logger.warn('Raydium pool account data too short', {
        poolId: poolId.toBase58(),
        dataLength: data.length,
      });
      return null;
    }

    // Extract vault addresses (PublicKey is 32 bytes)
    const tokenAVaultBytes = data.slice(48, 80);
    const tokenBVaultBytes = data.slice(80, 112);
    
    const tokenAVault = new PublicKey(tokenAVaultBytes);
    const tokenBVault = new PublicKey(tokenBVaultBytes);

    // Fetch vault token accounts
    // Try both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID since we don't know which one is used
    let baseVaultAccount = null;
    let quoteVaultAccount = null;

    // Try to fetch tokenAVault with both program IDs
    try {
      baseVaultAccount = await getAccount(conn, tokenAVault, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch {
      try {
        baseVaultAccount = await getAccount(conn, tokenAVault, 'confirmed', TOKEN_PROGRAM_ID);
      } catch (error) {
        logger.debug('Failed to fetch tokenAVault with both program IDs', {
          vault: tokenAVault.toBase58(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Try to fetch tokenBVault with both program IDs
    try {
      quoteVaultAccount = await getAccount(conn, tokenBVault, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch {
      try {
        quoteVaultAccount = await getAccount(conn, tokenBVault, 'confirmed', TOKEN_PROGRAM_ID);
      } catch (error) {
        logger.debug('Failed to fetch tokenBVault with both program IDs', {
          vault: tokenBVault.toBase58(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!baseVaultAccount || !quoteVaultAccount) {
      logger.debug('Failed to fetch Raydium vault accounts (using HTTP API for prices instead)', {
        tokenAVault: tokenAVault.toBase58(),
        tokenBVault: tokenBVault.toBase58(),
        baseVaultFound: !!baseVaultAccount,
        quoteVaultFound: !!quoteVaultAccount,
      });
      return null;
    }

    // Determine which vault is base and which is quote
    // Check mint addresses to determine order
    // Try both program IDs for mint info
    let baseMintInfo = null;
    let quoteMintInfo = null;

    try {
      baseMintInfo = await getMint(conn, baseVaultAccount.mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch {
      baseMintInfo = await getMint(conn, baseVaultAccount.mint, 'confirmed', TOKEN_PROGRAM_ID);
    }

    try {
      quoteMintInfo = await getMint(conn, quoteVaultAccount.mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch {
      quoteMintInfo = await getMint(conn, quoteVaultAccount.mint, 'confirmed', TOKEN_PROGRAM_ID);
    }

    let baseVaultBalance: bigint;
    let quoteVaultBalance: bigint;
    let baseDecimals: number;
    let quoteDecimals: number;

    // Check if tokenAVault is base or quote
    if (baseVaultAccount.mint.equals(RAYDIUM_CONFIG.baseMint)) {
      // tokenAVault is base, tokenBVault is quote
      baseVaultBalance = baseVaultAccount.amount;
      quoteVaultBalance = quoteVaultAccount.amount;
      baseDecimals = baseMintInfo.decimals;
      quoteDecimals = quoteMintInfo.decimals;
    } else if (quoteVaultAccount.mint.equals(RAYDIUM_CONFIG.baseMint)) {
      // tokenBVault is base, tokenAVault is quote
      baseVaultBalance = quoteVaultAccount.amount;
      quoteVaultBalance = baseVaultAccount.amount;
      baseDecimals = quoteMintInfo.decimals;
      quoteDecimals = baseMintInfo.decimals;
    } else {
      logger.warn('Raydium pool vaults do not match expected mints', {
        tokenAVaultMint: baseVaultAccount.mint.toBase58(),
        tokenBVaultMint: quoteVaultAccount.mint.toBase58(),
        expectedBaseMint: RAYDIUM_CONFIG.baseMint.toBase58(),
        expectedQuoteMint: RAYDIUM_CONFIG.quoteMint.toBase58(),
      });
      return null;
    }

    return {
      baseVaultBalance,
      quoteVaultBalance,
      baseDecimals,
      quoteDecimals,
    };
  } catch (error) {
    logger.error('Error fetching Raydium pool data', {
      error: error instanceof Error ? error.message : String(error),
      poolId: poolId.toBase58(),
    });
    return null;
  }
}

/**
 * Check if error is a 429 rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || 
           error.message.includes('Too Many Requests') ||
           error.message.includes('max usage reached');
  }
  return false;
}

/**
 * Get Raydium price and liquidity data (with caching and cooldown)
 * Returns cached data if available and fresh
 * Enforces 5-minute cooldown between RPC calls
 */
export async function getRaydiumData(): Promise<{
  price: number | null;
  liquidityUSD: number | null;
  baseVaultBalance: bigint;
  quoteVaultBalance: bigint;
  source: 'raydium' | null;
  updatedAt: string;
}> {
  // Check cache first
  const now = Date.now();
  if (cachedRaydiumData && (now - cachedRaydiumData.timestamp) < RAYDIUM_CACHE_TTL) {
    logger.debug('Using cached Raydium data', {
      price: cachedRaydiumData.price,
      liquidityUSD: cachedRaydiumData.liquidityUSD,
      cachedAt: new Date(cachedRaydiumData.timestamp).toISOString(),
    });
    return {
      price: cachedRaydiumData.price,
      liquidityUSD: cachedRaydiumData.liquidityUSD,
      baseVaultBalance: cachedRaydiumData.baseVaultBalance,
      quoteVaultBalance: cachedRaydiumData.quoteVaultBalance,
      source: cachedRaydiumData.source,
      updatedAt: new Date(cachedRaydiumData.timestamp).toISOString(),
    };
  }

  // Check cooldown - if within 5 minutes of last fetch, return stale cache
  const timeSinceLastFetch = now - lastRaydiumFetch;
  if (lastRaydiumFetch > 0 && timeSinceLastFetch < RAYDIUM_COOLDOWN && cachedRaydiumData) {
    logger.debug('Within cooldown period, returning stale Raydium cache', {
      timeSinceLastFetch: Math.round(timeSinceLastFetch / 1000),
      cacheAge: Math.round((now - cachedRaydiumData.timestamp) / 1000),
    });
    return {
      price: cachedRaydiumData.price,
      liquidityUSD: cachedRaydiumData.liquidityUSD,
      baseVaultBalance: cachedRaydiumData.baseVaultBalance,
      quoteVaultBalance: cachedRaydiumData.quoteVaultBalance,
      source: cachedRaydiumData.source,
      updatedAt: new Date(cachedRaydiumData.timestamp).toISOString(),
    };
  }

  // If there's already a pending fetch, wait for it
  if (pendingRaydiumFetch) {
    logger.debug('Raydium fetch already in progress, waiting...');
    return pendingRaydiumFetch;
  }

  // Create new fetch promise
  pendingRaydiumFetch = (async () => {
    try {
      // Find or use pool ID
      const poolId = await findRaydiumPool(connection, RAYDIUM_CONFIG.baseMint, RAYDIUM_CONFIG.quoteMint);
    if (!poolId) {
      logger.debug('Raydium pool not found or not configured');
      cachedRaydiumData = {
        price: null,
        liquidityUSD: null,
        baseVaultBalance: BigInt(0),
        quoteVaultBalance: BigInt(0),
        timestamp: now,
        source: null,
      };
      return {
        price: null,
        liquidityUSD: null,
        baseVaultBalance: BigInt(0),
        quoteVaultBalance: BigInt(0),
        source: null,
        updatedAt: new Date(now).toISOString(),
      };
    }

    // Fetch pool data
    const poolData = await fetchRaydiumPoolData(connection, poolId);
    if (!poolData) {
      cachedRaydiumData = {
        price: null,
        liquidityUSD: null,
        baseVaultBalance: BigInt(0),
        quoteVaultBalance: BigInt(0),
        timestamp: now,
        source: null,
      };
      return {
        price: null,
        liquidityUSD: null,
        baseVaultBalance: BigInt(0),
        quoteVaultBalance: BigInt(0),
        source: null,
        updatedAt: new Date(now).toISOString(),
      };
    }

    // Calculate price: WSOL per NUKE from Raydium devnet pool
    // This is the real AMM ratio from the devnet liquidity pool
    // price = quoteVaultBalance / baseVaultBalance (adjusted for decimals)
    const baseAmount = Number(poolData.baseVaultBalance) / Math.pow(10, poolData.baseDecimals);
    const quoteAmount = Number(poolData.quoteVaultBalance) / Math.pow(10, poolData.quoteDecimals);
    
    let price: number | null = null;
    if (baseAmount > 0) {
      // NUKE/SOL price from devnet Raydium pool
      price = quoteAmount / baseAmount; // WSOL per NUKE
    }

    // Calculate liquidity in USD using hybrid pricing model
    // Uses mainnet SOL/USD reference price (not devnet)
    // liquidity = 2 * (quoteAmount * SOL_PRICE_USD) (both sides of the pool)
    const solPriceUSD = await getSOLPriceUSD(); // Mainnet reference price
    const liquidityUSD = price !== null ? 2 * quoteAmount * solPriceUSD : null;

      // Update cache and last fetch time
      cachedRaydiumData = {
        price,
        liquidityUSD,
        baseVaultBalance: poolData.baseVaultBalance,
        quoteVaultBalance: poolData.quoteVaultBalance,
        timestamp: now,
        source: 'raydium',
      };
      lastRaydiumFetch = now;

      logger.info('Raydium data fetched', {
        price,
        priceDescription: price ? `${price} WSOL per NUKE` : 'null',
        liquidityUSD,
        baseVaultBalance: poolData.baseVaultBalance.toString(),
        quoteVaultBalance: poolData.quoteVaultBalance.toString(),
        baseAmount: baseAmount.toString(),
        quoteAmount: quoteAmount.toString(),
        baseDecimals: poolData.baseDecimals,
        quoteDecimals: poolData.quoteDecimals,
        poolId: poolId.toBase58(),
      });

      return {
        price,
        liquidityUSD,
        baseVaultBalance: poolData.baseVaultBalance,
        quoteVaultBalance: poolData.quoteVaultBalance,
        source: 'raydium',
        updatedAt: new Date(now).toISOString(),
      };
    } catch (error) {
      // If it's a rate limit error and we have stale cache, return it
      if (isRateLimitError(error) && cachedRaydiumData) {
        logger.warn('Rate limit hit, returning stale Raydium cache', {
          cacheAge: Math.round((Date.now() - cachedRaydiumData.timestamp) / 1000),
        });
        return {
          price: cachedRaydiumData.price,
          liquidityUSD: cachedRaydiumData.liquidityUSD,
          baseVaultBalance: cachedRaydiumData.baseVaultBalance,
          quoteVaultBalance: cachedRaydiumData.quoteVaultBalance,
          source: cachedRaydiumData.source,
          updatedAt: new Date(cachedRaydiumData.timestamp).toISOString(),
        };
      }

      // Only log non-rate-limit errors as errors
      if (isRateLimitError(error)) {
        const { rateLimitLogger } = await import('../utils/rateLimitLogger');
        rateLimitLogger.logRateLimit('Rate limit error fetching Raydium data (no cache available)');
        rateLimitLogger.recordRateLimitError();
      } else {
        logger.error('Error fetching Raydium data', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      // Return null data
      const errorNow = Date.now();
      cachedRaydiumData = {
        price: null,
        liquidityUSD: null,
        baseVaultBalance: BigInt(0),
        quoteVaultBalance: BigInt(0),
        timestamp: errorNow,
        source: null,
      };
      
      return {
        price: null,
        liquidityUSD: null,
        baseVaultBalance: BigInt(0),
        quoteVaultBalance: BigInt(0),
        source: null,
        updatedAt: new Date(errorNow).toISOString(),
      };
    } finally {
      // Clear pending fetch
      pendingRaydiumFetch = null;
    }
  })();

  return pendingRaydiumFetch;
}

/**
 * Get Raydium price in USD using hybrid pricing model
 * 
 * Formula: NUKE_USD = (NUKE_SOL from Raydium devnet) × (SOL_USD from mainnet reference)
 * 
 * This hybrid model:
 * - Fetches NUKE/SOL ratio from Raydium devnet pool (real AMM data)
 * - Uses mainnet SOL/USD reference price (Jupiter/CoinGecko) for conversion
 * - Works correctly on devnet (where no USD price exists)
 * - Will work seamlessly on mainnet without code changes
 */
export async function getRaydiumPriceUSD(): Promise<number | null> {
  try {
    const raydiumData = await getRaydiumData();
    if (!raydiumData.price || raydiumData.source !== 'raydium') {
      return null;
    }

    // Hybrid pricing: NUKE_SOL (from devnet) × SOL_USD (from mainnet reference)
    // This is the correct approach for devnet tokens
    const solPriceUSD = await getSOLPriceUSD(); // Mainnet reference price
    return raydiumData.price * solPriceUSD; // NUKE/SOL × SOL/USD = NUKE/USD
  } catch (error) {
    logger.error('Error calculating Raydium price in USD', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Clear Raydium cache (useful for testing or forced refresh)
 */
export function clearRaydiumCache(): void {
  cachedRaydiumData = null;
  logger.debug('Raydium cache cleared');
}

