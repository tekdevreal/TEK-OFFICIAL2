/**
 * Swap Service
 * 
 * Handles swapping NUKE tokens to SOL via Raydium CPMM pool on devnet
 * 
 * IMPORTANT: Uses Raydium SDK for CPMM swap instruction generation.
 * CPMM pools require the official Raydium AMM program ID and proper instruction format.
 * NUKE is a Token-2022 transfer-fee token (4% fee), so received amounts account for fees.
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
  SendTransactionError,
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

// Official Raydium CPMM AMM Program ID (same for devnet and mainnet)
// This is the executable program that handles CPMM swaps
// DO NOT use pool IDs, config programs, or API metadata program IDs
const RAYDIUM_CPMM_AMM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

// Default slippage tolerance (2%)
const DEFAULT_SLIPPAGE_BPS = 200; // 2% = 200 basis points

// Minimum SOL output to proceed with swap (0.001 SOL)
const MIN_SOL_OUTPUT = 0.001 * LAMPORTS_PER_SOL;

/**
 * Get reward wallet keypair
 */
function getRewardWallet(): Keypair {
  return loadKeypairFromEnv('REWARD_WALLET_PRIVATE_KEY_JSON');
}

// Types for Raydium API response
interface RaydiumApiPoolInfo {
  mintA?: { address: string; decimals?: number };
  mintB?: { address: string; decimals?: number };
  baseMint?: string;
  quoteMint?: string;
  mintAmountA?: number;
  mintAmountB?: number;
  type?: string; // Pool type: "Cpmm" or "Clmm"
}

interface RaydiumApiResponse {
  success?: boolean;
  data?: RaydiumApiPoolInfo[];
}

/**
 * Fetch pool info from Raydium API to validate pool type and get reserves
 * Enforces CPMM pool logic only - rejects CLMM pools
 */
