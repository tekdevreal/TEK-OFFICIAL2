import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Cycle State
 * Each cycle must end in one of these states
 */
export enum CycleState {
  DISTRIBUTED = 'DISTRIBUTED', // Successful harvest + distribution
  ROLLED_OVER = 'ROLLED_OVER', // Minimum tax not met, carry tax forward
  FAILED = 'FAILED', // Unexpected error, safe to retry next cycle
}

/**
 * Cycle Result
 * Represents the outcome of a single cycle execution
 */
export interface CycleResult {
  epoch: string; // ISO date string (YYYY-MM-DD) in UTC
  cycleNumber: number; // 1-288
  state: CycleState;
  timestamp: number; // Unix timestamp in milliseconds
  error?: string; // Error message if FAILED
  taxResult?: {
    nukeHarvested: string;
    solToHolders: string;
    solToTreasury: string;
    distributedCount: number;
    swapSignature?: string;
  };
}

/**
 * Epoch State
 * Tracks all cycles for a single epoch (1 UTC day)
 */
export interface EpochState {
  epoch: string; // ISO date string (YYYY-MM-DD) in UTC
  cycles: CycleResult[];
  createdAt: number; // Unix timestamp in milliseconds
  updatedAt: number; // Unix timestamp in milliseconds
}

/**
 * Cycle Service State
 */
interface CycleServiceState {
  epochs: Record<string, EpochState>; // Key: epoch date string (YYYY-MM-DD)
  currentEpoch: string | null; // Current epoch date string
  currentCycleNumber: number; // Current cycle number (1-288)
  lastCycleTimestamp: number | null; // Last cycle execution timestamp
}

const STATE_FILE_PATH = path.join(process.cwd(), 'cycle-state.json');
const CYCLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CYCLES_PER_EPOCH = 288; // 24 hours * 60 minutes / 5 minutes

/**
 * Get current UTC date string (YYYY-MM-DD)
 */
function getCurrentEpoch(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get current cycle number (1-288) based on time of day in UTC
 */
function getCurrentCycleNumber(): number {
  const now = new Date();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  // Each cycle is 5 minutes, so cycle number = floor(totalMinutes / 5) + 1
  // Cycle 1 starts at 00:00 UTC, cycle 288 ends at 23:55 UTC
  const cycleNumber = Math.floor(totalMinutes / 5) + 1;
  return Math.min(cycleNumber, CYCLES_PER_EPOCH); // Cap at 288
}

/**
 * Check if we need to reset to a new epoch (crossed 00:00 UTC)
 */
function shouldResetEpoch(currentEpoch: string | null): boolean {
  if (currentEpoch === null) {
    return true; // First run
  }
  const nowEpoch = getCurrentEpoch();
  return nowEpoch !== currentEpoch;
}

/**
 * Load cycle service state from file
 */
function loadCycleState(): CycleServiceState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn('Failed to load cycle state, using defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    epochs: {},
    currentEpoch: null,
    currentCycleNumber: 1,
    lastCycleTimestamp: null,
  };
}

/**
 * Save cycle service state to file
 */
