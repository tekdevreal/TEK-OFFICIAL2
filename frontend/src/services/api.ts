import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  HoldersResponse,
  RewardsResponse,
  PayoutsResponse,
  RewardCyclesResponse,
  HistoricalPayoutsResponse,
  ExportResponse,
  LiquidityPoolsResponse,
  LiquiditySummaryResponse,
  TreasuryBalanceResponse,
  SolPriceResponse,
  CurrentCycleInfo,
  EpochCycleResponse,
  EpochsResponse,
} from '../types/api';

// Production check
const isProduction = import.meta.env.PROD;
const isDevelopment = import.meta.env.DEV;

// API base URL - ONLY from VITE_API_BASE_URL (no fallbacks in production)
const BACKEND_URL_RAW = import.meta.env.VITE_API_BASE_URL;

// Runtime safety check: throw error if missing in production
if (!BACKEND_URL_RAW || BACKEND_URL_RAW === '') {
  const errorMessage = '[API] CRITICAL: VITE_API_BASE_URL is not configured. Backend unavailable.';
  console.error(errorMessage);
  if (isProduction) {
    // In production, prevent the app from making requests
    throw new Error('Backend API URL is not configured. Please set VITE_API_BASE_URL in .env.production');
  }
  // In development, warn but allow localhost fallback
  console.warn('[API] Development mode: Using localhost fallback. Set VITE_API_BASE_URL to avoid this warning.');
}

// Normalize URL: remove trailing slash and ensure proper format
function normalizeBackendURL(url: string | undefined): string {
  if (!url) {
    // Only allow localhost fallback in development
    if (isDevelopment) {
      return 'http://localhost:3000';
    }
    throw new Error('VITE_API_BASE_URL is required in production');
  }
  
  // Remove trailing slash
  const normalized = url.trim().replace(/\/+$/, '');
  
  // Validate URL format
  try {
    new URL(normalized);
    return normalized;
  } catch {
    throw new Error(`Invalid VITE_API_BASE_URL format: ${url}`);
  }
}

const BACKEND_URL = normalizeBackendURL(BACKEND_URL_RAW);

