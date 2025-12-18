/**
 * Professional data fetching hook with caching, deduplication, retry, and background refetch
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { dataCache, type CacheOptions } from '../services/dataCache';
import { requestQueue } from '../services/requestQueue';

export interface UseDataFetchingOptions<T> extends CacheOptions {
  enabled?: boolean; // Whether to fetch immediately
  refetchInterval?: number; // Auto-refetch interval (0 to disable)
  refetchOnWindowFocus?: boolean; // Refetch when window regains focus
  retry?: number; // Number of retries (default: 3)
  retryDelay?: number; // Delay between retries in ms (default: 1000)
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  staleTime?: number; // Time before data is considered stale
}

export interface UseDataFetchingResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  isStale: boolean;
  refetch: () => Promise<T | null>;
  invalidate: () => void;
}

/**
 * Professional data fetching hook
 */
export function useDataFetching<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: UseDataFetchingOptions<T> = {}
): UseDataFetchingResult<T> {
  const {
    enabled = true,
    refetchInterval = 0,
    refetchOnWindowFocus = false,
    retry = 3,
    retryDelay = 1000,
    onSuccess,
    onError,
    ttl,
    staleTime,
    ...cacheOptions
  } = options;

  const [data, setData] = useState<T | null>(() => {
    // Initialize with cached data if available
    return dataCache.getStale<T>(key);
  });

  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!data && enabled);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  const fetchCountRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Retry logic with exponential backoff
   */
  const fetchWithRetry = useCallback(
    async (attempt = 0): Promise<T> => {
      try {
        const result = await requestQueue.queue(
          key,
          () => fetchFn(),
          { throttle: attempt === 0 } // Only throttle first attempt
        );
        return result;
      } catch (err) {
        if (attempt < retry && err instanceof Error) {
          // Don't retry on 4xx errors (except 429)
          const isRetryable =
            !err.message.includes('400') &&
            !err.message.includes('401') &&
            !err.message.includes('403') &&
            !err.message.includes('404');

          if (isRetryable || err.message.includes('429')) {
            const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(attempt + 1);
          }
        }
        throw err;
      }
    },
    [key, fetchFn, retry, retryDelay]
  );

  /**
   * Fetch data
   */
  const fetchData = useCallback(
    async (isBackground = false): Promise<T | null> => {
      // Check cache first (stale-while-revalidate pattern)
      const cachedData = dataCache.getStale<T>(key);
      const isStale = cachedData ? dataCache.isStale(key) : true;

      // If we have fresh data and this is a background fetch, skip
      if (cachedData && !isStale && isBackground) {
        return cachedData;
      }

      // Set loading state only for initial fetch
      if (!isBackground) {
        setIsLoading(true);
      }
      setIsFetching(true);
      setError(null);

      fetchCountRef.current++;

      try {
        // If we have stale data, return it immediately and fetch in background
        if (cachedData && isStale && isBackground) {
          // Fetch in background without blocking
          fetchWithRetry()
            .then(result => {
              dataCache.set(key, result, { ttl, staleTime, ...cacheOptions });
              setData(result);
              onSuccess?.(result);
            })
            .catch(err => {
              console.error(`[useDataFetching] Background fetch error for ${key}:`, err);
            })
            .finally(() => {
              setIsFetching(false);
            });

          return cachedData;
        }

        // Fetch new data
        const result = await fetchWithRetry();

        // Update cache
        dataCache.set(key, result, { ttl, staleTime, ...cacheOptions });

        // Update state
        setData(result);
        setError(null);
        onSuccess?.(result);

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);

        // Return stale data if available on error
        if (cachedData) {
          return cachedData;
        }

        return null;
      } finally {
        setIsLoading(false);
        setIsFetching(false);
      }
    },
    [key, fetchFn, fetchWithRetry, ttl, staleTime, cacheOptions, onSuccess, onError]
  );

  /**
   * Refetch data
   */
  const refetch = useCallback(async (): Promise<T | null> => {
    // Invalidate cache to force fresh fetch
    dataCache.invalidate(key);
    return fetchData(false);
  }, [key, fetchData]);

  /**
   * Invalidate cache
   */
  const invalidate = useCallback(() => {
    dataCache.invalidate(key);
    setData(null);
  }, [key]);

  // Initial fetch
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Check if we have fresh cached data
    const cachedData = dataCache.get<T>(key);
    if (cachedData) {
      setData(cachedData);
      setIsLoading(false);
      // Still fetch in background if stale
      if (dataCache.isStale(key)) {
        fetchData(true);
      }
    } else {
      fetchData(false);
    }
  }, [enabled, key]); // Only run on mount or when key/enabled changes

  // Auto-refetch interval
  useEffect(() => {
    if (refetchInterval > 0 && enabled) {
      intervalRef.current = setInterval(() => {
        // Only refetch if data is stale or expired
        if (dataCache.isStale(key) || !dataCache.get(key)) {
          fetchData(true);
        }
      }, refetchInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [refetchInterval, enabled, key, fetchData]);

  // Refetch on window focus
  useEffect(() => {
    if (!refetchOnWindowFocus || !enabled) {
      return;
    }

    const handleFocus = () => {
      if (dataCache.isStale(key)) {
        fetchData(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetchOnWindowFocus, enabled, key, fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const isStale = data ? dataCache.isStale(key) : false;

  return {
    data,
    error,
    isLoading,
    isFetching,
    isStale,
    refetch,
    invalidate,
  };
}

/**
 * Helper hook for query-like pattern
 */
export function useQuery<T>(
  queryKey: string | [string, ...any[]],
  queryFn: () => Promise<T>,
  options?: UseDataFetchingOptions<T>
): UseDataFetchingResult<T> {
  const key = Array.isArray(queryKey) ? queryKey.join(':') : queryKey;
  return useDataFetching(key, queryFn, options);
}

