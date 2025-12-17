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
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tax Distribution Service
 * 
 * Handles 4% transaction tax on NUKE token transfers:
 * - 3% → Sent to Reward wallet (for distribution to holders)
 * - 1% → Sent to Treasury wallet
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
  totalTaxCollected: string; // Total NUKE tax collected (in token units, as string for BigInt)
  totalRewardAmount: string; // Total SOL distributed to holders (in lamports, as string for BigInt)
  totalTreasuryAmount: string; // Total SOL sent to treasury (in lamports, as string for BigInt)
  totalSolDistributed: string; // Total SOL distributed to holders (in lamports)
  totalSolToTreasury: string; // Total SOL sent to treasury (in lamports)
  totalNukeHarvested: string; // Total NUKE harvested from mint (in token units)
  totalNukeSold: string; // Total NUKE sold for SOL (in token units)
  lastTaxDistribution: number | null; // Timestamp of last tax distribution
  lastSwapTx: string | null; // Last swap transaction signature
  lastDistributionTx: string | null; // Last distribution transaction signatures (comma-separated)
  lastDistributionTime: number | null; // Timestamp of last distribution
  taxDistributions: Array<{
    timestamp: number;
    transactionAmount: string; // NUKE amount harvested
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
    
    // Save to file
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
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
   * Process withheld tax from Token-2022 transfers
   * 
   * Withdraws withheld tokens from the mint and distributes them:
   * - 3% → Reward wallet (for later distribution to holders)
   * - 1% → Treasury wallet
   * 
   * This function should be called periodically to process accumulated
   * transfer fees that have been withheld by the Token-2022 program.
   * 
   * @returns Tax distribution result with amounts and transaction signatures
   * 
   * Environment variables required:
   * - REWARD_WALLET_ADDRESS: Public key of reward wallet (optional, derived from private key if not set)
   * - TREASURY_WALLET_ADDRESS: Public key of treasury wallet (optional, derived from private key if not set)
   * - REWARD_WALLET_PRIVATE_KEY_JSON: JSON array of 64 numbers (required for withdrawals)
   * - TREASURY_WALLET_PRIVATE_KEY_JSON: JSON array of 64 numbers (optional, treasury can be receive-only)
   */
  static async processWithheldTax(): Promise<TaxDistributionResult | null> {
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

      // Step 3: Harvest withheld tokens to mint (collects from all token accounts)
      // This moves withheld fees from individual accounts to the mint
      try {
        const emptySources: PublicKey[] = []; // Explicitly typed empty array for sources
        const harvestSignature = await harvestWithheldTokensToMint(
          connection, // Connection (first parameter)
          withdrawWallet, // Authority (Signer/Keypair) - must match withdraw authority
          tokenMint, // Mint (PublicKey) - third parameter
          emptySources, // Sources (PublicKey[] - empty array = all token accounts)
          { commitment: 'confirmed' } // ConfirmOptions (programId determined from connection)
        );

        logger.info('Harvested withheld tokens to mint', {
          signature: harvestSignature,
        });
      } catch (error) {
        logger.warn('Failed to harvest withheld tokens (may be none available)', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue - withdrawal might still work even if harvest fails
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
      
      if (mintWithheldAfterHarvest === 0n) {
        logger.info('No tokens withheld in mint after harvest - checking token accounts');
        // Try withdrawing from token accounts (in case harvest didn't move them to mint)
        try {
          const emptySources: PublicKey[] = [];
          const emptySigners: Keypair[] = [];
          withdrawSignature = await withdrawWithheldTokensFromAccounts(
            connection,
            withdrawWallet,
            tokenMint,
            rewardTokenAccount,
            withdrawWallet.publicKey,
            emptySigners,
            emptySources,
            { commitment: 'confirmed' },
            TOKEN_2022_PROGRAM_ID
          );
          
          const rewardAccount = await getAccount(connection, rewardTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
          const balanceAfter = rewardAccount.amount;
          withdrawnAmount = balanceAfter - balanceBefore;
          
          logger.info('Withdrew from token accounts', {
            signature: withdrawSignature,
            withdrawnAmount: withdrawnAmount.toString(),
          });
        } catch (error) {
          logger.warn('Failed to withdraw from token accounts', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
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

      // Step 7: Swap NUKE to SOL via Raydium
      logger.info('Swapping harvested NUKE to SOL', {
        nukeAmount: withdrawnAmount.toString(),
      });

      let swapResult: { solReceived: bigint; txSignature: string } | null = null;
      try {
        const { swapNukeToSOL } = await import('./swapService');
        swapResult = await swapNukeToSOL(withdrawnAmount);
        
        logger.info('NUKE swapped to SOL successfully', {
          nukeAmount: withdrawnAmount.toString(),
          solReceived: swapResult.solReceived.toString(),
          swapSignature: swapResult.txSignature,
        });
      } catch (error) {
        logger.error('Failed to swap NUKE to SOL - aborting distribution', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          nukeAmount: withdrawnAmount.toString(),
          nukeAmountHuman: (Number(withdrawnAmount) / Math.pow(10, decimals)).toFixed(6),
        });
        return null; // Abort if swap fails
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

          treasurySignature = await sendAndConfirmTransaction(
            connection,
            treasuryTx,
            [withdrawWallet],
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
      taxState.lastSwapTx = swapResult.txSignature;
      taxState.lastDistributionTx = distributionResult?.signatures.map(s => s.signature).join(',') || null;
      taxState.lastDistributionTime = Date.now();
      
      taxState.taxDistributions.push({
        timestamp: Date.now(),
        transactionAmount: totalTax.toString(), // Total NUKE tax collected
        rewardAmount: holdersSol.toString(), // SOL distributed to holders
        treasuryAmount: treasurySol.toString(), // SOL sent to treasury
        fromAddress: 'mint', // Withdrawn from mint
        rewardSignature: swapResult.txSignature, // Swap transaction
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
        swapSignature: swapResult.txSignature,
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
        swapSignature: swapResult.txSignature,
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
      lastSwapTx: taxState.lastSwapTx,
      lastDistributionTx: taxState.lastDistributionTx,
      distributionCount: taxState.taxDistributions.length,
    };
  }
}

// Export singleton instance for convenience
export const taxService = TaxService;