// Log backend URL only in development
if (isDevelopment) {
  console.log('[API] Backend URL configured:', BACKEND_URL);
  console.log('[API] Environment:', {
    mode: import.meta.env.MODE,
    prod: isProduction,
    dev: isDevelopment,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  });
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second base delay

/**
 * Retry function with exponential backoff
 */
async function retryRequest<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && axios.isAxiosError(error)) {
      // Only retry on network errors or 5xx errors
      const shouldRetry = 
        !error.response || // Network error
        (error.response.status >= 500 && error.response.status < 600); // Server error

      if (shouldRetry) {
        if (isDevelopment) {
          console.warn(`[API] Retrying request (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryRequest(fn, retries - 1, delay * 2); // Exponential backoff
      }
    }
    throw error;
  }
}

// Create axios instance with production-safe configuration
const apiClient: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 60000, // 60 seconds timeout (increased for rate-limited endpoints)
  headers: {
    'Content-Type': 'application/json',
  },
  // CORS-safe: no credentials unless explicitly needed
  withCredentials: false,
});

// Request interceptor for logging (dev only)
apiClient.interceptors.request.use(
  (config) => {
    if (isDevelopment) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    }
    return config;
  },
  (error) => {
    // Always log errors, but less verbose in production
    if (isDevelopment) {
      console.error('[API] Request error:', error);
    } else {
      console.error('[API] Request failed');
    }
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    // In production, log minimal error info
    if (isProduction) {
      const status = error.response?.status;
      const message = error.message || 'Request failed';
      console.error(`[API] Error: ${message}${status ? ` (${status})` : ''}`);
      
      // Only log CORS errors in production (they're critical)
      if (error.code === 'ERR_NETWORK' || error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        console.error('[API] Network/CORS error - Backend may be unavailable');
      }
    } else {
      // In development, log detailed error information
      const errorDetails = {
        message: error.message || 'Unknown error',
        code: error.code || 'NO_CODE',
        status: error.response?.status || 'NO_STATUS',
        statusText: error.response?.statusText || 'NO_STATUS_TEXT',
        url: `${error.config?.baseURL || ''}${error.config?.url || ''}`,
      };
      
      console.error('[API] Response error details:', errorDetails);
      
      // Log CORS errors with troubleshooting tips
      if (error.code === 'ERR_NETWORK' || error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        console.error('[API] ⚠️ CORS or network error detected!');
        console.error('[API] Backend URL:', BACKEND_URL);
        console.error('[API] Troubleshooting:');
        console.error('  1. Is backend running? Check: curl', BACKEND_URL + '/health');
        console.error('  2. Is CORS enabled? Check backend/src/server.ts');
        console.error('  3. Restart backend after CORS changes');
        console.error('  4. Clear browser cache (Ctrl+Shift+R)');
      }
    }
    
    return Promise.reject(error);
  }
);

/**
 * Fetch holders with optional filters
 */
export async function fetchHolders(params?: {
  eligibleOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<HoldersResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<HoldersResponse>('/dashboard/holders', { params })
    );
    // Validate and provide fallback
    if (!response || !response.data) {
      if (isDevelopment) {
        console.warn('[API] Invalid holders response structure, using fallback');
      }
      return { holders: [], total: 0, limit: 1000, offset: 0, hasMore: false };
    }
    // Ensure holders array exists and validate each holder
    const holders = (response.data.holders || []).map(holder => {
      // Defensive check: ensure holder is a valid object with all required fields
      if (!holder || typeof holder !== 'object') {
        return null;
      }
      return {
        pubkey: holder.pubkey || '',
        balance: holder.balance || '0',
        usdValue: (holder.usdValue !== null && holder.usdValue !== undefined && !isNaN(holder.usdValue))
          ? Number(holder.usdValue)
          : 0,
        eligibilityStatus: holder.eligibilityStatus || 'excluded',
        lastReward: holder.lastReward || null,
        retryCount: holder.retryCount || 0,
      };
    }).filter(holder => holder !== null); // Remove any null holders
    
    return {
      holders,
      total: response.data.total || 0,
      limit: response.data.limit || 1000,
      offset: response.data.offset || 0,
      hasMore: response.data.hasMore || false,
    };
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching holders:', {
        response: error.response?.data || null,
        request: error.request ? 'Request made' : 'No request',
        message: error.message || 'Unknown error',
        status: error.response?.status || null,
      });
    } else {
      console.error('[API] Error fetching holders');
    }
    // Return fallback data instead of throwing
    return { holders: [], total: 0, limit: 1000, offset: 0, hasMore: false };
  }
}

/**
 * Fetch reward summary
 */
export async function fetchRewards(pubkey?: string): Promise<RewardsResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<RewardsResponse>('/dashboard/rewards', {
        params: pubkey ? { pubkey } : undefined,
      })
    );
    // Validate response structure
    if (!response || !response.data) {
      if (isDevelopment) {
        console.warn('[API] Invalid rewards response structure, using fallback');
      }
      return {
        lastRun: null,
        nextRun: null,
        isRunning: false,
        statistics: {
          totalHolders: 0,
          eligibleHolders: 0,
          excludedHolders: 0,
          blacklistedHolders: 0,
          pendingPayouts: 0,
          totalSOLDistributed: 0,
        },
        tokenPrice: {
          sol: null,
          usd: null,
          source: null,
        },
        dex: null,
        filtered: null,
      };
    }
    // Normalize tokenPrice and dex fields to always be present and safe
    const rewardsData: RewardsResponse = {
      ...response.data,
      tokenPrice: {
        sol:
          response.data.tokenPrice && typeof response.data.tokenPrice.sol === 'number'
            ? response.data.tokenPrice.sol
            : null,
        usd:
          response.data.tokenPrice && typeof response.data.tokenPrice.usd === 'number'
            ? response.data.tokenPrice.usd
            : null,
        source: response.data.tokenPrice?.source ?? null,
      },
      dex: response.data.dex
        ? {
            name: response.data.dex.name || 'raydium',
            price:
              typeof response.data.dex.price === 'number' && !isNaN(response.data.dex.price)
                ? response.data.dex.price
                : null,
            source: response.data.dex.source ?? null,
            updatedAt: response.data.dex.updatedAt ?? null,
          }
        : null,
    };
    return rewardsData;
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching rewards:', {
        response: error.response?.data || null,
        request: error.request ? 'Request made' : 'No request',
        message: error.message || 'Unknown error',
        status: error.response?.status || null,
      });
    } else {
      console.error('[API] Error fetching rewards');
    }
    // Return fallback data instead of throwing
    return {
      lastRun: null,
      nextRun: null,
      isRunning: false,
      statistics: {
        totalHolders: 0,
        eligibleHolders: 0,
        excludedHolders: 0,
        blacklistedHolders: 0,
        pendingPayouts: 0,
        totalSOLDistributed: 0,
      },
      tokenPrice: {
        sol: null,
        usd: null,
        source: null,
      },
      dex: null,
      filtered: null,
    } as RewardsResponse;
  }
}

/**
 * Fetch pending payouts
 */
export async function fetchPayouts(params?: {
  pubkey?: string;
  status?: 'pending' | 'failed';
  limit?: number;
}): Promise<PayoutsResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<PayoutsResponse>('/dashboard/payouts', { params })
    );
    // Validate and provide fallback
    if (!response || !response.data) {
      if (isDevelopment) {
        console.warn('[API] Invalid payouts response structure, using fallback');
      }
      return { 
        payouts: [], 
        total: 0, 
        limit: params?.limit || 100,
        hasMore: false,
        summary: { pending: 0, failed: 0, totalSOL: 0 }
      };
    }
    // Ensure payouts array and summary exist
    const payoutsData = response.data;
    return {
      payouts: payoutsData.payouts || [],
      total: payoutsData.total || 0,
      limit: payoutsData.limit || (params?.limit || 100),
      hasMore: payoutsData.hasMore || false,
      summary: payoutsData.summary || { pending: 0, failed: 0, totalSOL: 0 },
    };
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching payouts:', {
        response: error.response?.data || null,
        request: error.request ? 'Request made' : 'No request',
        message: error.message || 'Unknown error',
        status: error.response?.status || null,
      });
    } else {
      console.error('[API] Error fetching payouts');
    }
    // Return fallback data instead of throwing
    return { 
      payouts: [], 
      total: 0, 
      limit: params?.limit || 100,
      hasMore: false,
      summary: { pending: 0, failed: 0, totalSOL: 0 }
    };
  }
}

/**
 * Fetch historical reward cycles
 */
export async function fetchHistoricalRewards(params?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<RewardCyclesResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<RewardCyclesResponse>('/dashboard/historical/rewards', { params })
    );
    // Validate and provide fallback
    if (!response || !response.data) {
      if (isDevelopment) {
        console.warn('[API] Invalid historical rewards response structure, using fallback');
      }
      return { cycles: [], total: 0, limit: 100, offset: 0, hasMore: false };
    }
    return {
      cycles: response.data.cycles || [],
      total: response.data.total || 0,
      limit: response.data.limit || 100,
      offset: response.data.offset || 0,
      hasMore: response.data.hasMore || false,
    };
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching historical rewards:', {
        response: error.response?.data || null,
        request: error.request ? 'Request made' : 'No request',
        message: error.message || 'Unknown error',
        status: error.response?.status || null,
      });
    } else {
      console.error('[API] Error fetching historical rewards');
    }
    // Return fallback data instead of throwing
    return { cycles: [], total: 0, limit: 100, offset: 0, hasMore: false };
  }
}

/**
 * Fetch historical payouts
 */
export async function fetchHistoricalPayouts(params?: {
  startDate?: string;
  endDate?: string;
  pubkey?: string;
  status?: 'pending' | 'failed' | 'success';
  limit?: number;
  offset?: number;
}): Promise<HistoricalPayoutsResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<HistoricalPayoutsResponse>('/dashboard/historical/payouts', { params })
    );
    // Validate and provide fallback
    if (!response || !response.data) {
      if (isDevelopment) {
        console.warn('[API] Invalid historical payouts response structure, using fallback');
      }
      return { payouts: [], total: 0, limit: 100, offset: 0, hasMore: false };
    }
    return {
      payouts: response.data.payouts || [],
      total: response.data.total || 0,
      limit: response.data.limit || 100,
      offset: response.data.offset || 0,
      hasMore: response.data.hasMore || false,
    };
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching historical payouts:', {
        response: error.response?.data || null,
        request: error.request ? 'Request made' : 'No request',
        message: error.message || 'Unknown error',
        status: error.response?.status || null,
      });
    } else {
      console.error('[API] Error fetching historical payouts');
    }
    // Return fallback data instead of throwing
    return { payouts: [], total: 0, limit: 100, offset: 0, hasMore: false };
  }
}

/**
 * Export reward cycles
 */
export async function exportRewards(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<ExportResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<ExportResponse>('/dashboard/export/rewards', { params })
    );
    return response.data;
  } catch (error) {
    if (isDevelopment) {
      console.error('[API] Error exporting rewards:', error);
    } else {
      console.error('[API] Error exporting rewards');
    }
    throw error;
  }
}

/**
 * Export payouts
 */
export async function exportPayouts(params?: {
  startDate?: string;
  endDate?: string;
  pubkey?: string;
  status?: 'pending' | 'failed' | 'success';
}): Promise<ExportResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<ExportResponse>('/dashboard/export/payouts', { params })
    );
    return response.data;
  } catch (error) {
    if (isDevelopment) {
      console.error('[API] Error exporting payouts:', error);
    } else {
      console.error('[API] Error exporting payouts');
    }
    throw error;
  }
}

/**
 * Fetch 24h DEX volume from Birdeye API or Raydium
 * Falls back to showing "N/A" if unavailable
 */
export async function fetchDexVolume24h(tokenAddress: string): Promise<number | null> {
  try {
    // Try Birdeye API first (requires API key)
    const birdeyeApiKey = import.meta.env.VITE_BIRDEYE_API_KEY;
    if (birdeyeApiKey) {
      try {
        const response = await axios.get(`https://public-api.birdeye.so/defi/token_overview`, {
          params: {
            address: tokenAddress,
          },
          headers: {
            'X-API-KEY': birdeyeApiKey,
          },
          timeout: 10000,
        });

        if (response.data?.data?.volume24h) {
          return response.data.data.volume24h;
        }
      } catch (birdeyeError) {
        if (isDevelopment) {
          console.warn('[API] Birdeye API failed, trying alternative:', birdeyeError);
        }
      }
    }

    // Fallback: Try Raydium API (if pool ID is available)
    // Note: Raydium API may not provide 24h volume directly
    // This is a placeholder for future implementation
    return null;
  } catch (error) {
    if (isDevelopment) {
      console.warn('[API] Could not fetch DEX volume 24h:', error);
    }
    return null;
  }
}

