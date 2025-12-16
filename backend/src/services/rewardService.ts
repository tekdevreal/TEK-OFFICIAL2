import * as fs from 'fs';
import * as path from 'path';
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getTokenHolders, TokenHolder } from './solanaService';
import { connection } from '../config/solana';
import { REWARD_CONFIG } from '../config/constants';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { loadKeypairFromEnv } from '../utils/loadKeypairFromEnv';
import { isBlacklisted } from '../config/blacklist';
import { getNUKEPriceUSD } from './priceService';
import { saveHistoricalPayouts, type HistoricalPayout } from './rewardHistoryService';

export interface Holder {
  pubkey: string;
  balance: string;
  usdValue: number;
}

export interface Reward {
  pubkey: string;
  rewardSOL: number;
}

interface PendingPayout {
  pubkey: string;
  rewardSOL: number;
  queuedAt: number;
  retryCount: number;
}

interface RewardState {
  lastRewardRun: number | null;
  holderRewards: Record<string, number>; // holderPubkey -> lastRewardTimestamp
  retryCounts: Record<string, number>; // holderPubkey -> retryCount
  pendingPayouts: PendingPayout[]; // Queued rewards awaiting payout
}

const STATE_FILE_PATH = path.join(process.cwd(), 'reward-state.json');

/**
 * Load admin wallet keypair from JSON file
 */
let cachedAdminWallet: Keypair | null = null;

export function getAdminWallet(): Keypair {
  if (cachedAdminWallet) {
    return cachedAdminWallet;
  }

  // Use the helper utility for consistent keypair loading
  // ADMIN_WALLET_JSON is already a JSON string in env, so we use it directly
  try {
    if (!env.ADMIN_WALLET_JSON) {
      throw new Error('ADMIN_WALLET_JSON environment variable is not set');
    }

    let secretKey: Uint8Array;
    try {
      const parsed = JSON.parse(env.ADMIN_WALLET_JSON);
      secretKey = Uint8Array.from(parsed);
    } catch (parseError) {
      throw new Error('ADMIN_WALLET_JSON is not valid JSON');
    }

    cachedAdminWallet = Keypair.fromSecretKey(secretKey);
    
    // Only log public key (never log secret keys)
    logger.info('Admin wallet loaded', {
      pubkey: cachedAdminWallet.publicKey.toBase58(),
      source: 'ADMIN_WALLET_JSON',
    });

    return cachedAdminWallet;
  } catch (error) {
    logger.error('Failed to load admin wallet', {
      error: error instanceof Error ? error.message : String(error),
      source: 'ADMIN_WALLET_JSON',
    });
    throw error;
  }
}

/**
 * Load reward state from file
 */
function loadState(): RewardState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn('Failed to load reward state, using defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  
  return {
    lastRewardRun: null,
    holderRewards: {},
    retryCounts: {},
    pendingPayouts: [],
  };
}

/**
 * Save reward state to file
 */
