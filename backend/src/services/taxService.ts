import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getMint,
  getAccount,
  harvestWithheldTokensToMint,
  withdrawWithheldTokensFromAccounts,
} from '@solana/spl-token';
import { connection, tokenMint } from '../config/solana';
import { logger } from '../utils/logger';
import { loadKeypairFromEnv, loadKeypairFromEnvOptional } from '../utils/loadKeypairFromEnv';
import { getAdminWallet } from './rewardService';
import { isTokenMode, TAX_THRESHOLD_CONFIG, BATCH_HARVEST_CONFIG } from '../config/constants';
import { getNUKEPriceUSD } from './priceService';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tax Distribution Service
 * 
 * Handles 3% transaction tax on TEK token transfers.
 * 
 * IMPORTANT: Transfer fees are epoch-gated. The fee will only be enforced when
 * newerTransferFee.epoch <= currentClusterEpoch. If the epoch is in the future,
 * no fees will be collected regardless of transfer type (wallet-to-wallet or DEX swaps).
 *
 * When active, fees are collected on ALL Token-2022 transfers:
 * - Wallet-to-wallet transfers
 * - DEX swaps (Raydium, etc.)
 * - Program-to-program transfers
 *
 * Distribution:
 * - 75% of swapped SOL → Distributed to eligible holders
 * - 25% of swapped SOL → Sent to Treasury wallet
 * 
 * All amounts are in token units (raw, with decimals)
 */

// Tax percentages (as decimals)
const TOTAL_TAX_PERCENT = 0.04; // 4% total tax
const REWARD_PERCENT = 0.03; // 3% to reward wallet
const TREASURY_PERCENT = 0.01; // 1% to treasury wallet

// State file path for tracking tax distributions
const STATE_FILE_PATH = path.join(process.cwd(), 'reward-state.json');

// Cached wallets
let cachedRewardWallet: Keypair | null = null;
let cachedTreasuryWallet: Keypair | null = null;

/**
 * Tax Distribution State
 */
interface TaxState {
  totalTaxCollected: string; // Total TEK tax collected (in token units, as string for BigInt)
  totalRewardAmount: string; // Total SOL distributed to holders (in lamports, as string for BigInt)
  totalTreasuryAmount: string; // Total SOL sent to treasury (in lamports, as string for BigInt)
  totalSolDistributed: string; // Total SOL distributed to holders (in lamports)
  totalSolToTreasury: string; // Total SOL sent to treasury (in lamports)
  totalNukeHarvested: string; // Total TEK harvested from mint (in token units)
  totalNukeSold: string; // Total TEK sold for SOL (in token units)
  lastTaxDistribution: number | null; // Timestamp of last tax distribution
  lastDistributionCycleNumber: number | null; // Cycle number when last distribution occurred
  lastDistributionEpoch: string | null; // Epoch when last distribution occurred
  lastDistributionSolToHolders: string; // Last distribution: SOL to holders (in lamports)
  lastDistributionSolToTreasury: string; // Last distribution: SOL to treasury (in lamports)
  lastSwapTx: string | null; // Last swap transaction signature
  lastDistributionTx: string | null; // Last distribution transaction signatures (comma-separated)
  lastDistributionTime: number | null; // Timestamp of last distribution
  taxDistributions: Array<{
    timestamp: number;
    transactionAmount: string; // TEK amount harvested
    rewardAmount: string; // SOL amount distributed to holders
    treasuryAmount: string; // SOL amount sent to treasury
    fromAddress: string;
    rewardSignature?: string; // Swap transaction signature
    treasurySignature?: string; // Treasury transfer signature
  }>;
}

/**
 * Load tax state from file
 */
