/**
 * Notification State Management
 * 
 * Persists notification state to prevent duplicate notifications.
 * Tracks last reward run timestamp and last payout ID.
 * 
 * Safety: All file operations are wrapped in try/catch to prevent crashes.
 */

import * as fs from 'fs';
import * as path from 'path';

interface NotificationState {
  lastRewardRunId?: string;
  lastPayoutId?: string;
  lastSwapTx?: string; // Legacy: Track last swap transaction (deprecated in favor of lastDistributionTime)
  lastDistributionTime?: number; // Track last distribution timestamp to prevent duplicate notifications (handles batch splitting correctly)
  lastDistributionHash?: string; // Hash of distribution data to detect true duplicates even if timestamp changes
}

class NotificationStateManager {
  private stateFile: string;
  private dataDir: string;

  constructor() {
    // Determine data directory (relative to project root)
    this.dataDir = path.join(process.cwd(), 'data');
    this.stateFile = path.join(this.dataDir, 'notification-state.json');

    // Ensure data directory exists
    this.ensureDataDirectory();
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDirectory(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    } catch (error) {
      // Silently fail - we'll handle this in getLastState
      console.warn('[NotificationState] Failed to create data directory:', error);
    }
  }

  /**
   * Get last notification state
   */
  getLastState(): NotificationState {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return {};
      }

      const fileContent = fs.readFileSync(this.stateFile, 'utf-8');
      const state = JSON.parse(fileContent) as NotificationState;

      // Validate state structure
      if (typeof state !== 'object' || state === null) {
        console.warn('[NotificationState] Invalid state file, resetting');
        return {};
      }

      return {
        lastRewardRunId: typeof state.lastRewardRunId === 'string' 
          ? state.lastRewardRunId 
          : undefined,
        lastPayoutId: typeof state.lastPayoutId === 'string' 
          ? state.lastPayoutId 
          : undefined,
        lastSwapTx: typeof state.lastSwapTx === 'string'
          ? state.lastSwapTx
          : undefined,
        lastDistributionTime: typeof state.lastDistributionTime === 'number'
          ? state.lastDistributionTime
          : undefined,
        lastDistributionHash: typeof state.lastDistributionHash === 'string'
          ? state.lastDistributionHash
          : undefined,
      };
    } catch (error) {
      // On corruption or read error, return empty state
      console.warn('[NotificationState] Failed to read state file, resetting:', error);
      return {};
    }
  }

  /**
   * Update notification state
   */
  updateState(partialState: Partial<NotificationState>): void {
    try {
      // Get current state
      const currentState = this.getLastState();

      // Merge with new state
      const newState: NotificationState = {
        ...currentState,
        ...partialState,
      };

      // Ensure data directory exists (in case it was deleted)
      this.ensureDataDirectory();

      // Write to file atomically (write to temp file, then rename)
      const tempFile = `${this.stateFile}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(newState, null, 2), { encoding: 'utf-8' });
      fs.renameSync(tempFile, this.stateFile);
    } catch (error) {
      // Never crash - just warn
      console.warn('[NotificationState] Failed to update state:', error);
    }
  }

  /**
   * Reset state (for testing or recovery)
   */
  resetState(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        fs.unlinkSync(this.stateFile);
      }
    } catch (error) {
      console.warn('[NotificationState] Failed to reset state:', error);
    }
  }
}

// Export singleton instance
const stateManager = new NotificationStateManager();

/**
 * Get last notification state
 */
export function getLastState(): NotificationState {
  return stateManager.getLastState();
}

/**
 * Update notification state
 */
export function updateState(partialState: Partial<NotificationState>): void {
  stateManager.updateState(partialState);
}

/**
 * Reset notification state (for testing)
 */
export function resetState(): void {
  stateManager.resetState();
}

export default stateManager;