function saveState(state: RewardState): void {
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    logger.error('Failed to save reward state', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get last reward timestamp for a holder
 */
export function getLastReward(holderPubkey: string): number | null {
  const state = loadState();
  return state.holderRewards[holderPubkey] || null;
}

/**
 * Set last reward timestamp for a holder
 */
export function setLastReward(holderPubkey: string, timestamp: number): void {
  const state = loadState();
  state.holderRewards[holderPubkey] = timestamp;
  saveState(state);
}

/**
 * Get retry count for a holder
 */
export function getRetryCount(holderPubkey: string): number {
  const state = loadState();
  return state.retryCounts[holderPubkey] || 0;
}

/**
 * Increment retry count for a holder
 */
export function incrementRetryCount(holderPubkey: string): number {
  const state = loadState();
  state.retryCounts[holderPubkey] = (state.retryCounts[holderPubkey] || 0) + 1;
  saveState(state);
  return state.retryCounts[holderPubkey];
}

/**
 * Reset retry count for a holder (after successful reward)
 */
export function resetRetryCount(holderPubkey: string): void {
  const state = loadState();
  delete state.retryCounts[holderPubkey];
  saveState(state);
}

/**
 * Get last reward run timestamp
 */
export function getLastRewardRun(): number | null {
  const state = loadState();
  return state.lastRewardRun;
}

/**
 * Set last reward run timestamp
 */
export function setLastRewardRun(timestamp: number): void {
  const state = loadState();
  state.lastRewardRun = timestamp;
  saveState(state);
}

/**
 * Calculate USD value of token holdings using real price from price service
 */
async function calculateHoldingUSD(amount: string, decimals: number, tokenPriceUSD: number): Promise<number> {
  const tokenAmount = Number(amount) / Math.pow(10, decimals);
  return tokenAmount * tokenPriceUSD;
}

/**
 * Get all eligible holders based on minimum holding USD
 * Excludes blacklisted addresses
 * Uses real USD price from price service
 */
export async function getEligibleHolders(minHoldingUSD: number = REWARD_CONFIG.MIN_HOLDING_USD): Promise<Holder[]> {
  try {
    // Fetch current NUKE token price
    let tokenPriceUSD: number;
    try {
      tokenPriceUSD = await getNUKEPriceUSD();
      logger.info('Using NUKE token price for eligibility check', {
        priceUSD: tokenPriceUSD,
        minHoldingUSD,
      });
    } catch (priceError) {
      logger.error('Failed to fetch token price, skipping eligibility check', {
        error: priceError instanceof Error ? priceError.message : String(priceError),
      });
      // Return empty array if price fetch fails - fail-safe behavior
      return [];
    }

    const allHolders = await getTokenHolders();
    const eligibleHolders: Holder[] = [];
    const excludedHolders: Array<{ pubkey: string; usdValue: number }> = [];
    
    for (const holder of allHolders) {
      // Skip blacklisted addresses
      if (isBlacklisted(holder.owner)) {
        logger.debug('Skipping blacklisted holder', {
          address: holder.owner,
        });
        continue;
      }
      
      // Calculate USD value using real price
      const holdingUSD = await calculateHoldingUSD(holder.amount, holder.decimals, tokenPriceUSD);
      
      if (holdingUSD >= minHoldingUSD) {
        eligibleHolders.push({
          pubkey: holder.owner,
          balance: holder.amount,
          usdValue: holdingUSD,
        });
      } else {
        // Track excluded holders for logging
        excludedHolders.push({
          pubkey: holder.owner,
          usdValue: holdingUSD,
        });
      }
    }
    
    logger.info('Filtered eligible holders', {
      total: allHolders.length,
      eligible: eligibleHolders.length,
      excluded: excludedHolders.length,
      blacklisted: allHolders.length - eligibleHolders.length - excludedHolders.length,
      minHoldingUSD,
      tokenPriceUSD,
      excludedBelowThreshold: excludedHolders.length > 0 ? excludedHolders.slice(0, 5).map(h => ({
        pubkey: h.pubkey.substring(0, 8) + '...',
        usdValue: h.usdValue.toFixed(2),
      })) : [],
    });
    
    return eligibleHolders;
  } catch (error) {
    logger.error('Error fetching eligible holders', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get all eligible holders (legacy function for backward compatibility)
 */
export async function getAllEligibleHolders(minHoldingUSD: number = REWARD_CONFIG.MIN_HOLDING_USD): Promise<TokenHolder[]> {
  try {
    const eligibleHolders = await getEligibleHolders(minHoldingUSD);
    // Convert Holder[] to TokenHolder[] for backward compatibility
    return eligibleHolders.map(h => ({
      address: '', // Not needed for legacy usage
      owner: h.pubkey,
      amount: h.balance,
      decimals: 9, // Token decimals
    }));
  } catch (error) {
    logger.error('Error fetching eligible holders', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get pending holders (eligible but not yet rewarded or retryable)
 */
export async function getPendingHolders(): Promise<TokenHolder[]> {
  try {
    const eligibleHolders = await getAllEligibleHolders();
    const pendingHolders: TokenHolder[] = [];
    const now = Date.now();
    const minInterval = REWARD_CONFIG.MIN_REWARD_INTERVAL;
    
    for (const holder of eligibleHolders) {
      const lastReward = getLastReward(holder.owner);
      const retryCount = getRetryCount(holder.owner);
      
      // Include if:
      // 1. Never rewarded, OR
      // 2. Last reward was more than min interval ago, OR
      // 3. Has retries but less than max retries
      const shouldReward = 
        lastReward === null || 
        (now - lastReward >= minInterval) ||
        (retryCount > 0 && retryCount < REWARD_CONFIG.MAX_RETRIES);
      
      if (shouldReward) {
        pendingHolders.push(holder);
      }
    }
    
    return pendingHolders;
  } catch (error) {
    logger.error('Error fetching pending holders', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Compute rewards for all eligible holders
 * Formula: reward per holder = (Tokens Held / Total Eligible Supply) * Total Reward Pool
 */
export async function computeRewards(): Promise<Reward[]> {
  try {
    const eligibleHolders = await getEligibleHolders();
    
    if (eligibleHolders.length === 0) {
      logger.info('No eligible holders, returning empty rewards');
      return [];
    }
    
    // Get total eligible supply (sum of all eligible holder balances)
    const totalEligibleSupply = eligibleHolders.reduce((sum, holder) => {
      return sum + BigInt(holder.balance);
    }, 0n);
    
    if (totalEligibleSupply === 0n) {
      logger.warn('Total eligible supply is zero, returning empty rewards');
      return [];
    }
    
    // Total reward pool in SOL from config
    const TOTAL_REWARD_POOL_SOL = REWARD_CONFIG.TOTAL_REWARD_POOL_SOL;
    
    const rewards: Reward[] = [];
    
    for (const holder of eligibleHolders) {
      const holderBalance = BigInt(holder.balance);
      
      // Calculate reward: (holder balance / total eligible supply) * total reward pool
      const rewardSOL = (Number(holderBalance) / Number(totalEligibleSupply)) * TOTAL_REWARD_POOL_SOL;
      
      // Only include holders with reward > 0
      if (rewardSOL > 0) {
        rewards.push({
          pubkey: holder.pubkey,
          rewardSOL: rewardSOL,
        });
      }
    }
    
    const totalRewardSOL = rewards.reduce((sum, r) => sum + r.rewardSOL, 0);
    
    logger.info('Computed rewards', {
      eligibleHolders: eligibleHolders.length,
      rewardsCount: rewards.length,
      totalRewardSOL: totalRewardSOL.toFixed(6),
      totalEligibleSupply: totalEligibleSupply.toString(),
    });
    
    return rewards;
  } catch (error) {
    logger.error('Error computing rewards', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Queue pending payouts in state
 */
export async function queuePendingPayouts(rewards: Reward[]): Promise<void> {
  try {
    const state = loadState();
    const now = Date.now();
    
    // Clear existing pending payouts and add new ones
    state.pendingPayouts = rewards.map(reward => ({
      pubkey: reward.pubkey,
      rewardSOL: reward.rewardSOL,
      queuedAt: now,
      retryCount: 0,
    }));
    
    saveState(state);
    
    logger.info('Queued pending payouts', {
      count: rewards.length,
      totalRewardSOL: rewards.reduce((sum, r) => sum + r.rewardSOL, 0).toFixed(6),
    });
  } catch (error) {
    logger.error('Error queueing pending payouts', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Execute a single SOL transfer
 */
async function executeSOLTransfer(recipientPubkey: string, amountSOL: number): Promise<string | null> {
  try {
    // Skip if amount is below minimum
    if (amountSOL < REWARD_CONFIG.MIN_SOL_PAYOUT) {
      logger.warn('Skipping transfer - amount below minimum', {
        recipient: recipientPubkey,
        amountSOL: amountSOL.toFixed(6),
        minSOL: REWARD_CONFIG.MIN_SOL_PAYOUT,
      });
      return null;
    }

    const adminWallet = getAdminWallet();
    const recipient = new PublicKey(recipientPubkey);
    const amountLamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);

    // Check admin wallet balance
    const adminBalance = await connection.getBalance(adminWallet.publicKey);
    const requiredBalance = amountLamports + 5000; // Amount + transaction fee buffer

    if (adminBalance < requiredBalance) {
      throw new Error(
        `Insufficient balance. Required: ${requiredBalance / LAMPORTS_PER_SOL} SOL, ` +
        `Available: ${adminBalance / LAMPORTS_PER_SOL} SOL`
      );
    }

    // Create transfer instruction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: adminWallet.publicKey,
        toPubkey: recipient,
        lamports: amountLamports,
      })
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = adminWallet.publicKey;

    // Sign and send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [adminWallet],
      { commitment: 'confirmed' }
    );

    return signature;
  } catch (error) {
    logger.error('Error executing SOL transfer', {
      recipient: recipientPubkey,
      amountSOL: amountSOL.toFixed(6),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Execute payouts for queued rewards
 * Real SOL transfers on Solana Devnet
 */
export async function executePayouts(): Promise<void> {
  try {
    const state = loadState();
    const pendingPayouts = state.pendingPayouts || [];
    
    if (pendingPayouts.length === 0) {
      logger.debug('No pending payouts to execute');
      return;
    }
    
    // Check admin wallet balance before starting
    const adminWallet = getAdminWallet();
    const adminBalance = await connection.getBalance(adminWallet.publicKey);
    const totalRequiredSOL = pendingPayouts.reduce((sum, p) => sum + p.rewardSOL, 0);
    const totalRequiredLamports = Math.floor(totalRequiredSOL * LAMPORTS_PER_SOL);
    const requiredWithFees = totalRequiredLamports + (pendingPayouts.length * 5000); // Buffer for fees

    logger.info('Executing payouts', {
      count: pendingPayouts.length,
      totalRewardSOL: totalRequiredSOL.toFixed(6),
      adminBalanceSOL: (adminBalance / LAMPORTS_PER_SOL).toFixed(6),
      requiredWithFeesSOL: (requiredWithFees / LAMPORTS_PER_SOL).toFixed(6),
    });

    if (adminBalance < requiredWithFees) {
      logger.error('Insufficient admin wallet balance for all payouts', {
        adminBalanceSOL: (adminBalance / LAMPORTS_PER_SOL).toFixed(6),
        requiredSOL: (requiredWithFees / LAMPORTS_PER_SOL).toFixed(6),
      });
      // Continue with what we can afford
    }
    
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    const remainingPayouts: PendingPayout[] = [];
    let totalDistributedSOL = 0;
    const historicalPayouts: HistoricalPayout[] = [];
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    
    for (const payout of pendingPayouts) {
      // Skip if max retries exceeded
      if (payout.retryCount >= REWARD_CONFIG.MAX_RETRIES) {
        logger.warn('Skipping payout - max retries exceeded', {
          holder: payout.pubkey,
          retryCount: payout.retryCount,
        });
        skippedCount++;
        continue;
      }

      // Skip if amount is below minimum
      if (payout.rewardSOL < REWARD_CONFIG.MIN_SOL_PAYOUT) {
        logger.debug('Skipping payout - below minimum', {
          holder: payout.pubkey,
          rewardSOL: payout.rewardSOL.toFixed(6),
          minSOL: REWARD_CONFIG.MIN_SOL_PAYOUT,
        });
        skippedCount++;
        continue;
      }
      
      try {
        logger.info('Executing SOL transfer', {
          recipient: payout.pubkey,
          amountSOL: payout.rewardSOL.toFixed(6),
          retryCount: payout.retryCount,
        });

        const signature = await executeSOLTransfer(payout.pubkey, payout.rewardSOL);
        
        if (signature) {
          // Mark as successful
          setLastReward(payout.pubkey, Date.now());
          resetRetryCount(payout.pubkey);
          successCount++;
          totalDistributedSOL += payout.rewardSOL;
          
          // Save to historical payouts
          const historicalPayout: HistoricalPayout = {
            id: `${payout.pubkey}-${now}-${Math.random().toString(36).substring(7)}`,
            timestamp,
            pubkey: payout.pubkey,
            rewardSOL: payout.rewardSOL,
            status: 'success',
            retryCount: payout.retryCount,
            queuedAt: new Date(payout.queuedAt || now).toISOString(),
            executedAt: timestamp,
            transactionSignature: signature,
          };
          historicalPayouts.push(historicalPayout);
          
          logger.info('Payout successful', {
            recipient: payout.pubkey,
            amountSOL: payout.rewardSOL.toFixed(6),
            signature,
          });
        } else {
          // Amount too small, skip
          skippedCount++;
          
          // Save as skipped payout
          const historicalPayout: HistoricalPayout = {
            id: `${payout.pubkey}-${now}-${Math.random().toString(36).substring(7)}`,
            timestamp,
            pubkey: payout.pubkey,
            rewardSOL: payout.rewardSOL,
            status: 'failed',
            retryCount: payout.retryCount,
            queuedAt: new Date(payout.queuedAt || now).toISOString(),
          };
          historicalPayouts.push(historicalPayout);
        }
      } catch (error) {
        // Increment retry count and keep in queue
        payout.retryCount++;
        remainingPayouts.push(payout);
        incrementRetryCount(payout.pubkey);
        failureCount++;
        
        // Save failed payout to history
        const historicalPayout: HistoricalPayout = {
          id: `${payout.pubkey}-${now}-${Math.random().toString(36).substring(7)}`,
          timestamp,
          pubkey: payout.pubkey,
          rewardSOL: payout.rewardSOL,
          status: 'failed',
          retryCount: payout.retryCount,
          queuedAt: new Date(payout.queuedAt || now).toISOString(),
        };
        historicalPayouts.push(historicalPayout);
        
        logger.warn('Payout failed, will retry', {
          holder: payout.pubkey,
          retryCount: payout.retryCount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    // Update state with remaining payouts
    state.pendingPayouts = remainingPayouts;
    saveState(state);
    
    // Save historical payouts
    if (historicalPayouts.length > 0) {
      try {
        saveHistoricalPayouts(historicalPayouts);
        logger.info('Historical payouts saved', { count: historicalPayouts.length });
      } catch (historyError) {
        logger.error('Failed to save historical payouts', {
          error: historyError instanceof Error ? historyError.message : String(historyError),
        });
        // Don't throw - allow execution to complete
      }
    }
    
    const totalRewardSOL = pendingPayouts.reduce((sum, p) => sum + p.rewardSOL, 0);
    
    logger.info('Payout execution completed', {
      total: pendingPayouts.length,
      success: successCount,
      failures: failureCount,
      skipped: skippedCount,
      totalRewardSOL: totalRewardSOL.toFixed(6),
      distributedSOL: totalDistributedSOL.toFixed(6),
      remainingInQueue: remainingPayouts.length,
    });
  } catch (error) {
    logger.error('Error executing payouts', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - allow scheduler to continue
  }
}

/**
 * Get all pending payouts from state
 */
export function getPendingPayouts(): PendingPayout[] {
  const state = loadState();
  return state.pendingPayouts || [];
}

/**
 * Get all holders with their eligibility status and reward info
 */
export async function getAllHoldersWithStatus(): Promise<Array<{
  pubkey: string;
  balance: string;
  usdValue: number;
  eligibilityStatus: 'eligible' | 'excluded' | 'blacklisted';
  lastReward: number | null;
  retryCount: number;
}>> {
  try {
    // Fetch all data in parallel to optimize performance
    const [allHolders, tokenPriceUSD] = await Promise.all([
      getTokenHolders(),
      getNUKEPriceUSD().catch(() => {
        logger.warn('Failed to fetch price for holder status, using fallback');
        return 0.01; // Fallback price
      }),
    ]);
    
    // Calculate eligibility inline instead of calling getEligibleHolders() which fetches holders again
    const minHoldingUSD = REWARD_CONFIG.MIN_HOLDING_USD;
    const eligiblePubkeys = new Set<string>();
    
    // Determine eligibility for each holder without fetching again
    for (const holder of allHolders) {
      // Skip blacklisted addresses
      if (isBlacklisted(holder.owner)) {
        continue;
      }
      
      // Calculate USD value
      const tokenAmount = Number(holder.amount) / Math.pow(10, holder.decimals);
      const usdValue = tokenAmount * tokenPriceUSD;
      
      // Check if eligible
      if (usdValue >= minHoldingUSD) {
        eligiblePubkeys.add(holder.owner);
      }
    }
    
    // Map holders to status
    const holdersWithStatus = allHolders.map(holder => {
      const isBlacklistedAddr = isBlacklisted(holder.owner);
      const isEligible = eligiblePubkeys.has(holder.owner);
      
      let eligibilityStatus: 'eligible' | 'excluded' | 'blacklisted';
      if (isBlacklistedAddr) {
        eligibilityStatus = 'blacklisted';
      } else if (isEligible) {
        eligibilityStatus = 'eligible';
      } else {
        eligibilityStatus = 'excluded';
      }
      
      // Calculate USD value for all holders using current price
      const tokenAmount = Number(holder.amount) / Math.pow(10, holder.decimals);
      const usdValue = tokenAmount * tokenPriceUSD;
      
      return {
        pubkey: holder.owner,
        balance: holder.amount,
        usdValue,
        eligibilityStatus,
        lastReward: getLastReward(holder.owner),
        retryCount: getRetryCount(holder.owner),
      };
    });
    
    return holdersWithStatus;
  } catch (error) {
    logger.error('Error getting all holders with status', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Placeholder function for executing reward transfer (legacy - kept for backward compatibility)
 */
export async function executeRewardTransfer(holderPubkey: string, amount: string): Promise<boolean> {
  try {
    // Placeholder: Simulate reward transfer
    logger.debug('Executing reward transfer (placeholder)', {
      holder: holderPubkey,
      amount,
    });
    
    // Simulate transfer delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Placeholder: Randomly simulate success/failure for testing
    const success = Math.random() > 0.1; // 90% success rate for testing
    
    if (success) {
      resetRetryCount(holderPubkey);
      return true;
    } else {
      incrementRetryCount(holderPubkey);
      return false;
    }
  } catch (error) {
    logger.error('Error executing reward transfer', {
      error: error instanceof Error ? error.message : String(error),
      holder: holderPubkey,
    });
    incrementRetryCount(holderPubkey);
    return false;
  }
}

