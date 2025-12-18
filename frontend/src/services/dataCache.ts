/**
 * Professional data cache service with TTL, stale-while-revalidate, and memory management
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  staleAt: number;
  key: string;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds (default: 5 minutes)
  staleTime?: number; // Time before data is considered stale (default: 2.5 minutes)
  maxSize?: number; // Maximum number of entries (default: 100)
}

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  ttl: 5 * 60 * 1000, // 5 minutes
  staleTime: 2.5 * 60 * 1000, // 2.5 minutes
  maxSize: 100,
};

class DataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private options: Required<CacheOptions>;

  constructor(options: CacheOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Get data from cache if it exists and is not expired
   * Returns null if cache miss or expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();

    // Check if expired
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Get data from cache even if stale (for stale-while-revalidate pattern)
   * Returns null only if cache miss or expired
   */
  getStale<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();

    // Only return null if fully expired
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Check if data is stale (but not expired)
   */
  isStale(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return true;
    }

    const now = Date.now();
    return now > entry.staleAt && now <= entry.expiresAt;
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, options?: Partial<CacheOptions>): void {
    const now = Date.now();
    const ttl = options?.ttl ?? this.options.ttl;
    const staleTime = options?.staleTime ?? this.options.staleTime;

    // Enforce max size
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + ttl,
      staleAt: now + staleTime,
      key,
    };

    this.cache.set(key, entry);
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let staleCount = 0;
    let expiredCount = 0;
    let freshCount = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      } else if (now > entry.staleAt) {
        staleCount++;
      } else {
        freshCount++;
      }
    }

    return {
      total: this.cache.size,
      fresh: freshCount,
      stale: staleCount,
      expired: expiredCount,
      maxSize: this.options.maxSize,
    };
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict the oldest entry (LRU-like)
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

// Singleton instance
export const dataCache = new DataCache({
  ttl: 5 * 60 * 1000, // 5 minutes default
  staleTime: 2.5 * 60 * 1000, // 2.5 minutes before stale
  maxSize: 100,
});

/**
 * Generate cache key from endpoint and params
 */
export function generateCacheKey(endpoint: string, params?: Record<string, any>): string {
  if (!params || Object.keys(params).length === 0) {
    return endpoint;
  }

  // Sort params for consistent keys
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${JSON.stringify(params[key])}`)
    .join('&');

  return `${endpoint}?${sortedParams}`;
}

