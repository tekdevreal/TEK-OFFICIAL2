import { logger } from '../utils/logger';
import { getRaydiumPoolId } from '../config/raydium';
import { tokenMint } from '../config/solana';

/**
 * Price Service - Devnet Only
 * 
 * Fetches NUKE token price in SOL from Raydium Devnet API.
 * Uses: https://api-v3-devnet.raydium.io/pairs
 * 
 * Returns price in SOL (SOL per NUKE) from Raydium Devnet API.
 */

// Cache for price to avoid excessive API calls
interface PriceCache {
  price: number | null; // SOL per NUKE
  source: 'raydium' | null;
  timestamp: number;
}

let cachedPrice: PriceCache | null = null;
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Raydium API response structure
 */
interface RaydiumPair {
  id: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  quoteDecimalsValue: number;
  lpDecimals: number;
  version: number;
  programId: string;
  authority: string;
  openOrders: string;
  targetOrders: string;
  baseVault: string;
  quoteVault: string;
  withdrawQueue: string;
  lpVault: string;
  marketVersion: number;
  marketProgramId: string;
  marketId: string;
  marketBaseVault: string;
  marketQuoteVault: string;
  marketBids: string;
  marketAsks: string;
  marketEventQueue: string;
  withdrawQueueType: number;
  lpTokenVirtualPrice: number;
  marketBaseTokenTotal: number;
  marketQuoteTokenTotal: number;
  baseTokenTotal: number;
  quoteTokenTotal: number;
  lpTokenTotal: number;
  openOrdersReserve: number;
  stakingInfo?: {
    stakingVault: string;
    stakingVaultNonce: number;
    stakingVaultAuthority: string;
  };
  poolCoinTokenAccount?: string;
  poolPcTokenAccount?: string;
  ammOpenOrders?: string;
  poolWithdrawQueue?: string;
  poolTempLpTokenAccount?: string;
  serumProgramId?: string;
  serumMarket?: string;
  serumBids?: string;
  serumAsks?: string;
  serumEventQueue?: string;
  serumCoinVaultAccount?: string;
  serumPcVaultAccount?: string;
  serumVaultSigner?: string;
  official: boolean;
  status: string;
  poolId?: string;
  apy?: number;
  fee?: number;
  fee7d?: number;
  fee24h?: number;
  fee24hQuote?: number;
  fee24hBase?: number;
  liquidity?: number;
  liquidityQuote?: number;
  liquidityBase?: number;
  volume24h?: number;
  volume24hQuote?: number;
  volume24hBase?: number;
  volume7d?: number;
  volume7dQuote?: number;
  volume7dBase?: number;
  volume30d?: number;
  volume30dQuote?: number;
  volume30dBase?: number;
  price?: number;
  priceNative?: number;
  priceUsd?: number;
  tvl?: number;
  tvlQuote?: number;
  tvlBase?: number;
}

interface RaydiumApiResponse {
  success: boolean;
  data?: RaydiumPair[];
  time?: number;
}

/**
 * Get NUKE token price in SOL from Raydium Devnet API
 * 
 * Uses Raydium Devnet API: https://api-v3-devnet.raydium.io/pairs
 * Filters by RAYDIUM_POOL_ID from environment variables.
 * Extracts price (SOL per NUKE) from API response.
 * 
 * Returns: { price: number | null, source: 'raydium' | null }
 * - price: SOL per NUKE (from Raydium Devnet API)
 * - source: 'raydium' if successful, null if unavailable
 * 
 * Uses cached price if available and fresh (5 minute TTL)
 */
