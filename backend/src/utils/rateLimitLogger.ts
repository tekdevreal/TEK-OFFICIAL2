/**
 * Rate limit logger with message limiting and circuit breaker
 * Limits duplicate error messages to prevent log spam
 */

interface LogEntry {
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

class RateLimitLogger {
  private logEntries: Map<string, LogEntry> = new Map();
  private readonly maxLogsPerMessage = 3;
  private readonly messageWindow = 60 * 1000; // 1 minute window
  private readonly circuitBreakerThreshold = 5; // Open circuit after 5 rate limit errors
  private readonly circuitBreakerTimeout = 5 * 60 * 1000; // 5 minutes before trying again
  private circuitBreakerOpen = false;
  private circuitBreakerOpenedAt: number = 0;

  /**
   * Log a rate limit error (limited to 3 times)
   */
  logRateLimit(message: string, context?: Record<string, any>): void {
    const key = this.getMessageKey(message, context);
    const now = Date.now();
    const entry = this.logEntries.get(key);

    if (entry) {
      // Check if message window has expired
      if (now - entry.firstSeen > this.messageWindow) {
        // Reset counter
        entry.count = 1;
        entry.firstSeen = now;
        entry.lastSeen = now;
        this.logEntries.set(key, entry);
        this.logMessage(message, context, 1);
        return;
      }

      // Increment count
      entry.count++;
      entry.lastSeen = now;

      // Only log if under limit
      if (entry.count <= this.maxLogsPerMessage) {
        this.logMessage(message, context, entry.count);
      } else if (entry.count === this.maxLogsPerMessage + 1) {
        // Log suppression message once
        console.warn(`[RateLimitLogger] Suppressing further "${message}" messages (logged ${this.maxLogsPerMessage} times)`);
      }
    } else {
      // New message
      this.logEntries.set(key, {
        message,
        count: 1,
        firstSeen: now,
        lastSeen: now,
      });
      this.logMessage(message, context, 1);
    }

    // Clean up old entries
    this.cleanup();
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreakerOpen) {
      return false;
    }

    const now = Date.now();
    if (now - this.circuitBreakerOpenedAt > this.circuitBreakerTimeout) {
      // Circuit breaker timeout expired, allow requests again
      this.circuitBreakerOpen = false;
      console.log('[RateLimitLogger] Circuit breaker closed - allowing requests again');
      return false;
    }

    return true;
  }

  /**
   * Record a rate limit error for circuit breaker
   */
  recordRateLimitError(): void {
    // Count rate limit errors in recent window
    const recentErrors = Array.from(this.logEntries.values())
      .filter(entry => entry.message.includes('429') || entry.message.includes('rate limit'))
      .filter(entry => Date.now() - entry.firstSeen < this.messageWindow)
      .reduce((sum, entry) => sum + entry.count, 0);

    if (recentErrors >= this.circuitBreakerThreshold && !this.circuitBreakerOpen) {
      this.circuitBreakerOpen = true;
      this.circuitBreakerOpenedAt = Date.now();
      console.warn(`[RateLimitLogger] Circuit breaker OPENED - too many rate limit errors (${recentErrors}). Will retry after ${this.circuitBreakerTimeout / 1000}s`);
    }
  }

  /**
   * Get summary of rate limit issues
   */
  getSummary(): {
    totalMessages: number;
    suppressedMessages: number;
    circuitBreakerOpen: boolean;
    topErrors: Array<{ message: string; count: number }>;
  } {
    const entries = Array.from(this.logEntries.values());
    const suppressed = entries.filter(e => e.count > this.maxLogsPerMessage).length;
    const topErrors = entries
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(e => ({ message: e.message, count: e.count }));

    return {
      totalMessages: entries.length,
      suppressedMessages: suppressed,
      circuitBreakerOpen: this.circuitBreakerOpen,
      topErrors,
    };
  }

  /**
   * Reset all logs
   */
  reset(): void {
    this.logEntries.clear();
    this.circuitBreakerOpen = false;
    this.circuitBreakerOpenedAt = 0;
  }

  private logMessage(message: string, context: Record<string, any> | undefined, count: number): void {
    const prefix = count > 1 ? `[${count}x] ` : '';
    if (context) {
      console.warn(`${prefix}${message}`, context);
    } else {
      console.warn(`${prefix}${message}`);
    }
  }

  private getMessageKey(message: string, context?: Record<string, any>): string {
    if (context) {
      // Create key from message + relevant context
      const contextKey = Object.keys(context)
        .sort()
        .map(k => `${k}:${context[k]}`)
        .join('|');
      return `${message}|${contextKey}`;
    }
    return message;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.logEntries.entries()) {
      // Remove entries older than message window
      if (now - entry.lastSeen > this.messageWindow) {
        this.logEntries.delete(key);
      }
    }
  }
}

export const rateLimitLogger = new RateLimitLogger();

/**
 * Suppress Solana web3.js retry messages
 */
let originalConsoleLog: typeof console.log;
let retryMessageCount = 0;
const MAX_RETRY_MESSAGES = 3;

export function suppressSolanaRetryMessages(): void {
  if (originalConsoleLog) {
    return; // Already suppressed
  }

  originalConsoleLog = console.log;
  console.log = (...args: any[]) => {
    const message = args.join(' ');
    
    // Suppress Solana retry messages
    if (message.includes('Server responded with 429') && message.includes('Retrying after')) {
      retryMessageCount++;
      if (retryMessageCount <= MAX_RETRY_MESSAGES) {
        originalConsoleLog(...args);
      } else if (retryMessageCount === MAX_RETRY_MESSAGES + 1) {
        originalConsoleLog('[Solana] Suppressing further 429 retry messages (logged', MAX_RETRY_MESSAGES, 'times)');
      }
      return;
    }

    // Allow all other messages
    originalConsoleLog(...args);
  };
}

export function restoreConsoleLog(): void {
  if (originalConsoleLog) {
    console.log = originalConsoleLog;
    originalConsoleLog = undefined as any;
    retryMessageCount = 0;
  }
}

