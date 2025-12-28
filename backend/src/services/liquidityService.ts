/**
 * Liquidity Service
 * 
 * Fetches liquidity pool data from Raydium API for dashboard display
 */

import { logger } from '../utils/logger';

// Cache for liquidity pool data
interface LiquidityPoolCache {
  pools: Array<{
    pair: string;
    liquidityUSD: number;
    volume24hUSD: number;
  }>;
  summary: {
    totalLiquidityUSD: number;
    volume24hUSD: number;
    activePools: number;
    treasuryPools: number;
  };
  timestamp: number;
}

let cachedLiquidityData: LiquidityPoolCache | null = null;
const LIQUIDITY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// Match the structure used in priceService
interface RaydiumMintInfo {
  address: string;
  decimals: number;
}

interface RaydiumDayStats {
  volume?: number;
  volumeQuote?: number;
  volumeFee?: number;
  apr?: number;
  feeApr?: number;
  priceMin?: number;
  priceMax?: number;
  rewardApr?: number[];
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
  tvl?: number;
  volume24h?: number;
  volume24hUSD?: number;
  volume7d?: number;
  volume7dUSD?: number;
  day?: RaydiumDayStats; // 24h volume stats
}

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
  tvl?: number;
  volume24h?: number;
  volume24hUSD?: number;
  day?: RaydiumDayStats; // 24h volume stats
}

type RaydiumPoolInfo = RaydiumCpmmPoolStandard & RaydiumLegacyPoolInfo;

interface RaydiumPoolInfoResponse {
  success: boolean;
  data?: RaydiumPoolInfo[];
  time?: number;
}

/**
 * Get pool IDs from environment variables
 */
function getPoolIds(): { sol: string | null; usdc: string | null } {
  const solPoolId = process.env.RAYDIUM_POOL_ID || null;
  const usdcPoolId = process.env.RAYDIUM_POOL_ID_USDC || null;
  return { sol: solPoolId, usdc: usdcPoolId };
}

/**
 * Fetch pool data from Raydium API
 */
async function fetchPoolFromRaydium(poolId: string): Promise<RaydiumPoolInfo | null> {
  try {
    const apiUrl = `https://api-v3-devnet.raydium.io/pools/info/ids?ids=${poolId}`;
    
    logger.debug('Fetching pool data from Raydium API', { poolId });

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.error('Raydium API request failed', {
        status: response.status,
        statusText: response.statusText,
        poolId,
        apiUrl,
      });
      return null;
    }

    const apiData = await response.json() as RaydiumPoolInfoResponse;

    if (!apiData.success || !apiData.data || !Array.isArray(apiData.data) || apiData.data.length === 0) {
      logger.warn('Invalid Raydium API response or pool not found', {
        success: apiData.success,
        hasData: !!apiData.data,
        dataLength: apiData.data?.length || 0,
        poolId,
      });
      return null;
    }

    return apiData.data[0];
  } catch (error) {
    logger.error('Error fetching pool from Raydium API', {
      error: error instanceof Error ? error.message : String(error),
      poolId,
    });
    return null;
  }
}

/**
 * Determine pair name from pool mints
 */
function getPairName(pool: RaydiumPoolInfo): string {
  // NUKE mint address
  const NUKE_MINT = 'CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq';
  // USDC devnet mint (common devnet USDC mint)
  const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // Common devnet USDC mint
  // WSOL mint
  const WSOL_MINT = 'So11111111111111111111111111111111111111112';

  // Try to get mints from either format (new format uses mintA/mintB, old uses baseMint/quoteMint)
  const mint1 = pool.mintA?.address || pool.baseMint || '';
  const mint2 = pool.mintB?.address || pool.quoteMint || '';

  const mint1IsNuke = mint1 === NUKE_MINT;
  const mint2IsNuke = mint2 === NUKE_MINT;
  
  if (!mint1IsNuke && !mint2IsNuke) {
    // Fallback if NUKE not found in either position
    return 'Unknown / Unknown';
  }

  const otherMint = mint1IsNuke ? mint2 : mint1;

  if (otherMint === WSOL_MINT) {
    return 'NUKE / SOL';
  } else if (otherMint === USDC_MINT_DEVNET || otherMint.toLowerCase().includes('usdc')) {
    return 'NUKE / USDC';
  } else {
    return 'NUKE / Unknown';
  }
}

