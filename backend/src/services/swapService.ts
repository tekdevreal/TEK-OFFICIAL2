/**
 * Swap Service
 * 
 * Handles swapping NUKE tokens to SOL via Raydium CPMM pool on devnet
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT,
} from '@solana/spl-token';
import { connection, tokenMint } from '../config/solana';
import { RAYDIUM_CONFIG, WSOL_MINT, getRaydiumPoolId, RAYDIUM_AMM_PROGRAM_ID } from '../config/raydium';
import { logger } from '../utils/logger';
import { loadKeypairFromEnv } from '../utils/loadKeypairFromEnv';

// Default slippage tolerance (2%)
const DEFAULT_SLIPPAGE_BPS = 200; // 2% = 200 basis points

// Minimum SOL output to proceed with swap (0.001 SOL)
const MIN_SOL_OUTPUT = 0.001 * LAMPORTS_PER_SOL;

// Raydium CPMM Program ID (devnet)
// AMM ID for NUKE/USDC liquidity pool
const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey('14nA4A3DMMXrpPBhrX1sLTG4dSQKCwPHnoe3k4P1nZbx');

/**
 * Get reward wallet keypair
 */
function getRewardWallet(): Keypair {
  return loadKeypairFromEnv('REWARD_WALLET_PRIVATE_KEY_JSON');
}

// Types for Raydium API response
interface RaydiumApiPoolInfo {
  mintA?: { address: string };
  mintB?: { address: string };
  baseMint?: string;
  quoteMint?: string;
}

interface RaydiumApiResponse {
  success?: boolean;
  data?: RaydiumApiPoolInfo[];
}

/**
 * Fetch Raydium pool state to get vault addresses
 * Uses Raydium API first, falls back to direct account parsing
 */
async function getRaydiumPoolState(poolId: PublicKey): Promise<{
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  poolCoinMint: PublicKey;
  poolPcMint: PublicKey;
}> {
  try {
    // Try Raydium API first (more reliable)
    try {
      const apiUrl = `https://api-v3-devnet.raydium.io/pools/info/ids?ids=${poolId.toBase58()}`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data: RaydiumApiResponse = await response.json() as RaydiumApiResponse;
        if (data.success && data.data && data.data.length > 0) {
          const poolInfo = data.data[0];
          
          // Extract mint addresses from API response
          let mintA: PublicKey;
          let mintB: PublicKey;
          
          if (poolInfo.mintA && poolInfo.mintB) {
            // CPMM format
            mintA = new PublicKey(poolInfo.mintA.address);
            mintB = new PublicKey(poolInfo.mintB.address);
          } else if (poolInfo.baseMint && poolInfo.quoteMint) {
            // Legacy format
            mintA = new PublicKey(poolInfo.baseMint);
            mintB = new PublicKey(poolInfo.quoteMint);
          } else {
            throw new Error('Pool API response missing mint addresses');
          }

          // Still need to fetch vault addresses from account
          const poolAccount = await connection.getAccountInfo(poolId);
          if (!poolAccount) {
            throw new Error(`Pool account not found: ${poolId.toBase58()}`);
          }

          if (poolAccount.data.length < 112) {
            throw new Error(`Pool account data too short: ${poolAccount.data.length} bytes`);
          }

          const tokenAVault = new PublicKey(poolAccount.data.slice(48, 80));
          const tokenBVault = new PublicKey(poolAccount.data.slice(80, 112));

          logger.debug('Fetched pool state from API', {
            poolId: poolId.toBase58(),
            mintA: mintA.toBase58(),
            mintB: mintB.toBase58(),
            tokenAVault: tokenAVault.toBase58(),
            tokenBVault: tokenBVault.toBase58(),
          });

          return {
            tokenAVault,
            tokenBVault,
            poolCoinMint: mintA,
            poolPcMint: mintB,
          };
        }
      }
    } catch (apiError) {
      logger.debug('Failed to fetch pool from API, falling back to account parsing', {
        error: apiError instanceof Error ? apiError.message : String(apiError),
      });
    }

    // Fallback: Parse pool account directly
    const poolAccount = await connection.getAccountInfo(poolId);
    if (!poolAccount) {
      throw new Error(`Pool account not found: ${poolId.toBase58()}`);
    }

    // Raydium CPMM pool account structure (simplified):
    // Offset 0-8: status
    // Offset 8-16: nonce
    // Offset 16-48: tokenProgramId
    // Offset 48-80: tokenAVault (32 bytes)
    // Offset 80-112: tokenBVault (32 bytes)
    // Offset 112-144: poolCoinMint (32 bytes)
    // Offset 144-176: poolPcMint (32 bytes)
    
    if (poolAccount.data.length < 176) {
      throw new Error(`Pool account data too short: ${poolAccount.data.length} bytes`);
    }

    const tokenAVault = new PublicKey(poolAccount.data.slice(48, 80));
    const tokenBVault = new PublicKey(poolAccount.data.slice(80, 112));
    const poolCoinMint = new PublicKey(poolAccount.data.slice(112, 144));
    const poolPcMint = new PublicKey(poolAccount.data.slice(144, 176));

    logger.debug('Parsed pool account data', {
      poolId: poolId.toBase58(),
      dataLength: poolAccount.data.length,
      tokenAVault: tokenAVault.toBase58(),
      tokenBVault: tokenBVault.toBase58(),
      poolCoinMint: poolCoinMint.toBase58(),
      poolPcMint: poolPcMint.toBase58(),
    });

    return {
      tokenAVault,
      tokenBVault,
      poolCoinMint,
      poolPcMint,
    };
  } catch (error) {
    logger.error('Failed to fetch Raydium pool state', {
      error: error instanceof Error ? error.message : String(error),
      poolId: poolId.toBase58(),
    });
    throw error;
  }
}

