import { logger } from '../utils/logger';
import { tokenMint } from '../config/solana';
import { getRaydiumPriceUSD } from './raydiumService';

// Default fallback price if API fails (in USD per token)
const DEFAULT_NUKE_PRICE_USD = 0.01;

// Cache for price to avoid excessive API calls
let cachedPrice: number | null = null;
let priceCacheTimestamp: number = 0;
let priceSource: 'jupiter' | 'raydium' | 'fallback' = 'fallback';
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch NUKE token price in USD from Jupiter API
 * Falls back to default price if API fails
 */
async function fetchPriceFromJupiter(): Promise<number | null> {
  try {
    // Jupiter price API endpoint
    // For devnet tokens, we may need to use a different approach
    const jupiterPriceUrl = `https://price.jup.ag/v4/price?ids=${tokenMint.toBase58()}`;
    
    const response = await fetch(jupiterPriceUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Jupiter API returned status ${response.status}`);
    }

    const data = await response.json() as {
      data?: {
        [mint: string]: {
          price?: number;
        };
      };
    };
    
    // Jupiter API response structure: { data: { [mint]: { price: number } } }
    if (data.data && data.data[tokenMint.toBase58()]) {
      const price = data.data[tokenMint.toBase58()].price;
      if (typeof price === 'number' && price > 0) {
        return price;
      }
    }

    return null;
  } catch (error) {
    logger.debug('Failed to fetch price from Jupiter API', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Fetch NUKE token price using alternative method (Helius or direct lookup)
 * This is a placeholder for devnet tokens that may not be on Jupiter
 */
async function fetchPriceAlternative(): Promise<number | null> {
  try {
    // For devnet tokens, we can try Helius token metadata API
    // Or use a simple fallback mechanism
    // This is a placeholder - implement based on available APIs
    
    // For now, return null to use fallback
    return null;
  } catch (error) {
    logger.debug('Failed to fetch price from alternative source', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get NUKE token price in USD
 * Uses cached price if available and fresh
 * Falls back to default price if all APIs fail
 * Priority: Jupiter -> Raydium -> Fallback
 */
export async function getNUKEPriceUSD(): Promise<number> {
  try {
    // Check cache first
    const now = Date.now();
    if (cachedPrice !== null && (now - priceCacheTimestamp) < PRICE_CACHE_TTL) {
      logger.debug('Using cached NUKE price', {
        price: cachedPrice,
        source: priceSource,
        cachedAt: new Date(priceCacheTimestamp).toISOString(),
      });
      return cachedPrice;
    }

    // Try Jupiter API first
    let price = await fetchPriceFromJupiter();
    let source: 'jupiter' | 'raydium' | 'fallback' = 'jupiter';
    
    // If Jupiter fails, try Raydium
    if (price === null) {
      logger.debug('Jupiter price unavailable, trying Raydium');
      price = await getRaydiumPriceUSD();
      if (price !== null) {
        source = 'raydium';
      }
    }
    
    // If both fail, try alternative source (legacy)
    if (price === null) {
      price = await fetchPriceAlternative();
      if (price !== null) {
        source = 'jupiter'; // Assume alternative is Jupiter-like
      }
    }

    // If all APIs fail, use default fallback
    if (price === null) {
      logger.warn('All price APIs failed, using default fallback price', {
        defaultPrice: DEFAULT_NUKE_PRICE_USD,
        tokenMint: tokenMint.toBase58(),
      });
      price = DEFAULT_NUKE_PRICE_USD;
      source = 'fallback';
    }

    // Update cache
    cachedPrice = price;
    priceCacheTimestamp = now;
    priceSource = source;

    logger.info('NUKE token price fetched', {
      priceUSD: price,
      source,
      tokenMint: tokenMint.toBase58(),
    });

    return price;
  } catch (error) {
    logger.error('Error fetching NUKE price, using fallback', {
      error: error instanceof Error ? error.message : String(error),
      fallbackPrice: DEFAULT_NUKE_PRICE_USD,
    });
    
    // Return fallback price
    cachedPrice = DEFAULT_NUKE_PRICE_USD;
    priceCacheTimestamp = Date.now();
    priceSource = 'fallback';
    return DEFAULT_NUKE_PRICE_USD;
  }
}

/**
 * Get price source (jupiter, raydium, or fallback)
 */
export function getPriceSource(): 'jupiter' | 'raydium' | 'fallback' {
  return priceSource;
}

/**
 * Clear price cache (useful for testing or forced refresh)
 */
export function clearPriceCache(): void {
  cachedPrice = null;
  priceCacheTimestamp = 0;
  priceSource = 'fallback';
  logger.debug('Price cache cleared');
}