export async function getNUKEPriceSOL(): Promise<{ price: number | null; source: 'raydium' | null }> {
  try {
    // Check cache first
    const now = Date.now();
    if (cachedPrice && (now - cachedPrice.timestamp) < PRICE_CACHE_TTL) {
      logger.debug('Using cached NUKE price (SOL)', {
        price: cachedPrice.price,
        source: cachedPrice.source,
        cachedAt: new Date(cachedPrice.timestamp).toISOString(),
      });
      return {
        price: cachedPrice.price,
        source: cachedPrice.source,
      };
    }

    // Step 1: Get Raydium pool ID from environment
    const poolId = getRaydiumPoolId();
    if (!poolId) {
      logger.error('RAYDIUM_POOL_ID not set in environment variables - price cannot be fetched');
      logger.error('Please set RAYDIUM_POOL_ID environment variable to the Raydium devnet pool ID');
      cachedPrice = {
        price: null,
        source: null,
        timestamp: now,
      };
      return {
        price: null,
        source: null,
      };
    }

    const poolIdString = poolId.toBase58();
    logger.info('Fetching NUKE price from Raydium Devnet API', {
      poolId: poolIdString,
      tokenMint: tokenMint.toBase58(),
      apiUrl: 'https://api-v3-devnet.raydium.io/pairs',
    });

    // Step 2: Fetch pairs from Raydium Devnet API
    const apiUrl = 'https://api-v3-devnet.raydium.io/pairs';
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.error('Raydium Devnet API request failed', {
        status: response.status,
        statusText: response.statusText,
        poolId: poolIdString,
      });
      cachedPrice = {
        price: null,
        source: 'raydium',
        timestamp: now,
      };
      return {
        price: null,
        source: 'raydium',
      };
    }

    const apiData = await response.json() as RaydiumApiResponse;

    if (!apiData.success || !apiData.data || !Array.isArray(apiData.data)) {
      logger.error('Invalid Raydium API response structure', {
        success: apiData.success,
        hasData: !!apiData.data,
        isArray: Array.isArray(apiData.data),
        poolId: poolIdString,
      });
      cachedPrice = {
        price: null,
        source: 'raydium',
        timestamp: now,
      };
      return {
        price: null,
        source: 'raydium',
      };
    }

    // Step 3: Find pool by RAYDIUM_POOL_ID
    const pool = apiData.data.find((pair) => {
      // Check multiple possible ID fields
      return (
        pair.id === poolIdString ||
        pair.poolId === poolIdString ||
        pair.baseVault === poolIdString ||
        pair.quoteVault === poolIdString ||
        pair.marketId === poolIdString
      );
    });

    if (!pool) {
      logger.warn('Raydium pool not found in API response', {
        poolId: poolIdString,
        totalPairs: apiData.data.length,
        sampleIds: apiData.data.slice(0, 3).map(p => p.id),
      });
      cachedPrice = {
        price: null,
        source: 'raydium',
        timestamp: now,
      };
      return {
        price: null,
        source: 'raydium',
      };
    }

    // Step 4: Extract price (SOL per NUKE)
    // The API may provide price in different formats:
    // - priceNative: price in native token (SOL) terms
    // - price: price in quote token terms
    // - Calculate from reserves: quoteTokenTotal / baseTokenTotal
    
    let price: number | null = null;

    // Try priceNative first (if available, this is usually SOL per base token)
    if (pool.priceNative !== undefined && pool.priceNative !== null && pool.priceNative > 0) {
      // Verify this is the correct direction (SOL per NUKE)
      // If baseMint is NUKE and quoteMint is WSOL, priceNative should be SOL per NUKE
      if (pool.baseMint === tokenMint.toBase58()) {
        price = pool.priceNative;
      } else if (pool.quoteMint === tokenMint.toBase58()) {
        // If NUKE is the quote token, invert the price
        price = pool.priceNative > 0 ? 1 / pool.priceNative : null;
      }
    }

    // Fallback: Calculate from token reserves
    if (price === null || price <= 0) {
      const baseTotal = pool.baseTokenTotal || pool.marketBaseTokenTotal || 0;
      const quoteTotal = pool.quoteTokenTotal || pool.marketQuoteTokenTotal || 0;
      const baseDecimals = pool.baseDecimals || 6;
      const quoteDecimals = pool.quoteDecimals || 9;

      if (baseTotal > 0 && quoteTotal > 0) {
        // Adjust for decimals
        const baseAmount = baseTotal / Math.pow(10, baseDecimals);
        const quoteAmount = quoteTotal / Math.pow(10, quoteDecimals);

        if (pool.baseMint === tokenMint.toBase58()) {
          // NUKE is base token, WSOL is quote token
          // Price = quoteAmount / baseAmount (SOL per NUKE)
          price = quoteAmount / baseAmount;
        } else if (pool.quoteMint === tokenMint.toBase58()) {
          // NUKE is quote token, WSOL is base token
          // Price = baseAmount / quoteAmount (SOL per NUKE)
          price = baseAmount / quoteAmount;
        }
      }
    }

    // Step 5: Validate and cache price
    if (price !== null && price > 0 && isFinite(price)) {
      logger.info('NUKE token price fetched from Raydium Devnet API (SOL)', {
        price,
        priceDescription: `${price} SOL per NUKE`,
        poolId: poolIdString,
        poolBaseMint: pool.baseMint,
        poolQuoteMint: pool.quoteMint,
        tokenMint: tokenMint.toBase58(),
        baseTokenTotal: pool.baseTokenTotal,
        quoteTokenTotal: pool.quoteTokenTotal,
        priceNative: pool.priceNative,
      });

      cachedPrice = {
        price,
        source: 'raydium',
        timestamp: now,
      };

      return {
        price,
        source: 'raydium',
      };
    } else {
      logger.error('Failed to extract valid price from Raydium API', {
        poolId: poolIdString,
        price,
        poolBaseMint: pool.baseMint,
        poolQuoteMint: pool.quoteMint,
        tokenMint: tokenMint.toBase58(),
        baseTokenTotal: pool.baseTokenTotal,
        quoteTokenTotal: pool.quoteTokenTotal,
        priceNative: pool.priceNative,
      });

      cachedPrice = {
        price: null,
        source: 'raydium',
        timestamp: now,
      };

      return {
        price: null,
        source: 'raydium',
      };
    }
  } catch (error) {
    logger.error('Error fetching NUKE price from Raydium Devnet API', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Return null on error
    const now = Date.now();
    cachedPrice = {
      price: null,
      source: 'raydium',
      timestamp: now,
    };
    
    return {
      price: null,
      source: 'raydium',
    };
  }
}