function loadTaxState(): TaxState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const state = JSON.parse(data);
      
      // Ensure tax state exists
      if (!state.taxState) {
        return {
          totalTaxCollected: '0',
          totalRewardAmount: '0',
          totalTreasuryAmount: '0',
          totalSolDistributed: '0',
          totalSolToTreasury: '0',
          totalNukeHarvested: '0',
          totalNukeSold: '0',
          lastTaxDistribution: null,
          lastDistributionCycleNumber: null,
          lastDistributionEpoch: null,
          lastDistributionSolToHolders: '0',
          lastDistributionSolToTreasury: '0',
          lastSwapTx: null,
          lastDistributionTx: null,
          lastDistributionTime: null,
          taxDistributions: [],
        };
      }
      
      return state.taxState;
    }
  } catch (error) {
    logger.warn('Failed to load tax state, using defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  
  return {
    totalTaxCollected: '0',
    totalRewardAmount: '0',
    totalTreasuryAmount: '0',
    totalSolDistributed: '0',
    totalSolToTreasury: '0',
    totalNukeHarvested: '0',
    totalNukeSold: '0',
    lastTaxDistribution: null,
    lastDistributionCycleNumber: null,
    lastDistributionEpoch: null,
    lastDistributionSolToHolders: '0',
    lastDistributionSolToTreasury: '0',
    lastSwapTx: null,
    lastDistributionTx: null,
    lastDistributionTime: null,
    taxDistributions: [],
  };
}

/**
 * Save tax state to file
 */
function saveTaxState(taxState: TaxState): void {
  try {
    let state: any = {};
    
    // Load existing state if it exists
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      state = JSON.parse(data);
    }
    
    // Update tax state
    state.taxState = taxState;
    
    // Save to file with explicit flush
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    
    // Force flush to disk (important for cloud environments like Render)
    const fd = fs.openSync(STATE_FILE_PATH, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    
    logger.debug('Tax state saved successfully', {
      lastSwapTx: taxState.lastSwapTx,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to save tax state', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get reward wallet address from environment variable
 * Environment variable: REWARD_WALLET_ADDRESS
 */
function getRewardWalletAddress(): PublicKey {
  const rewardAddress = process.env.REWARD_WALLET_ADDRESS;
  
  if (!rewardAddress) {
    throw new Error('REWARD_WALLET_ADDRESS environment variable is not set');
  }

  try {
    return new PublicKey(rewardAddress);
  } catch (error) {
    logger.error('Invalid reward wallet address', {
      address: rewardAddress,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Invalid REWARD_WALLET_ADDRESS: ${rewardAddress}`);
  }
}

/**
 * Get reward wallet keypair from environment variable
 * Environment variable: REWARD_WALLET_PRIVATE_KEY_JSON (JSON array of 64 numbers)
 * Required for withdrawing withheld taxes and sending distributions
 */
function getRewardWallet(): Keypair {
  if (cachedRewardWallet) {
    return cachedRewardWallet;
  }

  cachedRewardWallet = loadKeypairFromEnv('REWARD_WALLET_PRIVATE_KEY_JSON');
  return cachedRewardWallet;
}

/**
 * Get treasury wallet address from environment variable
 * Environment variable: TREASURY_WALLET_ADDRESS
 * Default: DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo
 */
function getTreasuryWalletAddress(): PublicKey {
  const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS || 'DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo';
  
  try {
    return new PublicKey(treasuryAddress);
  } catch (error) {
    logger.error('Invalid treasury wallet address', {
      address: treasuryAddress,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Invalid TREASURY_WALLET_ADDRESS: ${treasuryAddress}`);
  }
}

/**
 * Get treasury wallet keypair from environment variable (optional)
 * Environment variable: TREASURY_WALLET_PRIVATE_KEY_JSON (JSON array of 64 numbers, optional)
 * Treasury wallet can be receive-only, so this is optional
 */
function getTreasuryWallet(): Keypair | null {
  if (cachedTreasuryWallet) {
    return cachedTreasuryWallet;
  }

  cachedTreasuryWallet = loadKeypairFromEnvOptional('TREASURY_WALLET_PRIVATE_KEY_JSON');
  return cachedTreasuryWallet;
}

/**
 * Tax Distribution Result
 */
export interface TaxDistributionResult {
  rewardAmount: bigint; // SOL amount distributed to holders (in lamports)
  treasuryAmount: bigint; // SOL amount sent to treasury (in lamports)
  totalTax: bigint; // NUKE amount harvested (in token units)
  swapSignature?: string; // Swap transaction signature (NUKE → SOL)
  treasurySignature?: string; // Treasury SOL transfer signature
  distributionResult?: {
    distributedCount: number;
    totalDistributed: bigint;
    skippedCount: number;
    signatures: Array<{ pubkey: string; amount: bigint; signature: string }>;
    errors: Array<{ pubkey: string; error: string }>;
  };
}

/**
 * Tax Service
 * 
 * Handles computation and distribution of 4% transaction tax on NUKE token transfers
 */
export class TaxService {
  /**
   * Check if collected tax meets minimum threshold before harvesting
   * 
   * Compares the total available tax (from accounts + mint) against the configured threshold.
   * Threshold is mode-dependent:
   * - TOKEN mode: Compares against MIN_TAX_THRESHOLD_TOKEN (in raw token units)
   * - USD mode: Converts to USD and compares against MIN_TAX_THRESHOLD_USD
   * 
   * @param totalTaxAmount - Total tax amount available (in raw token units with decimals)
   * @param decimals - Token decimals for conversion
   * @returns true if threshold is met, false otherwise
   */
  static async checkMinimumTaxThreshold(
    totalTaxAmount: bigint,
    decimals: number
  ): Promise<boolean> {
    if (totalTaxAmount === 0n) {
      logger.info('Tax threshold check: No tax collected', {
        totalTaxAmount: '0',
        thresholdMet: false,
      });
      return false;
    }

    const taxAmountHuman = Number(totalTaxAmount) / Math.pow(10, decimals);

    if (isTokenMode()) {
      // TOKEN mode: Compare against MIN_TAX_THRESHOLD_TOKEN (in token units)
      const threshold = TAX_THRESHOLD_CONFIG.MIN_TAX_THRESHOLD_TOKEN;
      const thresholdMet = taxAmountHuman >= threshold;
      
      logger.info('Tax threshold check (TOKEN mode)', {
        status: thresholdMet ? 'PASSED' : 'FAILED',
        totalTaxAmount: totalTaxAmount.toString(),
        totalTaxAmountHuman: taxAmountHuman.toFixed(6),
        threshold: threshold,
        thresholdMet,
        mode: 'TOKEN',
        action: thresholdMet ? 'Harvest will proceed' : 'Harvest will be skipped (tax rolling over)',
      });

      return thresholdMet;
    } else {
      // USD mode: Convert to USD and compare against MIN_TAX_THRESHOLD_USD
      try {
        const tokenPriceUSD = await getNUKEPriceUSD();
        const taxAmountUSD = taxAmountHuman * tokenPriceUSD;
        const threshold = TAX_THRESHOLD_CONFIG.MIN_TAX_THRESHOLD_USD;
        const thresholdMet = taxAmountUSD >= threshold;

        logger.info('Tax threshold check (USD mode)', {
          status: thresholdMet ? 'PASSED' : 'FAILED',
          totalTaxAmount: totalTaxAmount.toString(),
          totalTaxAmountHuman: taxAmountHuman.toFixed(6),
          tokenPriceUSD: tokenPriceUSD.toFixed(6),
          taxAmountUSD: taxAmountUSD.toFixed(2),
          threshold: threshold,
          thresholdMet,
          mode: 'USD',
          action: thresholdMet ? 'Harvest will proceed' : 'Harvest will be skipped (tax rolling over)',
        });

        return thresholdMet;
      } catch (error) {
        logger.warn('Failed to get token price for USD threshold check, defaulting to TOKEN mode comparison', {
          error: error instanceof Error ? error.message : String(error),
          totalTaxAmount: totalTaxAmount.toString(),
          totalTaxAmountHuman: taxAmountHuman.toFixed(6),
        });
        
        // Fallback to TOKEN mode comparison if price fetch fails
        const threshold = TAX_THRESHOLD_CONFIG.MIN_TAX_THRESHOLD_TOKEN;
        const thresholdMet = taxAmountHuman >= threshold;
        
        logger.info('Tax threshold check (fallback to TOKEN mode)', {
          status: thresholdMet ? 'PASSED' : 'FAILED',
          totalTaxAmount: totalTaxAmount.toString(),
          totalTaxAmountHuman: taxAmountHuman.toFixed(6),
          threshold: threshold,
          thresholdMet,
          mode: 'TOKEN (fallback)',
          action: thresholdMet ? 'Harvest will proceed' : 'Harvest will be skipped (tax rolling over)',
          note: 'Using fallback because USD price fetch failed',
        });

        return thresholdMet;
      }
    }
  }

  /**
   * Check if harvest amount should be split into batches
   * 
   * Compares the harvest amount against the configured maximum threshold.
   * Threshold is mode-dependent:
   * - TOKEN mode: Compares against MAX_HARVEST_TOKEN (in raw token units)
   * - USD mode: Converts to USD and compares against MAX_HARVEST_USD
   * 
   * @param harvestAmount - Total harvest amount (in raw token units with decimals)
   * @param decimals - Token decimals for conversion
   * @returns true if harvest should be split into batches, false otherwise
   */
  static async shouldSplitHarvest(
    harvestAmount: bigint,
    decimals: number
  ): Promise<boolean> {
    if (harvestAmount === 0n) {
      return false;
    }

    const harvestAmountHuman = Number(harvestAmount) / Math.pow(10, decimals);

    if (isTokenMode()) {
      // TOKEN mode: Compare against MAX_HARVEST_TOKEN (in token units)
      const maxHarvest = BATCH_HARVEST_CONFIG.MAX_HARVEST_TOKEN;
      const shouldSplit = harvestAmountHuman > maxHarvest;
      
      logger.info('Batch harvest check (TOKEN mode)', {
        harvestAmount: harvestAmount.toString(),
        harvestAmountHuman: harvestAmountHuman.toFixed(6),
        maxHarvest: maxHarvest,
        shouldSplit,
        mode: 'TOKEN',
      });

      return shouldSplit;
    } else {
      // USD mode: Convert to USD and compare against MAX_HARVEST_USD
      try {
        const tokenPriceUSD = await getNUKEPriceUSD();
        const harvestAmountUSD = harvestAmountHuman * tokenPriceUSD;
        const maxHarvest = BATCH_HARVEST_CONFIG.MAX_HARVEST_USD;
        const shouldSplit = harvestAmountUSD > maxHarvest;

        logger.info('Batch harvest check (USD mode)', {
          harvestAmount: harvestAmount.toString(),
          harvestAmountHuman: harvestAmountHuman.toFixed(6),
          tokenPriceUSD: tokenPriceUSD.toFixed(6),
          harvestAmountUSD: harvestAmountUSD.toFixed(2),
          maxHarvest: maxHarvest,
          shouldSplit,
          mode: 'USD',
        });

        return shouldSplit;
      } catch (error) {
        logger.warn('Failed to get token price for USD batch check, defaulting to TOKEN mode comparison', {
          error: error instanceof Error ? error.message : String(error),
          harvestAmount: harvestAmount.toString(),
          harvestAmountHuman: harvestAmountHuman.toFixed(6),
        });
        
        // Fallback to TOKEN mode comparison if price fetch fails
        const maxHarvest = BATCH_HARVEST_CONFIG.MAX_HARVEST_TOKEN;
        const shouldSplit = harvestAmountHuman > maxHarvest;
        
        logger.info('Batch harvest check (fallback to TOKEN mode)', {
          harvestAmount: harvestAmount.toString(),
          harvestAmountHuman: harvestAmountHuman.toFixed(6),
          maxHarvest: maxHarvest,
          shouldSplit,
          mode: 'TOKEN (fallback)',
        });

        return shouldSplit;
      }
    }
  }

  /**
   * Execute batch harvest by splitting large amounts into multiple swaps
   * 
   * Splits the total harvest amount into BATCH_COUNT batches and executes
   * each swap with appropriate delays between them.
   * 
   * @param totalAmount - Total amount to harvest (in raw token units with decimals)
   * @param decimals - Token decimals for conversion
   * @returns Combined swap results with total SOL received and all transaction signatures
   */
  static async executeBatchHarvest(
    totalAmount: bigint,
    decimals: number
  ): Promise<{
    solReceived: bigint;
    txSignatures: string[];
  }> {
    const batchCount = BATCH_HARVEST_CONFIG.BATCH_COUNT;
    const batchSize = totalAmount / BigInt(batchCount);
    const remainder = totalAmount % BigInt(batchCount);
    
    // Determine delay based on mode
    const delay = isTokenMode() 
      ? BATCH_HARVEST_CONFIG.BATCH_DELAY_TOKEN_MODE 
      : BATCH_HARVEST_CONFIG.BATCH_DELAY_USD_MODE;

    const batchStartTime = Date.now();
    logger.info('Starting batch harvest', {
      totalAmount: totalAmount.toString(),
      totalAmountHuman: (Number(totalAmount) / Math.pow(10, decimals)).toFixed(6),
      batchCount,
      batchSize: batchSize.toString(),
      batchSizeHuman: (Number(batchSize) / Math.pow(10, decimals)).toFixed(6),
      remainder: remainder.toString(),
      delayMs: delay,
      mode: isTokenMode() ? 'TOKEN' : 'USD',
      startTime: new Date(batchStartTime).toISOString(),
    });

    const txSignatures: string[] = [];
    let totalSolReceived = 0n;

    // Execute each batch
    for (let i = 0; i < batchCount; i++) {
      // Add remainder to the last batch
      const currentBatchAmount = i === batchCount - 1 
        ? batchSize + remainder 
        : batchSize;

      if (currentBatchAmount === 0n) {
        logger.info(`Skipping batch ${i + 1}/${batchCount} - zero amount`);
        continue;
      }

      const batchExecutionStart = Date.now();
      logger.info(`Executing batch ${i + 1}/${batchCount}`, {
        batchNumber: i + 1,
        batchAmount: currentBatchAmount.toString(),
        batchAmountHuman: (Number(currentBatchAmount) / Math.pow(10, decimals)).toFixed(6),
        totalBatches: batchCount,
        startTime: new Date(batchExecutionStart).toISOString(),
      });

      try {
        const { swapNukeToSOL } = await import('./swapService');
        const swapResult = await swapNukeToSOL(currentBatchAmount);
        
        totalSolReceived += swapResult.solReceived;
        txSignatures.push(swapResult.txSignature);

        const batchExecutionTime = Date.now() - batchExecutionStart;
        logger.info(`Batch ${i + 1}/${batchCount} completed`, {
          batchNumber: i + 1,
          batchAmount: currentBatchAmount.toString(),
          batchAmountHuman: (Number(currentBatchAmount) / Math.pow(10, decimals)).toFixed(6),
          solReceived: swapResult.solReceived.toString(),
          solReceivedHuman: (Number(swapResult.solReceived) / 1e9).toFixed(6),
          txSignature: swapResult.txSignature,
          cumulativeSol: totalSolReceived.toString(),
          cumulativeSolHuman: (Number(totalSolReceived) / 1e9).toFixed(6),
          executionTimeMs: batchExecutionTime,
        });

        // Wait before next batch (except for the last batch)
        if (i < batchCount - 1) {
          logger.info(`Waiting ${delay}ms before next batch`, {
            batchNumber: i + 1,
            nextBatch: i + 2,
            delayMs: delay,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        logger.error(`Batch ${i + 1}/${batchCount} failed`, {
          batchNumber: i + 1,
          batchAmount: currentBatchAmount.toString(),
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Continue with remaining batches even if one fails
        // This allows partial success
      }
    }

    const batchTotalTime = Date.now() - batchStartTime;
    logger.info('Batch harvest completed', {
      totalAmount: totalAmount.toString(),
      totalAmountHuman: (Number(totalAmount) / Math.pow(10, decimals)).toFixed(6),
      batchCount,
      successfulBatches: txSignatures.length,
      failedBatches: batchCount - txSignatures.length,
      totalSolReceived: totalSolReceived.toString(),
      totalSolReceivedHuman: (Number(totalSolReceived) / 1e9).toFixed(6),
      txSignatures,
      totalExecutionTimeMs: batchTotalTime,
      averageBatchTimeMs: Math.round(batchTotalTime / batchCount),
      endTime: new Date().toISOString(),
    });

    return {
      solReceived: totalSolReceived,
      txSignatures,
    };
  }

  /**
   * Process withheld tax from Token-2022 transfers
   * 
   * Withdraws withheld tokens from the mint and distributes them:
   * - 3% → Reward wallet (for later distribution to holders)
   * - 1% → Treasury wallet
   * 
   * This function should be called periodically to process accumulated
   * transfer fees that have been withheld by the Token-2022 program.
   * 
   * @param epoch - Current epoch (YYYY-MM-DD format)
   * @param cycleNumber - Current cycle number (1-288)
   * @returns Tax distribution result with amounts and transaction signatures
   * 
   * Environment variables required:
   * - REWARD_WALLET_ADDRESS: Public key of reward wallet (optional, derived from private key if not set)
   * - TREASURY_WALLET_ADDRESS: Public key of treasury wallet (optional, derived from private key if not set)
   * - REWARD_WALLET_PRIVATE_KEY_JSON: JSON array of 64 numbers (required for withdrawals)
   * - TREASURY_WALLET_PRIVATE_KEY_JSON: JSON array of 64 numbers (optional, treasury can be receive-only)
   */
  static async processWithheldTax(epoch?: string, cycleNumber?: number): Promise<TaxDistributionResult | null> {
    logger.info('Processing withheld tax from Token-2022 transfers', {
      timestamp: new Date().toISOString(),
      mint: tokenMint.toBase58(),
    });

    try {
      // Step 1: Get token mint info and check withdraw authority
      const mintInfo = await getMint(connection, tokenMint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const decimals = mintInfo.decimals;
      
      // Parse mint to get transfer fee config
      const mintAccount = await connection.getAccountInfo(tokenMint);
      if (!mintAccount) {
        throw new Error('Mint account not found');
      }
      
      // Import unpackMint and getTransferFeeConfig
      const { unpackMint, getTransferFeeConfig } = await import('@solana/spl-token');
      const parsedMint = unpackMint(tokenMint, mintAccount, TOKEN_2022_PROGRAM_ID);
      const transferFeeConfig = getTransferFeeConfig(parsedMint);
      
      if (!transferFeeConfig || !transferFeeConfig.withdrawWithheldAuthority) {
        logger.error('No withdraw withheld authority set on mint. Tax harvesting will not work.');
        logger.error('Please update the withdraw withheld authority to the reward wallet.');
        logger.error('Run setWithdrawAuthority.ts script to fix this.');
        return null;
      }
      
      const withdrawAuthority = transferFeeConfig.withdrawWithheldAuthority;
      
      // Check mint's withheld amount (tokens held in the mint after harvesting)
      const mintWithheldAmount = transferFeeConfig.withheldAmount || 0n;
      logger.info('Withdraw withheld authority check', {
        authority: withdrawAuthority.toBase58(),
        mint: tokenMint.toBase58(),
        mintWithheldAmount: mintWithheldAmount.toString(),
        mintWithheldAmountHuman: (Number(mintWithheldAmount) / Math.pow(10, decimals)).toFixed(6),
      });
      
      // Step 2: Determine which wallet to use based on authority
      // Try reward wallet first, then admin wallet as fallback
      let withdrawWallet: Keypair | null = null;
      let rewardWallet: Keypair;
      let rewardWalletAddress: PublicKey;
      
      try {
        rewardWallet = getRewardWallet();
        rewardWalletAddress = getRewardWalletAddress();
        logger.info('Reward wallet loaded', {
          rewardWalletAddress: rewardWalletAddress.toBase58(),
        });
      } catch (error) {
        logger.error('Failed to load reward wallet', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
      
      if (withdrawAuthority.equals(rewardWalletAddress)) {
        withdrawWallet = rewardWallet;
        logger.info('Using reward wallet for tax withdrawal', {
          authority: withdrawAuthority.toBase58(),
          rewardWallet: rewardWalletAddress.toBase58(),
        });
      } else {
        // Try admin wallet as fallback
        try {
          const adminWallet = getAdminWallet();
          logger.info('Checking admin wallet as fallback', {
            authority: withdrawAuthority.toBase58(),
            adminWallet: adminWallet.publicKey.toBase58(),
            rewardWallet: rewardWalletAddress.toBase58(),
          });
          
          if (withdrawAuthority.equals(adminWallet.publicKey)) {
            withdrawWallet = adminWallet;
            logger.info('Using admin wallet for tax withdrawal (reward wallet is not the authority)');
          } else {
            logger.error('Withdraw authority does not match reward or admin wallet', {
              authority: withdrawAuthority.toBase58(),
              rewardWallet: rewardWalletAddress.toBase58(),
              adminWallet: adminWallet.publicKey.toBase58(),
            });
            logger.error('ACTION REQUIRED: Update withdraw authority on mint to match reward wallet');
            return null;
          }
        } catch (error) {
          logger.error('Failed to get admin wallet', {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }
      
      if (!withdrawWallet) {
        logger.error('No valid wallet found for tax withdrawal');
        throw new Error('No valid wallet found for tax withdrawal');
      }

      // Step 3: Check if there's anything to harvest BEFORE doing transactions
      // CRITICAL: We must scan ALL token accounts, including those with zero balance
      // because withheld fees are stored separately and accounts with fees may have zero balance
      let totalWithheldInAccounts = 0n;
      let accountsWithWithheld = 0;
      const accountsWithWithheldList: PublicKey[] = []; // Collect accounts with withheld fees
      
      try {
        const { getTransferFeeAmount, unpackAccount } = await import('@solana/spl-token');
        
        // Get ALL token accounts for this mint (including zero-balance accounts)
        // This is critical because accounts with withheld fees may have zero balance
        const allTokenAccounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
          filters: [
            {
              memcmp: {
                offset: 0, // Mint address is first 32 bytes
                bytes: tokenMint.toBase58(),
              },
            },
          ],
        });
        
        logger.info('Scanning ALL token accounts for withheld fees', {
          totalAccounts: allTokenAccounts.length,
          note: 'This includes ALL accounts (zero balance and non-zero balance)',
        });
        
        // Log account details for debugging
        if (allTokenAccounts.length <= 20) {
          logger.debug('Token account addresses being scanned', {
            accounts: allTokenAccounts.map(({ pubkey }) => pubkey.toBase58()),
          });
        }
        
        // Check ALL accounts for withheld fees (not just first 50)
        for (const { pubkey, account } of allTokenAccounts) {
          try {
            const parsedAccount = unpackAccount(pubkey, account, TOKEN_2022_PROGRAM_ID);
            
            // Verify this account belongs to our mint
            if (!parsedAccount.mint.equals(tokenMint)) {
              continue;
            }
            
            const transferFeeAmount = getTransferFeeAmount(parsedAccount);
            if (transferFeeAmount && transferFeeAmount.withheldAmount > 0n) {
              totalWithheldInAccounts += transferFeeAmount.withheldAmount;
              accountsWithWithheld++;
              accountsWithWithheldList.push(pubkey); // Collect account address
              const withheldHuman = (Number(transferFeeAmount.withheldAmount) / Math.pow(10, decimals)).toFixed(6);
              logger.debug('Token account has withheld fees', {
                account: pubkey.toBase58(),
                withheldAmount: transferFeeAmount.withheldAmount.toString(),
                withheldAmountHuman: withheldHuman,
                accountBalance: parsedAccount.amount.toString(),
              });
            }
          } catch (error) {
            // Skip accounts that can't be parsed
            logger.debug('Skipping account (parse error)', {
              account: pubkey.toBase58(),
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        
        logger.info('Pre-harvest check: scanned ALL token accounts for withheld fees', {
          totalAccountsScanned: allTokenAccounts.length,
          accountsWithWithheld,
          totalWithheldInAccounts: totalWithheldInAccounts.toString(),
          totalWithheldInAccountsHuman: (Number(totalWithheldInAccounts) / Math.pow(10, decimals)).toFixed(6),
          mintWithheldAmount: mintWithheldAmount.toString(),
          mintWithheldAmountHuman: (Number(mintWithheldAmount) / Math.pow(10, decimals)).toFixed(6),
        });
      } catch (error) {
        logger.error('Failed to check token accounts for withheld fees', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Continue anyway - harvest might still work
      }

      // Step 4: Check minimum tax threshold before harvesting
      const totalAvailable = totalWithheldInAccounts + mintWithheldAmount;
      
      // Check if tax meets minimum threshold
      const thresholdMet = await TaxService.checkMinimumTaxThreshold(totalAvailable, decimals);
      
      if (!thresholdMet) {
        logger.info('Tax below minimum threshold, rolling over', {
          totalAvailable: totalAvailable.toString(),
          totalAvailableHuman: (Number(totalAvailable) / Math.pow(10, decimals)).toFixed(6),
          note: 'Tax will accumulate until threshold is met. No harvest performed.',
        });
        // Return null to skip harvest - tax remains accumulated and will be checked again next cycle
        return null;
      }

      // Step 5: Harvest from accounts with withheld fees
      // Use explicit list of accounts (more reliable than empty array)
      const harvestSources = accountsWithWithheldList.length > 0 
        ? accountsWithWithheldList 
        : []; // Fallback to empty array if no accounts found (shouldn't happen if scan worked)
      
      // Log what we're about to do
      if (totalAvailable > 0n) {
        logger.info('Withheld tokens detected - proceeding with harvest', {
          totalWithheldInAccounts: totalWithheldInAccounts.toString(),
          mintWithheldAmount: mintWithheldAmount.toString(),
          totalAvailable: totalAvailable.toString(),
          accountsToHarvest: harvestSources.length,
          thresholdMet: true,
        });
      } else {
        logger.info('No withheld tokens detected in scan, but attempting harvest anyway', {
          reason: 'Scan might miss accounts or new fees collected since scan',
          totalWithheldInAccounts: totalWithheldInAccounts.toString(),
          mintWithheldAmount: mintWithheldAmount.toString(),
          thresholdMet: true,
        });
      }
      
      // Attempt harvest from specific accounts (or all if empty array)
      let harvestSignature: string | undefined;
      try {
        if (harvestSources.length > 0) {
          logger.info('Harvesting withheld tokens from specific token accounts to mint', {
            sourceAccountsCount: harvestSources.length,
            sourceAccounts: harvestSources.map(p => p.toBase58()),
            estimatedFromScan: totalWithheldInAccounts.toString(),
          });
        } else {
          logger.info('Harvesting withheld tokens from ALL token accounts to mint (fallback)', {
            sources: 'ALL (empty array = all accounts)',
            estimatedFromScan: totalWithheldInAccounts.toString(),
          });
        }
        
        // Get mint withheld amount BEFORE harvest to compare
        const mintAccountBeforeHarvest = await connection.getAccountInfo(tokenMint);
        if (!mintAccountBeforeHarvest) {
          throw new Error('Mint account not found');
        }
        const parsedMintBeforeHarvest = unpackMint(tokenMint, mintAccountBeforeHarvest, TOKEN_2022_PROGRAM_ID);
        const transferFeeConfigBeforeHarvest = getTransferFeeConfig(parsedMintBeforeHarvest);
        const mintWithheldBeforeHarvest = transferFeeConfigBeforeHarvest?.withheldAmount || 0n;
        
        logger.info('Mint withheld amount BEFORE harvest', {
          mintWithheldAmount: mintWithheldBeforeHarvest.toString(),
          mintWithheldAmountHuman: (Number(mintWithheldBeforeHarvest) / Math.pow(10, decimals)).toFixed(6),
        });
        
        harvestSignature = await harvestWithheldTokensToMint(
          connection,
          withdrawWallet,
          tokenMint,
          harvestSources, // Explicit list of accounts with withheld fees
          { commitment: 'confirmed' }
        );

        // Wait a moment for the transaction to fully settle, then verify
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to get transaction details to see what happened
        try {
          const txDetails = await connection.getParsedTransaction(harvestSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          });
          
          if (txDetails && txDetails.meta) {
            logger.debug('Harvest transaction details', {
              signature: harvestSignature,
              fee: txDetails.meta.fee,
              err: txDetails.meta.err,
              logMessages: txDetails.meta.logMessages?.slice(0, 5), // First 5 log messages
            });
          }
        } catch (txError) {
          logger.debug('Could not fetch harvest transaction details', {
            error: txError instanceof Error ? txError.message : String(txError),
          });
        }
        
        // Get mint withheld amount AFTER harvest to see if anything was harvested
        const mintAccountAfterHarvestCheck = await connection.getAccountInfo(tokenMint, 'confirmed');
        if (!mintAccountAfterHarvestCheck) {
          throw new Error('Mint account not found after harvest');
        }
        const parsedMintAfterHarvestCheck = unpackMint(tokenMint, mintAccountAfterHarvestCheck, TOKEN_2022_PROGRAM_ID);
        const transferFeeConfigAfterHarvestCheck = getTransferFeeConfig(parsedMintAfterHarvestCheck);
        const mintWithheldAfterHarvestCheck = transferFeeConfigAfterHarvestCheck?.withheldAmount || 0n;
        const harvestedAmount = mintWithheldAfterHarvestCheck - mintWithheldBeforeHarvest;
        
        logger.info('Harvest completed - verifying results', {
          signature: harvestSignature,
          mintWithheldBefore: mintWithheldBeforeHarvest.toString(),
          mintWithheldAfter: mintWithheldAfterHarvestCheck.toString(),
          harvestedAmount: harvestedAmount.toString(),
          harvestedAmountHuman: (Number(harvestedAmount) / Math.pow(10, decimals)).toFixed(6),
        });
        
        if (harvestedAmount > 0n) {
          logger.info('✅ Harvest successfully moved tokens to mint', {
            amount: harvestedAmount.toString(),
            amountHuman: (Number(harvestedAmount) / Math.pow(10, decimals)).toFixed(6),
          });
        } else if (harvestedAmount < 0n) {
          logger.warn('⚠️  Mint withheld amount decreased after harvest (unexpected)', {
            delta: harvestedAmount.toString(),
            possibleReason: 'Tokens may have been withdrawn by another process',
          });
        } else {
          logger.info('ℹ️  Harvest found no new tokens to move (mint withheld unchanged)', {
            reason: 'No fees in token accounts or fees already in mint',
            diagnostic: {
              totalAccountsScanned: 'See pre-harvest check logs',
              accountsWithWithheld: 'See pre-harvest check logs',
              mintWithheldBefore: mintWithheldBeforeHarvest.toString(),
              mintWithheldAfter: mintWithheldAfterHarvestCheck.toString(),
            },
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // If harvest fails with "no withheld tokens", that's okay - just log it
        if (errorMessage.includes('no withheld') || errorMessage.includes('No withheld')) {
          logger.info('Harvest found no withheld tokens (this is normal if no fees collected)', {
            signature: harvestSignature,
          });
        } else {
          logger.error('Failed to harvest withheld tokens', {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        // Continue - might still be able to withdraw from mint if there was something already there
      }

      // Step 4: Create withdrawal account (reward wallet ATA)
      // rewardWalletAddress already declared above
      const rewardTokenAccount = getAssociatedTokenAddressSync(
        tokenMint,
        rewardWalletAddress,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Check if reward token account exists, create if needed
      const rewardAccountInfo = await connection.getAccountInfo(rewardTokenAccount).catch(() => null);
      let balanceBefore = BigInt(0);
      
      if (rewardAccountInfo) {
        // Get balance before withdrawal to calculate how much was withdrawn
        const rewardAccount = await getAccount(connection, rewardTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
        balanceBefore = rewardAccount.amount;
        logger.debug('Reward token account balance before withdrawal', {
          balance: balanceBefore.toString(),
        });
      } else {
        // Create the account
        const createTx = new Transaction();
        createTx.add(
          createAssociatedTokenAccountInstruction(
            withdrawWallet.publicKey, // Payer
            rewardTokenAccount,
            rewardWalletAddress,
            tokenMint,
            TOKEN_2022_PROGRAM_ID
          )
        );

        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        createTx.recentBlockhash = blockhash;
        createTx.feePayer = withdrawWallet.publicKey;

        await sendAndConfirmTransaction(
          connection,
          createTx,
          [withdrawWallet],
          { commitment: 'confirmed', maxRetries: 3 }
        );
        logger.info('Created reward token account', {
          account: rewardTokenAccount.toBase58(),
        });
      }

      // Step 5: Withdraw withheld tokens from mint to reward wallet
      // After harvesting, tokens are in the mint, so we need to withdraw from the mint
      let withdrawSignature: string | undefined;
      let withdrawnAmount = BigInt(0);
      
      // Re-check mint withheld amount after harvest
      const mintAccountAfterHarvest = await connection.getAccountInfo(tokenMint);
      if (!mintAccountAfterHarvest) {
        throw new Error('Mint account not found after harvest');
      }
      const parsedMintAfterHarvest = unpackMint(tokenMint, mintAccountAfterHarvest, TOKEN_2022_PROGRAM_ID);
      const transferFeeConfigAfterHarvest = getTransferFeeConfig(parsedMintAfterHarvest);
      const mintWithheldAfterHarvest = transferFeeConfigAfterHarvest?.withheldAmount || 0n;
      
      logger.info('Mint withheld amount after harvest', {
        mintWithheldAmount: mintWithheldAfterHarvest.toString(),
        mintWithheldAmountHuman: (Number(mintWithheldAfterHarvest) / Math.pow(10, decimals)).toFixed(6),
      });
      
      // Check mint after harvest - if still zero, nothing to withdraw
      if (mintWithheldAfterHarvest === 0n) {
        logger.info('No tokens in mint after harvest - nothing to withdraw', {
          reason: 'No tax collected or already withdrawn in previous cycle',
          mintWithheldBeforeHarvest: mintWithheldAmount.toString(),
          mintWithheldAfterHarvest: mintWithheldAfterHarvest.toString(),
        });
        return null;
      }
      
      logger.info('Tokens found in mint after harvest - proceeding with withdrawal', {
        mintWithheldAmount: mintWithheldAfterHarvest.toString(),
        mintWithheldAmountHuman: (Number(mintWithheldAfterHarvest) / Math.pow(10, decimals)).toFixed(6),
      });
      
      // Withdraw from mint (tokens are in the mint after harvesting)
      try {
        const { withdrawWithheldTokensFromMint } = await import('@solana/spl-token');
        const emptySigners: Keypair[] = [];
        
        logger.info('Withdrawing withheld tokens from mint', {
          mintWithheldAmount: mintWithheldAfterHarvest.toString(),
          destination: rewardTokenAccount.toBase58(),
        });
        
        withdrawSignature = await withdrawWithheldTokensFromMint(
          connection,
          withdrawWallet, // Payer
          tokenMint, // Mint
          rewardTokenAccount, // Destination
          withdrawWallet.publicKey, // Authority
          emptySigners, // Multi-signers
          { commitment: 'confirmed' }, // ConfirmOptions
          TOKEN_2022_PROGRAM_ID // Program ID
        );

        // Get the balance after withdrawal to determine how much was withdrawn
        const rewardAccount = await getAccount(connection, rewardTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
        const balanceAfter = rewardAccount.amount;
        withdrawnAmount = balanceAfter - balanceBefore;

        logger.info('Withdrew withheld tokens from mint', {
          signature: withdrawSignature,
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
          withdrawnAmount: withdrawnAmount.toString(),
          to: rewardTokenAccount.toBase58(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn('Failed to withdraw withheld tokens from mint', {
          error: errorMessage,
          authority: withdrawWallet.publicKey.toBase58(),
        });
        
        // Check if it's an authority error
        if (errorMessage.includes('authority') || errorMessage.includes('insufficient')) {
          logger.error('Withdraw authority mismatch. Please update the withdraw withheld authority on the mint to match the wallet being used.');
        }
        
        return null;
      }

      if (withdrawnAmount === BigInt(0)) {
        logger.info('No withheld tokens were withdrawn', {
          reason: 'No tax collected or already withdrawn',
          withdrawnAmount: withdrawnAmount.toString(),
        });
        return null;
      }
      
      logger.info('Tax withdrawal successful', {
        withdrawnAmount: withdrawnAmount.toString(),
        signature: withdrawSignature,
      });

      const totalTax = withdrawnAmount;

      logger.info('Tax distribution calculated from withheld tokens', {
        totalTax: totalTax.toString(),
        decimals,
      });

      // Step 7: Swap TEK to SOL via Raydium (with batch support for large amounts)
      logger.info('Swapping harvested TEK to SOL', {
        nukeAmount: withdrawnAmount.toString(),
        nukeAmountHuman: (Number(withdrawnAmount) / Math.pow(10, decimals)).toFixed(6),
      });

      // Check if harvest should be split into batches
      const shouldSplit = await TaxService.shouldSplitHarvest(withdrawnAmount, decimals);
      
      let swapResult: { solReceived: bigint; txSignature: string } | null = null;
      let swapSignatures: string[] = [];

      if (shouldSplit) {
        // Execute batch harvest
        logger.info('Large harvest detected - using batch mode', {
          nukeAmount: withdrawnAmount.toString(),
          nukeAmountHuman: (Number(withdrawnAmount) / Math.pow(10, decimals)).toFixed(6),
        });

        try {
          const batchResult = await TaxService.executeBatchHarvest(withdrawnAmount, decimals);
          swapResult = {
            solReceived: batchResult.solReceived,
            txSignature: batchResult.txSignatures.join(','), // Comma-separated for logging
          };
          swapSignatures = batchResult.txSignatures;
          
          logger.info('Batch TEK swap to SOL completed successfully', {
            nukeAmount: withdrawnAmount.toString(),
            solReceived: swapResult.solReceived.toString(),
            batchCount: swapSignatures.length,
            swapSignatures,
          });
        } catch (error) {
          logger.error('Failed to execute batch swap TEK to SOL - aborting distribution', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            nukeAmount: withdrawnAmount.toString(),
            nukeAmountHuman: (Number(withdrawnAmount) / Math.pow(10, decimals)).toFixed(6),
          });
          return null; // Abort if batch swap fails
        }
      } else {
        // Execute single swap
        try {
          const { swapNukeToSOL } = await import('./swapService');
          swapResult = await swapNukeToSOL(withdrawnAmount);
          swapSignatures = [swapResult.txSignature];
          
          logger.info('TEK swapped to SOL successfully (single swap)', {
            nukeAmount: withdrawnAmount.toString(),
            solReceived: swapResult.solReceived.toString(),
            swapSignature: swapResult.txSignature,
          });
        } catch (error) {
          logger.error('Failed to swap TEK to SOL - aborting distribution', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            nukeAmount: withdrawnAmount.toString(),
            nukeAmountHuman: (Number(withdrawnAmount) / Math.pow(10, decimals)).toFixed(6),
          });
          return null; // Abort if swap fails
        }
      }

      if (!swapResult || swapResult.solReceived === 0n) {
        logger.warn('Swap returned zero SOL - skipping distribution');
        return null;
      }

      const totalSolReceived = swapResult.solReceived;

      // Step 8: Split SOL: 75% to holders, 25% to treasury
      const holdersSol = (totalSolReceived * BigInt(75)) / BigInt(100); // 75% to holders
      const treasurySol = (totalSolReceived * BigInt(25)) / BigInt(100); // 25% to treasury

      logger.info('SOL split calculated', {
        totalSolReceived: totalSolReceived.toString(),
        holdersSol: holdersSol.toString(),
        treasurySol: treasurySol.toString(),
      });

      // Step 9: Distribute SOL to holders
      let distributionResult: {
        distributedCount: number;
        totalDistributed: bigint;
        skippedCount: number;
        signatures: Array<{ pubkey: string; amount: bigint; signature: string }>;
        errors: Array<{ pubkey: string; error: string }>;
      } | null = null;

      if (holdersSol > 0n) {
        try {
          const { distributeSolToHolders } = await import('./solDistributionService');
          distributionResult = await distributeSolToHolders(holdersSol);
          
          logger.info('SOL distributed to holders', {
            distributedCount: distributionResult.distributedCount,
            totalDistributed: distributionResult.totalDistributed.toString(),
            skippedCount: distributionResult.skippedCount,
            errors: distributionResult.errors.length,
          });
        } catch (error) {
          logger.error('Failed to distribute SOL to holders', {
            error: error instanceof Error ? error.message : String(error),
            holdersSol: holdersSol.toString(),
          });
          // Continue - treasury portion can still be sent
        }
      }

      // Step 10: Send treasury portion to treasury wallet
      const treasuryWalletAddress = getTreasuryWalletAddress();
      let treasurySignature: string | undefined;

      if (treasurySol > 0n) {
        try {
          const treasuryTx = new Transaction();
          treasuryTx.add(
            SystemProgram.transfer({
              fromPubkey: rewardWalletAddress,
              toPubkey: treasuryWalletAddress,
              lamports: Number(treasurySol),
            })
          );

          const { blockhash } = await connection.getLatestBlockhash('confirmed');
          treasuryTx.recentBlockhash = blockhash;
          treasuryTx.feePayer = rewardWalletAddress;

          // Use reward wallet to sign treasury transfer (reward wallet has the SOL)
          const rewardWallet = getRewardWallet();
          treasurySignature = await sendAndConfirmTransaction(
            connection,
            treasuryTx,
            [rewardWallet],
            { commitment: 'confirmed', maxRetries: 3 }
          );

          logger.info('Treasury SOL sent', {
            signature: treasurySignature,
            amount: treasurySol.toString(),
            to: treasuryWalletAddress.toBase58(),
          });
        } catch (error) {
          logger.error('Failed to send treasury SOL', {
            error: error instanceof Error ? error.message : String(error),
            amount: treasurySol.toString(),
          });
        }
      }

      // Step 11: Update tax state
      const taxState = loadTaxState();
      const currentTotalTax = BigInt(taxState.totalTaxCollected || '0');
      const currentReward = BigInt(taxState.totalRewardAmount || '0');
      const currentTreasury = BigInt(taxState.totalTreasuryAmount || '0');
      const currentSolDistributed = BigInt(taxState.totalSolDistributed || '0');
      const currentSolToTreasury = BigInt(taxState.totalSolToTreasury || '0');
      const currentNukeHarvested = BigInt(taxState.totalNukeHarvested || '0');
      const currentNukeSold = BigInt(taxState.totalNukeSold || '0');

      taxState.totalTaxCollected = (currentTotalTax + totalTax).toString();
      taxState.totalRewardAmount = (currentReward + holdersSol).toString(); // SOL amount
      taxState.totalTreasuryAmount = (currentTreasury + treasurySol).toString(); // SOL amount
      taxState.totalSolDistributed = (currentSolDistributed + (distributionResult?.totalDistributed || 0n)).toString();
      taxState.totalSolToTreasury = (currentSolToTreasury + treasurySol).toString();
      taxState.totalNukeHarvested = (currentNukeHarvested + totalTax).toString();
      taxState.totalNukeSold = (currentNukeSold + totalTax).toString();
      taxState.lastTaxDistribution = Date.now();
      taxState.lastDistributionCycleNumber = cycleNumber || null; // Store cycle number when distribution occurred
      taxState.lastDistributionEpoch = epoch || null; // Store epoch when distribution occurred
      taxState.lastDistributionSolToHolders = holdersSol.toString(); // Store last distribution amount to holders
      taxState.lastDistributionSolToTreasury = treasurySol.toString(); // Store last distribution amount to treasury
      taxState.lastSwapTx = swapSignatures.length > 0 ? swapSignatures.join(',') : swapResult.txSignature;
      taxState.lastDistributionTx = distributionResult?.signatures.map(s => s.signature).join(',') || null;
      taxState.lastDistributionTime = Date.now();
      
      taxState.taxDistributions.push({
        timestamp: Date.now(),
        transactionAmount: totalTax.toString(), // Total NUKE tax collected
        rewardAmount: holdersSol.toString(), // SOL distributed to holders
        treasuryAmount: treasurySol.toString(), // SOL sent to treasury
        fromAddress: 'mint', // Withdrawn from mint
        rewardSignature: swapSignatures.length > 0 ? swapSignatures.join(',') : swapResult.txSignature, // Swap transaction(s)
        treasurySignature,
      });

      // Keep only last 100 distributions
      if (taxState.taxDistributions.length > 100) {
        taxState.taxDistributions = taxState.taxDistributions.slice(-100);
      }

      saveTaxState(taxState);

      logger.info('Tax distribution complete', {
        totalTax: totalTax.toString(),
        nukeSold: totalTax.toString(),
        solReceived: totalSolReceived.toString(),
        holdersSol: holdersSol.toString(),
        treasurySol: treasurySol.toString(),
        distributedCount: distributionResult?.distributedCount || 0,
        swapSignature: swapSignatures.length > 0 ? swapSignatures.join(',') : swapResult.txSignature,
        swapSignatureCount: swapSignatures.length,
        treasurySignature,
        totalTaxCollected: taxState.totalTaxCollected,
        totalRewardAmount: taxState.totalRewardAmount,
        totalTreasuryAmount: taxState.totalTreasuryAmount,
      });

      return {
        rewardAmount: holdersSol, // SOL amount
        treasuryAmount: treasurySol, // SOL amount
        totalTax,
        treasurySignature,
        swapSignature: swapSignatures.length > 0 ? swapSignatures.join(',') : swapResult.txSignature,
        distributionResult: distributionResult || undefined,
      };
    } catch (error) {
      logger.error('Error processing withheld tax', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Distribute tax from a token transfer
   * 
   * This is a legacy function for manual tax distribution.
   * In production, use processWithheldTax() which handles Token-2022
   * automatic tax collection.
   * 
   * @param from - PublicKey of the sender (where tax is collected from)
   * @param amount - Transfer amount in token units (raw, with decimals)
   * @returns Tax distribution result with amounts and transaction signatures
   */
  static async distributeTax(from: PublicKey, amount: number): Promise<TaxDistributionResult> {
    // Validate input
    if (amount <= 0) {
      throw new Error('Transfer amount must be greater than 0');
    }

    logger.info('Distributing tax from token transfer', {
      from: from.toBase58(),
      transferAmount: amount.toString(),
    });

    try {
      // Step 1: Get token mint info (for decimals)
      const mintInfo = await getMint(connection, tokenMint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const decimals = mintInfo.decimals;

      // Step 2: Convert amount to BigInt for precise calculations
      const transferAmountBigInt = BigInt(Math.floor(amount));

      // Step 3: Calculate tax amounts (4% total: 3% reward + 1% treasury)
      const totalTax = (transferAmountBigInt * BigInt(Math.floor(TOTAL_TAX_PERCENT * 10000))) / BigInt(10000);
      const rewardAmount = (transferAmountBigInt * BigInt(Math.floor(REWARD_PERCENT * 10000))) / BigInt(10000);
      const treasuryAmount = (transferAmountBigInt * BigInt(Math.floor(TREASURY_PERCENT * 10000))) / BigInt(10000);

      // Log tax calculation
      logger.info('Tax distribution calculated', {
        transferAmount: transferAmountBigInt.toString(),
        totalTax: totalTax.toString(),
        rewardAmount: rewardAmount.toString(),
        treasuryAmount: treasuryAmount.toString(),
        rewardPercent: `${(REWARD_PERCENT * 100).toFixed(1)}%`,
        treasuryPercent: `${(TREASURY_PERCENT * 100).toFixed(1)}%`,
        decimals,
      });

      // Step 4: Get wallet addresses
      const rewardWalletAddress = getRewardWalletAddress();
      const treasuryWalletAddress = getTreasuryWalletAddress();

      // Step 5: Get sender's token account
      const fromTokenAccount = getAssociatedTokenAddressSync(
        tokenMint,
        from,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Step 6: Get or create reward wallet token account
      const rewardTokenAccount = getAssociatedTokenAddressSync(
        tokenMint,
        rewardWalletAddress,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Step 7: Get or create treasury wallet token account
      const treasuryTokenAccount = getAssociatedTokenAddressSync(
        tokenMint,
        treasuryWalletAddress,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Step 8: Check if reward and treasury token accounts exist, create if needed
      const rewardAccountInfo = await connection.getAccountInfo(rewardTokenAccount).catch(() => null);
      const treasuryAccountInfo = await connection.getAccountInfo(treasuryTokenAccount).catch(() => null);

      // Step 9: Get sender keypair (needed for signing transfers)
      // Note: In a real implementation, the sender would sign these transactions
      // For now, we'll need the sender's private key or use a service wallet
      // This is a placeholder - actual implementation depends on how transfers are detected
      const senderWallet = getRewardWallet(); // Using reward wallet as sender for now
      if (!senderWallet) {
        throw new Error('REWARD_WALLET_PRIVATE_KEY_JSON is required to send tax distributions');
      }

      const result: TaxDistributionResult = {
        rewardAmount,
        treasuryAmount,
        totalTax,
      };

      // Step 10: Send 3% to reward wallet
      if (rewardAmount > 0n) {
        try {
          const rewardTx = new Transaction();

          // Create reward token account if it doesn't exist
          if (!rewardAccountInfo) {
            rewardTx.add(
              createAssociatedTokenAccountInstruction(
                senderWallet.publicKey, // Payer
                rewardTokenAccount,
                rewardWalletAddress, // Owner
                tokenMint,
                TOKEN_2022_PROGRAM_ID
              )
            );
          }

          // Transfer tokens to reward wallet
          rewardTx.add(
            createTransferCheckedInstruction(
              fromTokenAccount,
              tokenMint,
              rewardTokenAccount,
              from, // Authority (sender)
              rewardAmount,
              decimals,
              [],
              TOKEN_2022_PROGRAM_ID
            )
          );

          const { blockhash } = await connection.getLatestBlockhash('confirmed');
          rewardTx.recentBlockhash = blockhash;
          rewardTx.feePayer = senderWallet.publicKey;

          // Sign with sender (in real implementation, sender would sign)
          // For now, we'll need to handle this differently based on how transfers are detected
          const rewardSignature = await sendAndConfirmTransaction(
            connection,
            rewardTx,
            [senderWallet],
            { commitment: 'confirmed', maxRetries: 3 }
          );

          // Legacy function - rewardSignature not used in new model
          // result.rewardSignature = rewardSignature;

          logger.info('Tax sent to reward wallet', {
            signature: rewardSignature,
            amount: rewardAmount.toString(),
            to: rewardWalletAddress.toBase58(),
            decimals,
          });
        } catch (error) {
          logger.error('Failed to send tax to reward wallet', {
            error: error instanceof Error ? error.message : String(error),
            amount: rewardAmount.toString(),
          });
          // Continue with treasury transfer even if reward fails
        }
      }

      // Step 11: Send 1% to treasury wallet
      if (treasuryAmount > 0n) {
        try {
          const treasuryTx = new Transaction();

          // Create treasury token account if it doesn't exist
          if (!treasuryAccountInfo) {
            treasuryTx.add(
              createAssociatedTokenAccountInstruction(
                senderWallet.publicKey, // Payer
                treasuryTokenAccount,
                treasuryWalletAddress, // Owner
                tokenMint,
                TOKEN_2022_PROGRAM_ID
              )
            );
          }

          // Transfer tokens to treasury wallet
          treasuryTx.add(
            createTransferCheckedInstruction(
              fromTokenAccount,
              tokenMint,
              treasuryTokenAccount,
              from, // Authority (sender)
              treasuryAmount,
              decimals,
              [],
              TOKEN_2022_PROGRAM_ID
            )
          );

          const { blockhash } = await connection.getLatestBlockhash('confirmed');
          treasuryTx.recentBlockhash = blockhash;
          treasuryTx.feePayer = senderWallet.publicKey;

          // Sign with sender
          const treasurySignature = await sendAndConfirmTransaction(
            connection,
            treasuryTx,
            [senderWallet],
            { commitment: 'confirmed', maxRetries: 3 }
          );

          result.treasurySignature = treasurySignature;

          logger.info('Tax sent to treasury wallet', {
            signature: treasurySignature,
            amount: treasuryAmount.toString(),
            to: treasuryWalletAddress.toBase58(),
            decimals,
          });
        } catch (error) {
          logger.error('Failed to send tax to treasury wallet', {
            error: error instanceof Error ? error.message : String(error),
            amount: treasuryAmount.toString(),
          });
        }
      }

      // Step 12: Update tax state
      const taxState = loadTaxState();
      const currentTotalTax = BigInt(taxState.totalTaxCollected || '0');
      const currentReward = BigInt(taxState.totalRewardAmount || '0');
      const currentTreasury = BigInt(taxState.totalTreasuryAmount || '0');

      taxState.totalTaxCollected = (currentTotalTax + totalTax).toString();
      taxState.totalRewardAmount = (currentReward + rewardAmount).toString();
      taxState.totalTreasuryAmount = (currentTreasury + treasuryAmount).toString();
      taxState.lastTaxDistribution = Date.now();
      taxState.taxDistributions.push({
        timestamp: Date.now(),
        transactionAmount: transferAmountBigInt.toString(),
        rewardAmount: rewardAmount.toString(),
        treasuryAmount: treasuryAmount.toString(),
        fromAddress: from.toBase58(),
        rewardSignature: undefined, // Not used in new model
        treasurySignature: result.treasurySignature,
      });

      // Keep only last 100 distributions (to prevent file from growing too large)
      if (taxState.taxDistributions.length > 100) {
        taxState.taxDistributions = taxState.taxDistributions.slice(-100);
      }

      saveTaxState(taxState);

      logger.info('Tax distribution complete', {
        totalTax: totalTax.toString(),
        rewardAmount: rewardAmount.toString(),
        treasuryAmount: treasuryAmount.toString(),
        treasurySignature: result.treasurySignature,
        totalTaxCollected: taxState.totalTaxCollected,
        totalRewardAmount: taxState.totalRewardAmount,
        totalTreasuryAmount: taxState.totalTreasuryAmount,
      });

      return result;
    } catch (error) {
      logger.error('Error distributing tax', {
        error: error instanceof Error ? error.message : String(error),
        from: from.toBase58(),
        amount: amount.toString(),
      });
      throw error;
    }
  }

  /**
   * Get tax statistics
   * 
   * Returns current tax distribution totals and statistics
   */
  static getTaxStatistics(): {
    totalTaxCollected: string;
    totalRewardAmount: string;
    totalTreasuryAmount: string;
    totalSolDistributed: string;
    totalSolToTreasury: string;
    totalNukeHarvested: string;
    totalNukeSold: string;
    lastTaxDistribution: number | null;
    lastDistributionCycleNumber: number | null;
    lastDistributionEpoch: string | null;
    lastDistributionSolToHolders: string;
    lastDistributionSolToTreasury: string;
    lastSwapTx: string | null;
    lastDistributionTx: string | null;
    distributionCount: number;
  } {
    const taxState = loadTaxState();
    
    return {
      totalTaxCollected: taxState.totalTaxCollected,
      totalRewardAmount: taxState.totalRewardAmount, // SOL amount
      totalTreasuryAmount: taxState.totalTreasuryAmount, // SOL amount
      totalSolDistributed: taxState.totalSolDistributed || '0',
      totalSolToTreasury: taxState.totalSolToTreasury || '0',
      totalNukeHarvested: taxState.totalNukeHarvested || '0',
      totalNukeSold: taxState.totalNukeSold || '0',
      lastTaxDistribution: taxState.lastTaxDistribution,
      lastDistributionCycleNumber: taxState.lastDistributionCycleNumber || null,
      lastDistributionEpoch: taxState.lastDistributionEpoch || null,
      lastDistributionSolToHolders: taxState.lastDistributionSolToHolders || '0',
      lastDistributionSolToTreasury: taxState.lastDistributionSolToTreasury || '0',
      lastSwapTx: taxState.lastSwapTx,
      lastDistributionTx: taxState.lastDistributionTx,
      distributionCount: taxState.taxDistributions.length,
    };
  }
}

// Export singleton instance for convenience
export const taxService = TaxService;