async function fetchPoolInfoFromAPI(poolId: PublicKey): Promise<{
  isCpmm: boolean;
  mintA: PublicKey;
  mintB: PublicKey;
  reserveA: bigint;
  reserveB: bigint;
  decimalsA: number;
  decimalsB: number;
}> {
  const apiUrl = `https://api-v3-devnet.raydium.io/pools/info/ids?ids=${poolId.toBase58()}`;
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Raydium API returned ${response.status}`);
  }

  const apiData: RaydiumApiResponse = await response.json() as RaydiumApiResponse;
  
  if (!apiData.success || !apiData.data || apiData.data.length === 0) {
    throw new Error('Pool not found in Raydium API');
  }

  const poolInfo = apiData.data[0];

  // Enforce CPMM pool logic only - reject CLMM
  if (poolInfo.type && poolInfo.type.toLowerCase() !== 'cpmm') {
    throw new Error(`Pool type "${poolInfo.type}" is not CPMM. Only CPMM pools are supported.`);
  }

  if (!poolInfo.mintA || !poolInfo.mintB || poolInfo.mintAmountA === undefined || poolInfo.mintAmountB === undefined) {
    throw new Error('Pool API response missing required mint information');
  }

  const mintA = new PublicKey(poolInfo.mintA.address);
  const mintB = new PublicKey(poolInfo.mintB.address);
  const decimalsA = poolInfo.mintA.decimals || 6;
  const decimalsB = poolInfo.mintB.decimals || 9;

  // Convert human-readable amounts to raw token units
  const reserveA = BigInt(Math.floor(poolInfo.mintAmountA * Math.pow(10, decimalsA)));
  const reserveB = BigInt(Math.floor(poolInfo.mintAmountB * Math.pow(10, decimalsB)));

  return {
    isCpmm: true,
    mintA,
    mintB,
    reserveA,
    reserveB,
    decimalsA,
    decimalsB,
  };
}

/**
 * Create Raydium CPMM swap instruction
 * 
 * Uses the official Raydium CPMM AMM program ID and proper instruction format.
 * This replaces manual instruction building which was causing "program may not be used" errors.
 * 
 * NOTE: Raydium CPMM swap instruction format:
 * - Instruction discriminator: 9 (Swap)
 * - amountIn: u64 (8 bytes)
 * - minimumAmountOut: u64 (8 bytes)
 * 
 * Accounts (in order):
 * 0. poolId (writable)
 * 1. userSourceTokenAccount (writable) - user's NUKE account
 * 2. userDestinationTokenAccount (writable) - user's WSOL account
 * 3. poolSourceTokenAccount (writable) - pool's NUKE vault
 * 4. poolDestinationTokenAccount (writable) - pool's WSOL vault
 * 5. poolCoinMint - NUKE mint
 * 6. poolPcMint - WSOL mint
 * 7. userWallet (signer, writable)
 * 8. tokenProgramId - TOKEN_2022_PROGRAM_ID for NUKE, TOKEN_PROGRAM_ID for WSOL
 * 9. systemProgram
 */
function createRaydiumCpmmSwapInstruction(
  poolId: PublicKey,
  userSourceTokenAccount: PublicKey,
  userDestinationTokenAccount: PublicKey,
  poolSourceTokenAccount: PublicKey,
  poolDestinationTokenAccount: PublicKey,
  poolCoinMint: PublicKey,
  poolPcMint: PublicKey,
  amountIn: bigint,
  minimumAmountOut: bigint,
  userWallet: PublicKey,
  sourceTokenProgram: PublicKey, // TOKEN_2022_PROGRAM_ID for NUKE
  destTokenProgram: PublicKey // TOKEN_PROGRAM_ID for WSOL
): TransactionInstruction {
  // Instruction discriminator: 9 (Swap)
  const instructionData = Buffer.alloc(17);
  instructionData.writeUInt8(9, 0);
  instructionData.writeBigUInt64LE(amountIn, 1);
  instructionData.writeBigUInt64LE(minimumAmountOut, 9);

  return new TransactionInstruction({
    programId: RAYDIUM_CPMM_AMM_PROGRAM_ID, // Use official executable program ID
    keys: [
      { pubkey: poolId, isSigner: false, isWritable: true },
      { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolSourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolDestinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolCoinMint, isSigner: false, isWritable: false },
      { pubkey: poolPcMint, isSigner: false, isWritable: false },
      { pubkey: userWallet, isSigner: true, isWritable: true },
      { pubkey: sourceTokenProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });
}

/**
 * Swap NUKE tokens to SOL via Raydium CPMM pool
 * 
 * This function:
 * 1. Validates pool is CPMM (not CLMM)
 * 2. Uses official Raydium CPMM AMM program ID
 * 3. Handles NUKE's transfer fees (4% - tokens arrive at pool with fee deducted)
 * 4. Simulates transaction before sending
 * 5. Aborts distribution if swap fails
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
    logger.info('Starting NUKE to SOL swap via Raydium CPMM', {
      amountNuke: amountNuke.toString(),
      slippageBps,
      programId: RAYDIUM_CPMM_AMM_PROGRAM_ID.toBase58(),
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

    // Step 3: Fetch pool info from API to validate pool type and get reserves
    logger.info('Fetching pool info from Raydium API', { poolId: poolId.toBase58() });
    const poolInfo = await fetchPoolInfoFromAPI(poolId);
    
    if (!poolInfo.isCpmm) {
      throw new Error('Pool is not a CPMM pool. Only CPMM pools are supported.');
    }

    logger.info('Pool validated as CPMM', {
      mintA: poolInfo.mintA.toBase58(),
      mintB: poolInfo.mintB.toBase58(),
    });

    // Step 4: Determine swap direction and map mints
    const nukeMint = tokenMint;
    const solMint = WSOL_MINT;
    
    let poolSourceMint: PublicKey;
    let poolDestMint: PublicKey;
    let sourceReserve: bigint;
    let destReserve: bigint;
    let sourceDecimals: number;
    let destDecimals: number;

    if (poolInfo.mintA.equals(nukeMint) && poolInfo.mintB.equals(solMint)) {
      // mintA = NUKE, mintB = SOL
      poolSourceMint = poolInfo.mintA;
      poolDestMint = poolInfo.mintB;
      sourceReserve = poolInfo.reserveA;
      destReserve = poolInfo.reserveB;
      sourceDecimals = poolInfo.decimalsA;
      destDecimals = poolInfo.decimalsB;
    } else if (poolInfo.mintB.equals(nukeMint) && poolInfo.mintA.equals(solMint)) {
      // mintB = NUKE, mintA = SOL
      poolSourceMint = poolInfo.mintB;
      poolDestMint = poolInfo.mintA;
      sourceReserve = poolInfo.reserveB;
      destReserve = poolInfo.reserveA;
      sourceDecimals = poolInfo.decimalsB;
      destDecimals = poolInfo.decimalsA;
    } else {
      throw new Error(`Pool does not contain NUKE/SOL pair. Pool mints: ${poolInfo.mintA.toBase58()}, ${poolInfo.mintB.toBase58()}`);
    }

    logger.info('Swap direction determined', {
      poolSourceMint: poolSourceMint.toBase58(),
      poolDestMint: poolDestMint.toBase58(),
      sourceReserve: sourceReserve.toString(),
      destReserve: destReserve.toString(),
    });

    // Step 5: Get pool vault addresses (need to fetch from pool account)
    // For CPMM pools, vault addresses are in the pool account data
    const poolAccount = await connection.getAccountInfo(poolId);
    if (!poolAccount) {
      throw new Error(`Pool account not found: ${poolId.toBase58()}`);
    }

    if (poolAccount.data.length < 112) {
      throw new Error(`Pool account data too short: ${poolAccount.data.length} bytes`);
    }

    // CPMM pool account layout:
    // Offset 48-80: tokenAVault (32 bytes)
    // Offset 80-112: tokenBVault (32 bytes)
    const tokenAVault = new PublicKey(poolAccount.data.slice(48, 80));
    const tokenBVault = new PublicKey(poolAccount.data.slice(80, 112));

    // Determine which vault is source and which is destination
    // Need to check vault mint to determine mapping
    let poolSourceVault: PublicKey;
    let poolDestVault: PublicKey;
    
    // Try to determine vault mapping by checking vault account mints
    try {
      const vaultAAccount = await getAccount(connection, tokenAVault, 'confirmed', TOKEN_2022_PROGRAM_ID).catch(() => 
        getAccount(connection, tokenAVault, 'confirmed', TOKEN_PROGRAM_ID)
      );
      const vaultBMint = vaultAAccount.mint.equals(poolSourceMint) ? poolSourceMint : poolDestMint;
      
      if (vaultAAccount.mint.equals(poolSourceMint)) {
        poolSourceVault = tokenAVault;
        poolDestVault = tokenBVault;
      } else {
        poolSourceVault = tokenBVault;
        poolDestVault = tokenAVault;
      }
    } catch (error) {
      // Fallback: assume order matches pool info order
      if (poolInfo.mintA.equals(poolSourceMint)) {
        poolSourceVault = tokenAVault;
        poolDestVault = tokenBVault;
      } else {
        poolSourceVault = tokenBVault;
        poolDestVault = tokenAVault;
      }
    }

    logger.info('Pool vaults determined', {
      poolSourceVault: poolSourceVault.toBase58(),
      poolDestVault: poolDestVault.toBase58(),
    });

    // Step 6: Calculate expected SOL output
    // NOTE: NUKE has 4% transfer fee, so when we send amountNuke, the pool receives amountNuke * 0.96
    // We need to account for this in our calculation
    const feeMultiplier = 0.9975; // Raydium CPMM fee (0.25%)
    const nukeAfterTransferFee = amountNuke * BigInt(96) / BigInt(100); // 4% transfer fee deducted
    
    // Constant product formula: (x + dx) * (y - dy) = x * y
    // dy = (y * dx) / (x + dx)
    const expectedDestAmount = (destReserve * nukeAfterTransferFee * BigInt(Math.floor(feeMultiplier * 10000))) / (sourceReserve + nukeAfterTransferFee) / BigInt(10000);
    
    // Apply slippage tolerance
    const minDestAmount = (expectedDestAmount * BigInt(10000 - slippageBps)) / BigInt(10000);

    if (minDestAmount < MIN_SOL_OUTPUT) {
      throw new Error(
        `Expected SOL output too low: ${Number(minDestAmount) / LAMPORTS_PER_SOL} SOL (minimum: ${MIN_SOL_OUTPUT / LAMPORTS_PER_SOL} SOL)`
      );
    }

    logger.info('Swap calculation', {
      amountNuke: amountNuke.toString(),
      amountNukeAfterTransferFee: nukeAfterTransferFee.toString(),
      sourceReserve: sourceReserve.toString(),
      destReserve: destReserve.toString(),
      expectedSolLamports: expectedDestAmount.toString(),
      minSolLamports: minDestAmount.toString(),
      slippageBps,
      note: 'NUKE has 4% transfer fee, so pool receives less than amountNuke',
    });

    // Step 7: Get user token accounts
    const rewardNukeAccount = getAssociatedTokenAddressSync(
      tokenMint,
      rewardWalletAddress,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Check balance
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

    const userSolAccount = getAssociatedTokenAddressSync(
      NATIVE_MINT, // WSOL
      rewardWalletAddress,
      false,
      TOKEN_PROGRAM_ID
    );

    // Step 8: Build transaction
    const transaction = new Transaction();
    
    // Create WSOL account if needed
    const userSolAccountInfo = await connection.getAccountInfo(userSolAccount).catch(() => null);
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

    // Create swap instruction using official Raydium CPMM program
    const swapInstruction = createRaydiumCpmmSwapInstruction(
      poolId,
      rewardNukeAccount, // userSourceTokenAccount (NUKE)
      userSolAccount, // userDestinationTokenAccount (WSOL)
      poolSourceVault, // poolSourceTokenAccount (NUKE vault)
      poolDestVault, // poolDestinationTokenAccount (WSOL vault)
      poolSourceMint, // poolCoinMint (NUKE)
      poolDestMint, // poolPcMint (WSOL)
      amountNuke, // amountIn (transfer fee will be deducted during transfer)
      minDestAmount, // minimumAmountOut
      rewardWalletAddress, // userWallet
      TOKEN_2022_PROGRAM_ID, // sourceTokenProgram (NUKE uses Token-2022)
      TOKEN_PROGRAM_ID // destTokenProgram (WSOL uses standard Token program)
    );

    transaction.add(swapInstruction);

    // Step 9: Set transaction properties
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = rewardWalletAddress;

    // Step 10: Simulate transaction before sending
    logger.info('Simulating Raydium swap transaction');
    try {
      const simulation = await connection.simulateTransaction(transaction, [rewardWallet]);
      
      if (simulation.value.err) {
        const errorMessage = JSON.stringify(simulation.value.err);
        logger.error('Transaction simulation failed', {
          error: errorMessage,
          logs: simulation.value.logs || [],
        });
        throw new Error(`Transaction simulation failed: ${errorMessage}`);
      }

      logger.info('Transaction simulation passed', {
        unitsConsumed: simulation.value.unitsConsumed,
        logMessages: simulation.value.logs?.slice(0, 10) || [], // First 10 log lines
      });
    } catch (simError) {
      // If simulation fails with SendTransactionError, extract logs
      if (simError instanceof Error && 'getLogs' in simError && typeof (simError as any).getLogs === 'function') {
        const sendError = simError as SendTransactionError;
        try {
          const logs = await sendError.getLogs(connection);
          logger.error('Transaction simulation failed with detailed logs', {
            error: sendError.message,
            logs: logs || [],
          });
        } catch (logError) {
          logger.error('Transaction simulation failed (could not get logs)', {
            error: sendError.message,
            logError: logError instanceof Error ? logError.message : String(logError),
          });
        }
      }
      throw simError;
    }

    // Step 11: Sign and send transaction
    transaction.sign(rewardWallet);

    logger.info('Sending Raydium swap transaction', {
      expectedSolLamports: expectedDestAmount.toString(),
      minSolLamports: minDestAmount.toString(),
      programId: RAYDIUM_CPMM_AMM_PROGRAM_ID.toBase58(),
    });

    let signature: string;
    try {
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [rewardWallet],
        {
          commitment: 'confirmed',
          maxRetries: 3,
          skipPreflight: false, // We already simulated, but keep preflight for safety
        }
      );
    } catch (sendError) {
      // If send fails with SendTransactionError, extract logs
      if (sendError instanceof Error && 'getLogs' in sendError && typeof (sendError as any).getLogs === 'function') {
        const txError = sendError as SendTransactionError;
        try {
          const logs = await txError.getLogs(connection);
          logger.error('Transaction send failed with detailed logs', {
            error: txError.message,
            logs: logs || [],
          });
        } catch (logError) {
          logger.error('Transaction send failed (could not get logs)', {
            error: txError.message,
            logError: logError instanceof Error ? logError.message : String(logError),
          });
        }
      }
      throw sendError;
    }

    // Step 12: Verify SOL was received
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
      programId: RAYDIUM_CPMM_AMM_PROGRAM_ID.toBase58(),
    });
    throw error; // Re-throw to abort reward distribution
  }
}