/**
 * Get NUKE token price in USD (legacy function for compatibility)
 * Returns 0 for devnet as we only use SOL prices
 */
export async function getNUKEPriceUSD(): Promise<number> {
  logger.debug('getNUKEPriceUSD called - returning 0 for devnet (SOL-only pricing)');
  return 0; // Return 0 for devnet
}

/**
 * Get price source (always 'raydium' or null for devnet)
 */
export function getPriceSource(): 'raydium' | null {
  return cachedPrice?.source || null;
}

/**
 * Clear price cache (useful for testing or forced refresh)
 */
export function clearPriceCache(): void {
  cachedPrice = null;
  logger.debug('Price cache cleared');
}

/**
 * Get diagnostic information about price fetching
 * Useful for debugging why price might not be loading
 */
export async function getPriceDiagnostics(): Promise<{
  poolIdSet: boolean;
  poolId?: string;
  tokenMint: string;
  lastPrice: number | null;
  lastSource: 'raydium' | null;
  lastFetchTime: string | null;
  cacheAge: number | null;
  apiUrl: string;
}> {
  const poolId = getRaydiumPoolId();
  const now = Date.now();
  
  return {
    poolIdSet: poolId !== null,
    poolId: poolId?.toBase58(),
    tokenMint: tokenMint.toBase58(),
    lastPrice: cachedPrice?.price || null,
    lastSource: cachedPrice?.source || null,
    lastFetchTime: cachedPrice ? new Date(cachedPrice.timestamp).toISOString() : null,
    cacheAge: cachedPrice ? now - cachedPrice.timestamp : null,
    apiUrl: 'https://api-v3-devnet.raydium.io/pairs',
  };
}
