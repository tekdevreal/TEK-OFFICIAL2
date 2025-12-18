/**
 * Request queue service for deduplication, throttling, and request management
 */

export interface QueuedRequest<T> {
  key: string;
  promise: Promise<T>;
  timestamp: number;
  resolve: (value: T) => void;
  reject: (error: any) => void;
}

class RequestQueue {
  private pendingRequests: Map<string, QueuedRequest<any>> = new Map();
  private requestHistory: Map<string, number> = new Map();
  private readonly throttleDelay: number = 1000; // 1 second between same requests
  private readonly maxConcurrent: number = 10; // Max concurrent different requests

  /**
   * Queue a request with deduplication
   * If the same request is already pending, returns the existing promise
   */
  async queue<T>(
    key: string,
    requestFn: () => Promise<T>,
    options?: { throttle?: boolean }
  ): Promise<T> {
    // Check if request is already pending
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending.promise;
    }

    // Check throttle
    if (options?.throttle !== false) {
      const lastRequest = this.requestHistory.get(key);
      const now = Date.now();
      if (lastRequest && now - lastRequest < this.throttleDelay) {
        // Wait for throttle delay
        await new Promise(resolve => setTimeout(resolve, this.throttleDelay - (now - lastRequest)));
      }
    }

    // Check max concurrent
    if (this.pendingRequests.size >= this.maxConcurrent) {
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.queue(key, requestFn, options);
    }

    // Create new request
    let resolve!: (value: T) => void;
    let reject!: (error: any) => void;

    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const queuedRequest: QueuedRequest<T> = {
      key,
      promise,
      timestamp: Date.now(),
      resolve,
      reject,
    };

    this.pendingRequests.set(key, queuedRequest);
    this.requestHistory.set(key, Date.now());

    // Execute request
    requestFn()
      .then(result => {
        resolve(result);
        this.pendingRequests.delete(key);
      })
      .catch(error => {
        reject(error);
        this.pendingRequests.delete(key);
      });

    return promise;
  }

  /**
   * Cancel a pending request
   */
  cancel(key: string): void {
    const request = this.pendingRequests.get(key);
    if (request) {
      request.reject(new Error('Request cancelled'));
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Cancel all pending requests
   */
  cancelAll(): void {
    for (const request of this.pendingRequests.values()) {
      request.reject(new Error('All requests cancelled'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Get pending request count
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Check if a request is pending
   */
  isPending(key: string): boolean {
    return this.pendingRequests.has(key);
  }
}

// Singleton instance
export const requestQueue = new RequestQueue();

