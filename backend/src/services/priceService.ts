import { logger } from '../utils/logger';
import { getRaydiumPoolId, WSOL_MINT } from '../config/raydium';
import { tokenMint } from '../config/solana';

/**
 * Price Service - Devnet Only
 * 
 * Fetches NUKE token price in SOL from Raydium Devnet API.
 * Uses: https://api-v3-devnet.raydium.io/pools/info/ids
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
 * Raydium Pool Info API response structures
 *
 * The devnet API currently returns a "Standard" Cpmm payload with:
 * - mintA / mintB objects (each with address, decimals, etc.)
 * - mintAmountA / mintAmountB (human-readable reserves)
 *
 * Older examples/docs also reference baseMint / quoteMint and various
 * raw token totals. To be robust, we support both shapes.
 */

interface RaydiumMintInfo {
  address: string;
  decimals: number;
}

interface RaydiumCpmmPoolStandard {
  id: string;
  programId: string;
  type?: string;
  mintA: RaydiumMintInfo;
  mintB: RaydiumMintInfo;
  mintAmountA?: number;
  mintAmountB?: number;
  price?: number;
}

// Older / alternative shape (kept partial, only fields we care about)
interface RaydiumLegacyPoolInfo {
  id: string;
  baseMint?: string;
  quoteMint?: string;
  baseDecimals?: number;
  quoteDecimals?: number;
  baseTokenTotal?: number;
  quoteTokenTotal?: number;
  marketBaseTokenTotal?: number;
  marketQuoteTokenTotal?: number;
  priceNative?: number;
}

type AnyRaydiumPoolInfo = RaydiumCpmmPoolStandard & RaydiumLegacyPoolInfo;

interface RaydiumPoolInfoResponse {
  success: boolean;
  data?: AnyRaydiumPoolInfo[];
  time?: number;
}

/**
 * Get NUKE token price in SOL from Raydium Devnet API
 * 
 * Uses Raydium Devnet API: https://api-v3-devnet.raydium.io/pools/info/ids
 * Fetches pool info by RAYDIUM_POOL_ID from environment variables.
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
    const apiUrl = `https://api-v3-devnet.raydium.io/pools/info/ids?ids=${poolIdString}`;
    
    logger.info('Fetching NUKE price from Raydium Devnet API', {
      poolId: poolIdString,
      tokenMint: tokenMint.toBase58(),
      apiUrl,
    });

    // Step 2: Fetch pool info from Raydium Devnet API
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
        apiUrl,
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

    const apiData = await response.json() as RaydiumPoolInfoResponse;

    if (!apiData.success || !apiData.data || !Array.isArray(apiData.data) || apiData.data.length === 0) {
      logger.error('Invalid Raydium API response structure or pool not found', {
        success: apiData.success,
        hasData: !!apiData.data,
        isArray: Array.isArray(apiData.data),
        dataLength: apiData.data?.length || 0,
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

    // Step 3: Get the pool info (should be first item in array)
    const pool = apiData.data[0];

    if (!pool || pool.id !== poolIdString) {
      logger.warn('Raydium pool ID mismatch in API response', {
        requestedPoolId: poolIdString,
        returnedPoolId: pool?.id,
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

    // Step 4: Extract price (SOL per NUKE)
    // The devnet Cpmm API exposes:
    // - mintA / mintB objects with addresses and decimals
    // - mintAmountA / mintAmountB as human-readable reserves
    //
    // For your NUKE/dwSOL pool:
    //   mintA = SOL (dwSOL), mintB = NUKE
    //   mintAmountA = SOL reserves, mintAmountB = NUKE reserves
    //
    // We want SOL per NUKE:
    //   priceSOL = SOL_reserves / NUKE_reserves
    
    let price: number | null = null;

    const tokenMintStr = tokenMint.toBase58();
    const wsolStr = WSOL_MINT.toBase58();

    const isStandardCpmm =
      (pool as RaydiumCpmmPoolStandard).mintA !== undefined &&
      (pool as RaydiumCpmmPoolStandard).mintB !== undefined;

    if (isStandardCpmm) {
      const std = pool as RaydiumCpmmPoolStandard;
      const mintA = std.mintA;
      const mintB = std.mintB;
      const amountA = Number(std.mintAmountA ?? 0);
      const amountB = Number(std.mintAmountB ?? 0);

      if (amountA > 0 && amountB > 0) {
        if (mintA.address === wsolStr && mintB.address === tokenMintStr) {
          // A = SOL, B = NUKE  =>  price = SOL / NUKE
          price = amountA / amountB;
        } else if (mintB.address === wsolStr && mintA.address === tokenMintStr) {
          // B = SOL, A = NUKE  =>  price = SOL / NUKE
          price = amountB / amountA;
        }
      }
    }

    // Legacy fallback: use priceNative or raw token totals if available
    if ((price === null || price <= 0) && (pool.priceNative !== undefined && pool.priceNative !== null && pool.priceNative > 0)) {
      const legacy = pool as RaydiumLegacyPoolInfo;
      if (legacy.baseMint === tokenMintStr) {
        price = pool.priceNative;
      } else if (legacy.quoteMint === tokenMintStr && pool.priceNative > 0) {
        price = 1 / pool.priceNative;
      }
    }

    if (price === null || price <= 0) {
      const legacy = pool as RaydiumLegacyPoolInfo;
      const baseTotal = legacy.baseTokenTotal || legacy.marketBaseTokenTotal || 0;
      const quoteTotal = legacy.quoteTokenTotal || legacy.marketQuoteTokenTotal || 0;
      const baseDecimals = legacy.baseDecimals || 6;
      const quoteDecimals = legacy.quoteDecimals || 9;
      
      if (baseTotal > 0 && quoteTotal > 0) {
        const baseAmount = baseTotal / Math.pow(10, baseDecimals);
        const quoteAmount = quoteTotal / Math.pow(10, quoteDecimals);
        
        if (legacy.baseMint === tokenMintStr) {
          price = quoteAmount / baseAmount;
        } else if (legacy.quoteMint === tokenMintStr) {
          price = baseAmount / quoteAmount;
        }
      }
    }

    // Step 5: Validate and cache price
    if (price !== null && price > 0 && isFinite(price)) {
      logger.info('NUKE token price fetched from Raydium (SOL)', {
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
  const poolIdString = poolId?.toBase58() || '';
  
  return {
    poolIdSet: poolId !== null,
    poolId: poolIdString,
    tokenMint: tokenMint.toBase58(),
    lastPrice: cachedPrice?.price || null,
    lastSource: cachedPrice?.source || null,
    lastFetchTime: cachedPrice ? new Date(cachedPrice.timestamp).toISOString() : null,
    cacheAge: cachedPrice ? now - cachedPrice.timestamp : null,
    apiUrl: poolIdString ? `https://api-v3-devnet.raydium.io/pools/info/ids?ids=${poolIdString}` : 'not set',
  };
}