/**
 * Fetch liquidity pools data
 */
export async function fetchLiquidityPools(): Promise<LiquidityPoolsResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<LiquidityPoolsResponse>('/dashboard/liquidity/pools')
    );
    // Validate and provide fallback
    if (!response || !response.data) {
      if (isDevelopment) {
        console.warn('[API] Invalid liquidity pools response structure, using fallback');
      }
      return { pools: [] };
    }
    return {
      pools: response.data.pools || [],
    };
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching liquidity pools:', {
        response: error.response?.data || null,
        request: error.request ? 'Request made' : 'No request',
        message: error.message || 'Unknown error',
        status: error.response?.status || null,
      });
    } else {
      console.error('[API] Error fetching liquidity pools');
    }
    // Return fallback data instead of throwing
    return { pools: [] };
  }
}

/**
 * Fetch liquidity summary statistics
 */
export async function fetchLiquiditySummary(): Promise<LiquiditySummaryResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<LiquiditySummaryResponse>('/dashboard/liquidity/summary')
    );
    // Validate and provide fallback
    if (!response || !response.data) {
      if (isDevelopment) {
        console.warn('[API] Invalid liquidity summary response structure, using fallback');
      }
      return {
        totalLiquidityUSD: 0,
        volume24hUSD: 0,
        activePools: 0,
        treasuryPools: 0,
      };
    }
    return {
      totalLiquidityUSD: response.data.totalLiquidityUSD || 0,
      volume24hUSD: response.data.volume24hUSD || 0,
      activePools: response.data.activePools || 0,
      treasuryPools: response.data.treasuryPools || 0,
    };
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching liquidity summary:', {
        response: error.response?.data || null,
        request: error.request ? 'Request made' : 'No request',
        message: error.message || 'Unknown error',
        status: error.response?.status || null,
      });
    } else {
      console.error('[API] Error fetching liquidity summary');
    }
    // Return fallback data instead of throwing
    return {
      totalLiquidityUSD: 0,
      volume24hUSD: 0,
      activePools: 0,
      treasuryPools: 0,
    };
  }
}

