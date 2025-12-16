import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, getAccount } from '@solana/spl-token';
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
const RAYDIUM_CACHE_TTL = 60 * 1000; // 60 seconds

// SOL price in USD (fallback if we can't fetch)
const DEFAULT_SOL_PRICE_USD = 100;

/**
 * Fetch SOL price in USD (using Jupiter or fallback)
 */
async function getSOLPriceUSD(): Promise<number> {
  try {
    // Try Jupiter for SOL price
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
    const [baseVaultAccount, quoteVaultAccount] = await Promise.all([
      getAccount(conn, tokenAVault).catch(() => null),
      getAccount(conn, tokenBVault).catch(() => null),
    ]);

    if (!baseVaultAccount || !quoteVaultAccount) {
      logger.warn('Failed to fetch Raydium vault accounts', {
        tokenAVault: tokenAVault.toBase58(),
        tokenBVault: tokenBVault.toBase58(),
      });
      return null;
    }

    // Determine which vault is base and which is quote
    // Check mint addresses to determine order
    const baseMintInfo = await getMint(conn, baseVaultAccount.mint);
    const quoteMintInfo = await getMint(conn, quoteVaultAccount.mint);

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
 * Get Raydium price and liquidity data
 * Returns cached data if available and fresh
 */
export async function getRaydiumData(): Promise<{
  price: number | null;
  liquidityUSD: number | null;
  baseVaultBalance: bigint;
  quoteVaultBalance: bigint;
  source: 'raydium' | null;
  updatedAt: string;
}> {
  try {
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

    // Calculate price: WSOL per NUKE
    // price = quoteVaultBalance / baseVaultBalance (adjusted for decimals)
    const baseAmount = Number(poolData.baseVaultBalance) / Math.pow(10, poolData.baseDecimals);
    const quoteAmount = Number(poolData.quoteVaultBalance) / Math.pow(10, poolData.quoteDecimals);
    
    let price: number | null = null;
    if (baseAmount > 0) {
      price = quoteAmount / baseAmount; // WSOL per NUKE
    }

    // Calculate liquidity in USD
    // liquidity = 2 * (quoteAmount * SOL_PRICE_USD) (both sides of the pool)
    const solPriceUSD = await getSOLPriceUSD();
    const liquidityUSD = price !== null ? 2 * quoteAmount * solPriceUSD : null;

    // Update cache
    cachedRaydiumData = {
      price,
      liquidityUSD,
      baseVaultBalance: poolData.baseVaultBalance,
      quoteVaultBalance: poolData.quoteVaultBalance,
      timestamp: now,
      source: 'raydium',
    };

    logger.info('Raydium data fetched', {
      price,
      liquidityUSD,
      baseVaultBalance: poolData.baseVaultBalance.toString(),
      quoteVaultBalance: poolData.quoteVaultBalance.toString(),
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
    logger.error('Error fetching Raydium data', {
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Return null data
    const now = Date.now();
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
}

/**
 * Get Raydium price in USD (converts WSOL price to USD)
 */
export async function getRaydiumPriceUSD(): Promise<number | null> {
  try {
    const raydiumData = await getRaydiumData();
    if (!raydiumData.price || raydiumData.source !== 'raydium') {
      return null;
    }

    // Convert WSOL per NUKE to USD per NUKE
    const solPriceUSD = await getSOLPriceUSD();
    return raydiumData.price * solPriceUSD;
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

