import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  HoldersResponse,
  RewardsResponse,
  PayoutsResponse,
  RewardCyclesResponse,
  HistoricalPayoutsResponse,
  ExportResponse,
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
  timeout: 30000, // 30 seconds timeout
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
    // Ensure holders array exists
    return {
      holders: response.data.holders || [],
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
        tokenPrice: { sol: null, usd: null, source: null },
        filtered: null,
      };
    }
    // Ensure tokenPrice exists in response
    const rewardsData = response.data;
    if (!rewardsData.tokenPrice) {
      rewardsData.tokenPrice = { sol: null, usd: null, source: null };
    }
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
      tokenPrice: { sol: null, usd: null, source: null },
      filtered: null,
    };
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
        limit: 100,
        summary: { pending: 0, failed: 0, totalSOL: 0 }
      };
    }
    // Ensure payouts array exists
    return {
      payouts: response.data.payouts || [],
      total: response.data.total || 0,
      limit: response.data.limit || 100,
      summary: response.data.summary || { pending: 0, failed: 0, totalSOL: 0 },
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
      limit: 100,
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

export default apiClient;