/**
 * Fetch treasury wallet balance
 */
export async function fetchTreasuryBalance(address?: string): Promise<TreasuryBalanceResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<TreasuryBalanceResponse>('/dashboard/treasury/balance', {
        params: address ? { address } : undefined,
      })
    );
    // Validate and provide fallback
    if (!response || !response.data) {
      if (isDevelopment) {
        console.warn('[API] Invalid treasury balance response structure, using fallback');
      }
      return {
        address: address || '',
        balanceSOL: 0,
        balanceLamports: '0',
      };
    }
    return {
      address: response.data.address || address || '',
      balanceSOL: response.data.balanceSOL || 0,
      balanceLamports: response.data.balanceLamports || '0',
    };
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching treasury balance:', {
        response: error.response?.data || null,
        request: error.request ? 'Request made' : 'No request',
        message: error.message || 'Unknown error',
        status: error.response?.status || null,
      });
    } else {
      console.error('[API] Error fetching treasury balance');
    }
    // Return fallback data instead of throwing
    return {
      address: address || '',
      balanceSOL: 0,
      balanceLamports: '0',
    };
  }
}

/**
 * Fetch current SOL price in USD
 */
export async function fetchSolPrice(): Promise<SolPriceResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<SolPriceResponse>('/dashboard/sol-price')
    );
    return response.data;
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching SOL price:', error);
    }
    // Return fallback
    return {
      price: 100,
      source: 'fallback',
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Fetch current cycle information
 */
export async function fetchCurrentCycleInfo(): Promise<CurrentCycleInfo> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<CurrentCycleInfo>('/dashboard/cycles/current')
    );
    return response.data;
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching current cycle info:', error);
    }
    // Return fallback
    const now = new Date();
    const epoch = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    return {
      epoch,
      epochNumber: 1, // Fallback to epoch 1
      cycleNumber: 1,
      nextCycleIn: 5 * 60 * 1000,
      nextCycleInSeconds: 300,
      cyclesPerEpoch: 288,
    };
  }
}