function saveCycleState(state: CycleServiceState): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    logger.error('Failed to save cycle state', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Initialize or reset epoch
 */
function initializeEpoch(state: CycleServiceState): void {
  const currentEpoch = getCurrentEpoch();
  const currentCycleNumber = getCurrentCycleNumber();

  // Check if we need to reset to a new epoch
  if (shouldResetEpoch(state.currentEpoch)) {
    logger.info('🔄 Epoch reset detected', {
      previousEpoch: state.currentEpoch,
      newEpoch: currentEpoch,
      cycleNumber: currentCycleNumber,
    });

    // Save previous epoch if it exists
    if (state.currentEpoch) {
      const previousEpochState = state.epochs[state.currentEpoch];
      if (previousEpochState) {
        previousEpochState.updatedAt = Date.now();
        state.epochs[state.currentEpoch] = previousEpochState;
      }
    }

    // Initialize new epoch
    state.currentEpoch = currentEpoch;
    state.currentCycleNumber = 1; // Reset to cycle 1 at epoch start

    // Create new epoch state if it doesn't exist
    if (!state.epochs[currentEpoch]) {
      state.epochs[currentEpoch] = {
        epoch: currentEpoch,
        cycles: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
  } else {
    // Same epoch, update cycle number
    state.currentCycleNumber = currentCycleNumber;
  }

  saveCycleState(state);
}

/**
 * Record cycle result
 */
export function recordCycleResult(result: CycleResult): void {
  try {
    const state = loadCycleState();
    
    // Initialize epoch if needed
    initializeEpoch(state);

    const currentEpoch = state.currentEpoch!;
    const epochState = state.epochs[currentEpoch];

    // Add cycle result
    epochState.cycles.push(result);
    epochState.updatedAt = Date.now();
    state.lastCycleTimestamp = result.timestamp;

    // Keep only last 288 cycles per epoch (one full day)
    if (epochState.cycles.length > CYCLES_PER_EPOCH) {
      epochState.cycles = epochState.cycles.slice(-CYCLES_PER_EPOCH);
    }

    // Keep only last 30 epochs in memory (30 days)
    const epochKeys = Object.keys(state.epochs).sort();
    if (epochKeys.length > 30) {
      const epochsToRemove = epochKeys.slice(0, epochKeys.length - 30);
      for (const epochKey of epochsToRemove) {
        delete state.epochs[epochKey];
      }
    }

    saveCycleState(state);

    logger.info('✅ Cycle result recorded', {
      epoch: result.epoch,
      cycleNumber: result.cycleNumber,
      state: result.state,
    });
  } catch (error) {
    logger.error('Failed to record cycle result', {
      error: error instanceof Error ? error.message : String(error),
      result,
    });
    throw error;
  }
}

/**
 * Get current epoch and cycle information
 */
export function getCurrentEpochInfo(): {
  epoch: string;
  cycleNumber: number;
  nextCycleIn: number; // Milliseconds until next cycle
} {
  const state = loadCycleState();
  initializeEpoch(state);

  const currentEpoch = state.currentEpoch!;
  const currentCycleNumber = state.currentCycleNumber;

  // Calculate time until next cycle
  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const currentCycleStartMinutes = (currentCycleNumber - 1) * 5;
  const nextCycleStartMinutes = currentCycleNumber * 5;
  
  let nextCycleIn: number;
  if (currentCycleNumber >= CYCLES_PER_EPOCH) {
    // Last cycle of the day (cycle 288), next cycle is at 00:00 UTC tomorrow
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    nextCycleIn = tomorrow.getTime() - now.getTime();
  } else {
    // Calculate time until next cycle start (next 5-minute boundary)
    const nextCycleStart = new Date(now);
    nextCycleStart.setUTCHours(0, 0, 0, 0);
    nextCycleStart.setUTCMinutes(nextCycleStartMinutes);
    nextCycleStart.setUTCSeconds(0, 0);
    
    const timeUntilNext = nextCycleStart.getTime() - now.getTime();
    
    // If next cycle start is in the past or very close, use 5 minutes from now
    if (timeUntilNext <= 0) {
      nextCycleIn = 5 * 60 * 1000; // 5 minutes in milliseconds
    } else {
      nextCycleIn = timeUntilNext;
    }
  }

  return {
    epoch: currentEpoch,
    cycleNumber: currentCycleNumber,
    nextCycleIn: Math.max(0, nextCycleIn),
  };
}

/**
 * Get epoch state
 */
export function getEpochState(epoch: string): EpochState | null {
  const state = loadCycleState();
  return state.epochs[epoch] || null;
}

/**
 * Get all epoch states
 */
export function getAllEpochStates(): EpochState[] {
  const state = loadCycleState();
  return Object.values(state.epochs).sort((a, b) => 
    b.epoch.localeCompare(a.epoch) // Newest first
  );
}

/**
 * Get cycle statistics for an epoch
 */
export function getEpochStatistics(epoch: string): {
  epoch: string;
  totalCycles: number;
  distributed: number;
  rolledOver: number;
  failed: number;
  cycles: CycleResult[];
} {
  const epochState = getEpochState(epoch);
  
  if (!epochState) {
    return {
      epoch,
      totalCycles: 0,
      distributed: 0,
      rolledOver: 0,
      failed: 0,
      cycles: [],
    };
  }

  const distributed = epochState.cycles.filter(c => c.state === CycleState.DISTRIBUTED).length;
  const rolledOver = epochState.cycles.filter(c => c.state === CycleState.ROLLED_OVER).length;
  const failed = epochState.cycles.filter(c => c.state === CycleState.FAILED).length;

  return {
    epoch,
    totalCycles: epochState.cycles.length,
    distributed,
    rolledOver,
    failed,
    cycles: epochState.cycles,
  };
}