/**
 * Fetch all liquidity pools data from Raydium
 */
export async function fetchLiquidityPoolsData(): Promise<{
  pools: Array<{
    pair: string;
    liquidityUSD: number;
    volume24hUSD: number;
  }>;
  summary: {
    totalLiquidityUSD: number;
    volume24hUSD: number;
    activePools: number;
    treasuryPools: number;
  };
}> {
  // Check cache first
  const now = Date.now();
  if (cachedLiquidityData && (now - cachedLiquidityData.timestamp) < LIQUIDITY_CACHE_TTL) {
    logger.debug('Using cached liquidity pool data', {
      cachedAt: new Date(cachedLiquidityData.timestamp).toISOString(),
    });
    return {
      pools: cachedLiquidityData.pools,
      summary: cachedLiquidityData.summary,
    };
  }

  const poolIds = getPoolIds();
  const pools: Array<{
    pair: string;
    liquidityUSD: number;
    volume24hUSD: number;
  }> = [];

  let totalLiquidityUSD = 0;
  let totalVolume24hUSD = 0;

  // Fetch NUKE/SOL pool if configured
  if (poolIds.sol) {
    const solPool = await fetchPoolFromRaydium(poolIds.sol);
    if (solPool) {
      const pairName = getPairName(solPool);
      const liquidityUSD = solPool.tvl || 0;
      
      // Extract 24h volume: prefer volume24hUSD, fallback to day.volume (daily volume)
      // day.volume is the daily trading volume for the pool
      let volume24hUSD = solPool.volume24hUSD || 0;
      if (volume24hUSD === 0 && solPool.day?.volume) {
        volume24hUSD = solPool.day.volume;
      }

      pools.push({
        pair: pairName,
        liquidityUSD,
        volume24hUSD,
      });

      totalLiquidityUSD += liquidityUSD;
      totalVolume24hUSD += volume24hUSD;

      logger.debug('Fetched NUKE/SOL pool data', {
        poolId: poolIds.sol,
        pair: pairName,
        liquidityUSD,
        volume24hUSD,
        volumeSource: solPool.volume24hUSD ? 'volume24hUSD' : (solPool.day?.volume ? 'day.volume' : 'none'),
      });
    }
  }

  // Fetch NUKE/USDC pool if configured
  if (poolIds.usdc) {
    const usdcPool = await fetchPoolFromRaydium(poolIds.usdc);
    if (usdcPool) {
      const pairName = getPairName(usdcPool);
      const liquidityUSD = usdcPool.tvl || 0;
      
      // Extract 24h volume: prefer volume24hUSD, fallback to day.volume (daily volume)
      // day.volume is the daily trading volume for the pool
      let volume24hUSD = usdcPool.volume24hUSD || 0;
      if (volume24hUSD === 0 && usdcPool.day?.volume) {
        volume24hUSD = usdcPool.day.volume;
      }

      pools.push({
        pair: pairName,
        liquidityUSD,
        volume24hUSD,
      });

      totalLiquidityUSD += liquidityUSD;
      totalVolume24hUSD += volume24hUSD;

      logger.debug('Fetched NUKE/USDC pool data', {
        poolId: poolIds.usdc,
        pair: pairName,
        liquidityUSD,
        volume24hUSD,
        volumeSource: usdcPool.volume24hUSD ? 'volume24hUSD' : (usdcPool.day?.volume ? 'day.volume' : 'none'),
      });
    }
  }

  // Calculate summary
  const summary = {
    totalLiquidityUSD,
    volume24hUSD: totalVolume24hUSD,
    activePools: pools.length,
    treasuryPools: 0, // TODO: Determine treasury pools if needed
  };

  // Update cache
  cachedLiquidityData = {
    pools,
    summary,
    timestamp: now,
  };

  logger.info('Liquidity pool data fetched', {
    poolsCount: pools.length,
    totalLiquidityUSD,
    totalVolume24hUSD,
  });

  return { pools, summary };
}

/**
 * Clear liquidity cache (useful for testing)
 */
export function clearLiquidityCache(): void {
  cachedLiquidityData = null;
  logger.debug('Liquidity cache cleared');
}