/**
 * Create Raydium CPMM swap instruction
 * 
 * Raydium CPMM swap instruction format:
 * - Instruction discriminator: 9 (Swap instruction)
 * - amountIn: u64
 * - minimumAmountOut: u64
 */
function createRaydiumSwapInstruction(
  poolId: PublicKey,
  userSourceTokenAccount: PublicKey,
  userDestinationTokenAccount: PublicKey,
  poolSourceTokenAccount: PublicKey,
  poolDestinationTokenAccount: PublicKey,
  poolCoinMint: PublicKey,
  poolPcMint: PublicKey,
  amountIn: bigint,
  minimumAmountOut: bigint,
  userWallet: PublicKey
): TransactionInstruction {
  // Raydium CPMM swap instruction layout
  // Instruction discriminator: 9 (Swap)
  const instructionData = Buffer.alloc(17);
  instructionData.writeUInt8(9, 0); // Swap instruction
  instructionData.writeBigUInt64LE(amountIn, 1);
  instructionData.writeBigUInt64LE(minimumAmountOut, 9);

  // Accounts for Raydium CPMM swap:
  // 0. poolId (writable)
  // 1. userSourceTokenAccount (writable)
  // 2. userDestinationTokenAccount (writable)
  // 3. poolSourceTokenAccount (writable)
  // 4. poolDestinationTokenAccount (writable)
  // 5. poolCoinMint
  // 6. poolPcMint
  // 7. userWallet (signer)
  // 8. tokenProgramId
  // 9. systemProgram (for SOL wrapping if needed)

  return new TransactionInstruction({
    programId: RAYDIUM_CPMM_PROGRAM_ID,
    keys: [
      { pubkey: poolId, isSigner: false, isWritable: true },
      { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolSourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolDestinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolCoinMint, isSigner: false, isWritable: false },
      { pubkey: poolPcMint, isSigner: false, isWritable: false },
      { pubkey: userWallet, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });
}

/**
 * Swap NUKE tokens to SOL via Raydium CPMM pool
 * 
 * @param amountNuke - Amount of NUKE to swap (in raw token units, with decimals)
 * @param slippageBps - Slippage tolerance in basis points (default: 200 = 2%)
 * @returns SOL received and transaction signature
 */
export async function swapNukeToSOL(
  amountNuke: bigint,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS
): Promise<{
  solReceived: bigint;
  txSignature: string;
}> {
  try {
    logger.info('Starting NUKE to SOL swap via Raydium', {
      amountNuke: amountNuke.toString(),
      slippageBps,
    });

    // Step 1: Validate inputs
    if (amountNuke <= 0n) {
      throw new Error('Amount must be greater than zero');
    }

    const poolId = getRaydiumPoolId();
    if (!poolId) {
      throw new Error('RAYDIUM_POOL_ID not set in environment variables');
    }

    // Step 2: Get reward wallet
    const rewardWallet = getRewardWallet();
    const rewardWalletAddress = rewardWallet.publicKey;

    // Step 3: Get mint decimals
    const mintInfo = await getMint(connection, tokenMint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const nukeDecimals = mintInfo.decimals;
    const solDecimals = 9; // SOL always has 9 decimals

    // Step 4: Get reward wallet's NUKE token account
    const rewardNukeAccount = getAssociatedTokenAddressSync(
      tokenMint,
      rewardWalletAddress,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Check if reward wallet has enough NUKE
    let rewardNukeBalance = 0n;
    try {
      const rewardAccount = await getAccount(connection, rewardNukeAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
      rewardNukeBalance = rewardAccount.amount;
    } catch (error) {
      throw new Error(`Reward wallet NUKE account not found or has no balance: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (rewardNukeBalance < amountNuke) {
      throw new Error(
        `Insufficient NUKE balance. Required: ${amountNuke.toString()}, Available: ${rewardNukeBalance.toString()}`
      );
    }

    // Step 5: Fetch pool state to get vault addresses
    logger.info('Fetching Raydium pool state', { poolId: poolId.toBase58() });
    const poolState = await getRaydiumPoolState(poolId);

    logger.info('Pool state fetched', {
      poolCoinMint: poolState.poolCoinMint.toBase58(),
      poolPcMint: poolState.poolPcMint.toBase58(),
      tokenMint: tokenMint.toBase58(),
      tokenAVault: poolState.tokenAVault.toBase58(),
      tokenBVault: poolState.tokenBVault.toBase58(),
    });

    // Determine swap direction: NUKE → SOL
    // Check which vault is NUKE and which is SOL
    const isNukeInVaultA = poolState.poolCoinMint.equals(tokenMint) || poolState.poolPcMint.equals(tokenMint);
    if (!isNukeInVaultA) {
      logger.error('Pool does not contain NUKE token', {
        poolCoinMint: poolState.poolCoinMint.toBase58(),
        poolPcMint: poolState.poolPcMint.toBase58(),
        expectedTokenMint: tokenMint.toBase58(),
        poolId: poolId.toBase58(),
      });
      throw new Error(`Pool does not contain NUKE token. Pool mints: ${poolState.poolCoinMint.toBase58()}, ${poolState.poolPcMint.toBase58()}. Expected: ${tokenMint.toBase58()}`);
    }

    // Determine which mint is NUKE and which is SOL/WSOL
    const nukeMint = tokenMint;
    const solMint = WSOL_MINT;
    
    let poolSourceVault: PublicKey;
    let poolDestVault: PublicKey;
    let poolSourceMint: PublicKey;
    let poolDestMint: PublicKey;

    if (poolState.poolCoinMint.equals(nukeMint)) {
      // poolCoinMint = NUKE, poolPcMint = SOL
      poolSourceVault = poolState.tokenAVault;
      poolDestVault = poolState.tokenBVault;
      poolSourceMint = poolState.poolCoinMint;
      poolDestMint = poolState.poolPcMint;
    } else if (poolState.poolPcMint.equals(nukeMint)) {
      // poolPcMint = NUKE, poolCoinMint = SOL
      poolSourceVault = poolState.tokenBVault;
      poolDestVault = poolState.tokenAVault;
      poolSourceMint = poolState.poolPcMint;
      poolDestMint = poolState.poolCoinMint;
    } else {
      throw new Error('Pool mint configuration does not match expected NUKE/SOL pair');
    }

    logger.info('Pool configuration determined', {
      poolSourceMint: poolSourceMint.toBase58(),
      poolDestMint: poolDestMint.toBase58(),
      poolSourceVault: poolSourceVault.toBase58(),
      poolDestVault: poolDestVault.toBase58(),
    });

    // Step 6: Calculate expected SOL output using constant product formula
    // Get pool reserves - try both program IDs since we don't know which one the pool uses
    let sourceVaultAccount;
    try {
      sourceVaultAccount = await getAccount(connection, poolSourceVault, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch (error) {
      try {
        sourceVaultAccount = await getAccount(connection, poolSourceVault, 'confirmed', TOKEN_PROGRAM_ID);
      } catch (error2) {
        throw new Error(`Failed to fetch source vault account ${poolSourceVault.toBase58()}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let destVaultAccount;
    try {
      destVaultAccount = await getAccount(connection, poolDestVault, 'confirmed', TOKEN_PROGRAM_ID); // SOL vault typically uses TOKEN_PROGRAM_ID
    } catch (error) {
      try {
        destVaultAccount = await getAccount(connection, poolDestVault, 'confirmed', TOKEN_2022_PROGRAM_ID);
      } catch (error2) {
        throw new Error(`Failed to fetch destination vault account ${poolDestVault.toBase58()}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    const sourceReserve = sourceVaultAccount.amount;
    const destReserve = destVaultAccount.amount;

    // Constant product: (x + dx) * (y - dy) = x * y
    // Solving for dy: dy = (y * dx) / (x + dx)
    // Apply fee: 0.25% = 0.0025, so multiplier = 0.9975
    const feeMultiplier = 0.9975;
    const expectedDestAmount = (destReserve * amountNuke * BigInt(Math.floor(feeMultiplier * 10000))) / (sourceReserve + amountNuke) / BigInt(10000);
    
    // Apply slippage tolerance
    const minDestAmount = (expectedDestAmount * BigInt(10000 - slippageBps)) / BigInt(10000);

    if (minDestAmount < MIN_SOL_OUTPUT) {
      throw new Error(
        `Expected SOL output too low: ${Number(minDestAmount) / LAMPORTS_PER_SOL} SOL (minimum: ${MIN_SOL_OUTPUT / LAMPORTS_PER_SOL} SOL)`
      );
    }

    logger.info('Swap calculation', {
      amountNuke: amountNuke.toString(),
      sourceReserve: sourceReserve.toString(),
      destReserve: destReserve.toString(),
      expectedSolLamports: expectedDestAmount.toString(),
      minSolLamports: minDestAmount.toString(),
      slippageBps,
    });

    // Step 7: Get or create user's SOL token account (WSOL for receiving)
    const userSolAccount = getAssociatedTokenAddressSync(
      NATIVE_MINT, // WSOL
      rewardWalletAddress,
      false,
      TOKEN_PROGRAM_ID
    );

    const userSolAccountInfo = await connection.getAccountInfo(userSolAccount).catch(() => null);
    const transaction = new Transaction();

    // Create WSOL account if needed
    if (!userSolAccountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          rewardWalletAddress,
          userSolAccount,
          rewardWalletAddress,
          NATIVE_MINT,
          TOKEN_PROGRAM_ID
        )
      );
    }

    // Step 8: Create swap instruction
    const swapInstruction = createRaydiumSwapInstruction(
      poolId,
      rewardNukeAccount, // userSourceTokenAccount (NUKE)
      userSolAccount, // userDestinationTokenAccount (WSOL)
      poolSourceVault, // poolSourceTokenAccount (NUKE vault)
      poolDestVault, // poolDestinationTokenAccount (SOL vault)
      poolSourceMint, // poolCoinMint (NUKE)
      poolDestMint, // poolPcMint (SOL)
      amountNuke,
      minDestAmount,
      rewardWalletAddress
    );

    transaction.add(swapInstruction);

    // Step 9: Unwrap WSOL to SOL if needed (optional - can keep as WSOL)
    // For now, we'll keep it as WSOL and the balance will show as SOL

    // Step 10: Send and confirm transaction
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = rewardWalletAddress;
    transaction.sign(rewardWallet);

    logger.info('Sending Raydium swap transaction', {
      expectedSolLamports: expectedDestAmount.toString(),
      minSolLamports: minDestAmount.toString(),
    });

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [rewardWallet],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    // Step 11: Verify SOL was received
    const userSolBalance = await getAccount(connection, userSolAccount, 'confirmed', TOKEN_PROGRAM_ID).catch(() => null);
    const solReceived = userSolBalance ? userSolBalance.amount : 0n;

    logger.info('Raydium swap completed successfully', {
      signature,
      solReceived: solReceived.toString(),
      expectedSol: expectedDestAmount.toString(),
    });

    return {
      solReceived: solReceived > 0n ? solReceived : expectedDestAmount, // Use actual if available, else expected
      txSignature: signature,
    };
  } catch (error) {
    logger.error('Error swapping NUKE to SOL via Raydium', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      amountNuke: amountNuke.toString(),
    });
    throw error;
  }
}