/**
 * Fetch cycle data for a specific epoch
 */
export async function fetchEpochCycles(epoch?: string): Promise<EpochCycleResponse> {
  try {
    const url = epoch ? `/dashboard/cycles/epoch/${epoch}` : '/dashboard/cycles/epoch';
    const response = await retryRequest(() =>
      apiClient.get<EpochCycleResponse>(url)
    );
    return response.data;
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching epoch cycles:', error);
    }
    // Return fallback
    const now = new Date();
    const fallbackEpoch = epoch || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    return {
      epoch: fallbackEpoch,
      statistics: {
        epoch: fallbackEpoch,
        totalCycles: 0,
        distributed: 0,
        rolledOver: 0,
        failed: 0,
        cycles: [],
      },
      cycles: [],
      createdAt: null,
      updatedAt: null,
    };
  }
}

/**
 * Fetch all epochs with summary statistics
 */
export async function fetchEpochs(limit?: number): Promise<EpochsResponse> {
  try {
    const response = await retryRequest(() =>
      apiClient.get<EpochsResponse>('/dashboard/cycles/epochs', {
        params: limit ? { limit } : undefined,
      })
    );
    return response.data;
  } catch (error: any) {
    if (isDevelopment) {
      console.error('[API] Error fetching epochs:', error);
    }
    return {
      epochs: [],
      total: 0,
      limit: limit || 30,
    };
  }
}

export default apiClient;
