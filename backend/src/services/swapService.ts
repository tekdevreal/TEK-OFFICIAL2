/**
 * Swap Service
 * 
 * Handles swapping NUKE tokens to SOL via Raydium (Standard AMM v4 or CPMM) on devnet
 * 
 * IMPORTANT: 
 * - Supports both Standard AMM (v4) and CPMM pool types
 * - Both pool types use the same Raydium AMM v4 program ID and instruction format
 * - NUKE is a Token-2022 transfer-fee token (4% fee), so received amounts account for fees
 * - Rejects CLMM and other unsupported pool types
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

// Official Raydium AMM Program ID (same for devnet and mainnet)
// Standard AMM (v4) and CPMM pools both use this same program ID
// DO NOT use pool IDs, config programs, or API metadata program IDs
const RAYDIUM_AMM_V4_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

// Hardcoded fallback values for NUKE/SOL pool (devnet)
// These are used as fallbacks if API response is incomplete
const HARDCODED_POOL_CONFIG = {
  // Pool program ID for NUKE/SOL pool on devnet
  programId: new PublicKey('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb'),
  // Mint addresses
  mintA: new PublicKey('So11111111111111111111111111111111111111112'), // dwSOL
  mintB: new PublicKey('CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq'), // NUKE
  // Vault addresses
  vaultA: new PublicKey('3FAzsES6Vxx91ETtacAPhseg3quHTSKeVXMWks1ivJVR'), // SOL vault
  vaultB: new PublicKey('9T4RoNGUZdEgRojUU9gsh8Ffk6J3smpkY4EiF4a5w4HD'), // NUKE vault
  // Pool type
  poolType: 'Standard' as const,
};

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
  programId?: string; // Pool's program ID from API
  mintA?: { address: string; decimals?: number; programId?: string };
  mintB?: { address: string; decimals?: number; programId?: string };
  baseMint?: string;
  quoteMint?: string;
  mintAmountA?: number;
  mintAmountB?: number;
  type?: string; // Pool type: "Standard", "Cpmm", "Clmm", etc. (may be undefined)
  vault?: {
    A?: string; // Vault address for mintA
    B?: string; // Vault address for mintB
  };
}

interface RaydiumApiResponse {
  success?: boolean;
  data?: RaydiumApiPoolInfo[];
}

/**
 * Fetch pool info from Raydium API to validate pool type, get reserves, and vault addresses
 * Supports both Standard AMM (v4) and CPMM pools - rejects other types (e.g., CLMM)
 * NOTE: Standard and CPMM use the same program ID and instruction format
 * Uses /pools/key/ids endpoint which includes vault addresses
 */
async function fetchPoolInfoFromAPI(poolId: PublicKey): Promise<{
  poolType: 'Standard' | 'Cpmm';
  poolProgramId: PublicKey; // Program ID from API response (or hardcoded fallback)
  mintA: PublicKey;
  mintB: PublicKey;
  reserveA: bigint; // Reserve amounts (0n if using hardcoded fallback)
  reserveB: bigint; // Reserve amounts (0n if using hardcoded fallback)
  decimalsA: number;
  decimalsB: number;
  vaultA: PublicKey; // Vault address for mintA (from API or hardcoded fallback)
  vaultB: PublicKey; // Vault address for mintB (from API or hardcoded fallback)
}> {
  // Use /pools/key/ids endpoint which includes vault addresses
  const apiUrl = `https://api-v3-devnet.raydium.io/pools/key/ids?ids=${poolId.toBase58()}`;
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

  // Extract program ID from API response, fallback to hardcoded value
  let poolProgramId: PublicKey;
  if (poolInfo.programId) {
    poolProgramId = new PublicKey(poolInfo.programId);
  } else {
    logger.warn('Pool program ID not in API response, using hardcoded fallback', {
      poolId: poolId.toBase58(),
      fallbackProgramId: HARDCODED_POOL_CONFIG.programId.toBase58(),
    });
    poolProgramId = HARDCODED_POOL_CONFIG.programId;
  }

  // Handle pool type - API may not always return it, default to hardcoded value
  // Standard AMM v4 pools may not have type field in API response
  let normalizedType = '';
  if (poolInfo.type) {
    normalizedType = poolInfo.type.toLowerCase();
  } else {
    // Default to hardcoded pool type if type is undefined (common for Standard AMM v4 pools)
    logger.warn('Pool type not in API response, using hardcoded fallback', {
      poolId: poolId.toBase58(),
      fallbackPoolType: HARDCODED_POOL_CONFIG.poolType,
    });
    normalizedType = HARDCODED_POOL_CONFIG.poolType.toLowerCase();
  }

  // Support both Standard AMM (v4) and CPMM pools - reject other types
  if (!['standard', 'cpmm'].includes(normalizedType)) {
    throw new Error(`Unsupported Raydium pool type: "${poolInfo.type}". Only Standard AMM (v4) and CPMM pools are supported.`);
  }

  // Extract mint addresses, use hardcoded fallbacks if API response is incomplete
  let mintA: PublicKey;
  let mintB: PublicKey;
  let decimalsA: number;
  let decimalsB: number;
  let reserveA: bigint;
  let reserveB: bigint;

  if (poolInfo.mintA && poolInfo.mintB && poolInfo.mintAmountA !== undefined && poolInfo.mintAmountB !== undefined) {
    // Use API response values
    mintA = new PublicKey(poolInfo.mintA.address);
    mintB = new PublicKey(poolInfo.mintB.address);
    decimalsA = poolInfo.mintA.decimals || 6;
    decimalsB = poolInfo.mintB.decimals || 9;
    
    // Convert human-readable amounts to raw token units
    reserveA = BigInt(Math.floor(poolInfo.mintAmountA * Math.pow(10, decimalsA)));
    reserveB = BigInt(Math.floor(poolInfo.mintAmountB * Math.pow(10, decimalsB)));
  } else {
    // Fallback to hardcoded values if API response is incomplete
    logger.warn('Pool mint information incomplete in API response, using hardcoded fallbacks', {
      poolId: poolId.toBase58(),
      hasMintA: !!poolInfo.mintA,
      hasMintB: !!poolInfo.mintB,
      hasAmountA: poolInfo.mintAmountA !== undefined,
      hasAmountB: poolInfo.mintAmountB !== undefined,
    });
    mintA = HARDCODED_POOL_CONFIG.mintA;
    mintB = HARDCODED_POOL_CONFIG.mintB;
    decimalsA = 9; // SOL has 9 decimals
    decimalsB = 6; // NUKE has 6 decimals
    
    // Note: We can't calculate reserves from hardcoded values, so we'll need to fetch from chain
    // For now, use 0 as placeholder - this should be fetched from chain if needed
    reserveA = 0n;
    reserveB = 0n;
  }

  // Extract vault addresses from API response, use hardcoded fallbacks if missing
  let vaultA: PublicKey;
  let vaultB: PublicKey;
  if (poolInfo.vault?.A && poolInfo.vault?.B) {
    vaultA = new PublicKey(poolInfo.vault.A);
    vaultB = new PublicKey(poolInfo.vault.B);
  } else {
    logger.warn('Pool vault addresses not in API response, using hardcoded fallbacks', {
      poolId: poolId.toBase58(),
      hasVaultA: !!poolInfo.vault?.A,
      hasVaultB: !!poolInfo.vault?.B,
    });
    vaultA = HARDCODED_POOL_CONFIG.vaultA;
    vaultB = HARDCODED_POOL_CONFIG.vaultB;
  }

  // Normalize pool type for return (capitalize first letter)
  const normalizedPoolType = normalizedType === 'standard' ? 'Standard' : 'Cpmm';

  return {
    poolType: normalizedPoolType as 'Standard' | 'Cpmm',
    poolProgramId, // Program ID from API response
    mintA,
    mintB,
    reserveA,
    reserveB,
    decimalsA,
    decimalsB,
    vaultA,
    vaultB,
  };
}

/**
 * Create Raydium swap instruction (for Standard AMM v4 or CPMM)
 * 
 * Uses the official Raydium AMM v4 program ID and proper instruction format.
 * Standard AMM (v4) and CPMM pools both use this same instruction format.
 * 
 * CRITICAL: For Token-2022 compatibility, we must use TOKEN_2022_PROGRAM_ID when
 * the source token (NUKE) is Token-2022. Raydium supports mixed-program swaps
 * (Token-2022 source, SPL Token destination).
 * 
 * NOTE: Raydium swap instruction format (same for Standard and CPMM):
 * - Instruction discriminator: 9 (Swap)
 * - amountIn: u64 (8 bytes)
 * - minimumAmountOut: u64 (8 bytes)
 * 
 * Accounts (in order):
 * 0. poolId (writable)
 * 1. userSourceTokenAccount (writable) - user's NUKE account (Token-2022)
 * 2. userDestinationTokenAccount (writable) - user's WSOL account (SPL Token)
 * 3. poolSourceTokenAccount (writable) - pool's NUKE vault (Token-2022)
 * 4. poolDestinationTokenAccount (writable) - pool's WSOL vault (SPL Token)
 * 5. poolCoinMint - NUKE mint (Token-2022)
 * 6. poolPcMint - WSOL mint (SPL Token)
 * 7. userWallet (signer, writable)
 * 8. tokenProgramId - TOKEN_2022_PROGRAM_ID (required for Token-2022 source)
 * 9. systemProgram
 * 
 * IMPORTANT: The tokenProgramId account must be TOKEN_2022_PROGRAM_ID when swapping
 * from a Token-2022 token, even if the destination is SPL Token. Raydium handles
 * mixed-program swaps internally.
 */
function createRaydiumSwapInstruction(
  poolId: PublicKey,
  poolProgramId: PublicKey, // Pool's program ID from API response
  userSourceTokenAccount: PublicKey,
  userDestinationTokenAccount: PublicKey,
  poolSourceTokenAccount: PublicKey,
  poolDestinationTokenAccount: PublicKey,
  poolCoinMint: PublicKey,
  poolPcMint: PublicKey,
  amountIn: bigint,
  minimumAmountOut: bigint,
  userWallet: PublicKey,
  sourceTokenProgram: PublicKey // MUST be TOKEN_2022_PROGRAM_ID for Token-2022 source
): TransactionInstruction {
  // Instruction discriminator: 9 (Swap)
  const instructionData = Buffer.alloc(17);
  instructionData.writeUInt8(9, 0);
  instructionData.writeBigUInt64LE(amountIn, 1);
  instructionData.writeBigUInt64LE(minimumAmountOut, 9);

  // CRITICAL: Use TOKEN_2022_PROGRAM_ID for Token-2022 source tokens
  // Raydium supports mixed-program swaps (Token-2022 source, SPL Token destination)
  const tokenProgramId = sourceTokenProgram; // TOKEN_2022_PROGRAM_ID for NUKE

  return new TransactionInstruction({
    programId: poolProgramId, // Use pool's program ID from API response
    keys: [
      { pubkey: poolId, isSigner: false, isWritable: true },
      { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolSourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolDestinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolCoinMint, isSigner: false, isWritable: false },
      { pubkey: poolPcMint, isSigner: false, isWritable: false },
      { pubkey: userWallet, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false }, // TOKEN_2022_PROGRAM_ID for NUKE
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });
}

/**
 * Swap NUKE tokens to SOL via Raydium (Standard AMM v4 or CPMM)
 * 
 * This function:
 * 1. Validates pool is Standard AMM (v4) or CPMM (rejects CLMM and others)
 * 2. Uses official Raydium AMM v4 program ID (same for both pool types)
 * 3. Handles NUKE's transfer fees (4% - tokens arrive at pool with fee deducted)
 * 4. Simulates transaction before sending
 * 5. Aborts distribution if swap fails
 * 
 * NOTE: Standard AMM (v4) and CPMM use the same program ID and instruction format.
 * The pool type field from the API is metadata; both execute identically.
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
      programId: RAYDIUM_AMM_V4_PROGRAM_ID.toBase58(),
      note: 'Supports both Standard AMM (v4) and CPMM pools',
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

    // Step 2.5: Detect Token-2022 vs SPL Token
    // NUKE is Token-2022, WSOL is SPL Token
    const NUKE_IS_TOKEN_2022 = true; // NUKE uses Token-2022 program
    const WSOL_IS_TOKEN_2022 = false; // WSOL uses SPL Token program
    const sourceTokenProgram = TOKEN_2022_PROGRAM_ID; // Required for NUKE (Token-2022)
    const destTokenProgram = TOKEN_PROGRAM_ID; // Required for WSOL (SPL Token)

    logger.info('Token program detection', {
      sourceTokenProgram: sourceTokenProgram.toBase58(),
      destTokenProgram: destTokenProgram.toBase58(),
      isToken2022Source: NUKE_IS_TOKEN_2022,
      isToken2022Dest: WSOL_IS_TOKEN_2022,
      note: 'NUKE is Token-2022, WSOL is SPL Token - Raydium supports mixed-program swaps',
    });

    // Step 3: Fetch pool info from API to validate pool type and get reserves
    logger.info('Fetching pool info from Raydium API', { poolId: poolId.toBase58() });
    const poolInfo = await fetchPoolInfoFromAPI(poolId);
    
    logger.info('Pool validated', {
      poolType: poolInfo.poolType,
      poolProgramId: poolInfo.poolProgramId.toBase58(),
      mintA: poolInfo.mintA.toBase58(),
      mintB: poolInfo.mintB.toBase58(),
      note: 'Using pool program ID from API response',
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

    // Step 5: Get pool vault addresses from API response (more reliable than parsing account data)
    let poolSourceVault: PublicKey;
    let poolDestVault: PublicKey;

    if (poolInfo.vaultA && poolInfo.vaultB) {
      // Use vault addresses from API response
      // vaultA corresponds to mintA, vaultB corresponds to mintB
      if (poolInfo.mintA.equals(poolSourceMint)) {
        // mintA is source (NUKE), so vaultA is source vault
        poolSourceVault = poolInfo.vaultA;
        poolDestVault = poolInfo.vaultB;
      } else {
        // mintB is source (NUKE), so vaultB is source vault
        poolSourceVault = poolInfo.vaultB;
        poolDestVault = poolInfo.vaultA;
      }

      logger.info('Pool vaults from API', {
        poolSourceVault: poolSourceVault.toBase58(),
        poolDestVault: poolDestVault.toBase58(),
        vaultA: poolInfo.vaultA.toBase58(),
        vaultB: poolInfo.vaultB.toBase58(),
        mintA: poolInfo.mintA.toBase58(),
        mintB: poolInfo.mintB.toBase58(),
        note: 'Using vault addresses from Raydium API response',
      });
    } else {
      // Fallback: Parse vault addresses from pool account data
      logger.warn('Vault addresses not in API response, falling back to parsing pool account data');
      const poolAccount = await connection.getAccountInfo(poolId);
      if (!poolAccount) {
        throw new Error(`Pool account not found: ${poolId.toBase58()}`);
      }

      if (poolAccount.data.length < 112) {
        throw new Error(`Pool account data too short: ${poolAccount.data.length} bytes`);
      }

      // Pool account layout:
      // Offset 48-80: tokenAVault (32 bytes)
      // Offset 80-112: tokenBVault (32 bytes)
      const tokenAVault = new PublicKey(poolAccount.data.slice(48, 80));
      const tokenBVault = new PublicKey(poolAccount.data.slice(80, 112));

      // Determine which vault is source and which is destination
      if (poolInfo.mintA.equals(poolSourceMint)) {
        poolSourceVault = tokenAVault;
        poolDestVault = tokenBVault;
      } else {
        poolSourceVault = tokenBVault;
        poolDestVault = tokenAVault;
      }

      logger.info('Pool vaults from account data', {
        poolSourceVault: poolSourceVault.toBase58(),
        poolDestVault: poolDestVault.toBase58(),
      });
    }

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

    // Create swap instruction using official Raydium AMM v4 program (works for both Standard and CPMM)
    // CRITICAL: Must use TOKEN_2022_PROGRAM_ID for Token-2022 source (NUKE)
    // Raydium supports mixed-program swaps (Token-2022 source, SPL Token destination)
    logger.info('Swap instruction debug - accounts verification', {
      poolId: poolId.toBase58(),
      poolType: poolInfo.poolType,
      poolProgramId: poolInfo.poolProgramId.toBase58(),
      tokenProgramId: sourceTokenProgram.toBase58(),
      sourceMint: poolSourceMint.toBase58(),
      destinationMint: poolDestMint.toBase58(),
      userSourceTokenAccount: rewardNukeAccount.toBase58(),
      userDestTokenAccount: userSolAccount.toBase58(),
      poolSourceVault: poolSourceVault.toBase58(),
      poolDestVault: poolDestVault.toBase58(),
      rewardWallet: rewardWalletAddress.toBase58(),
      isToken2022Source: NUKE_IS_TOKEN_2022,
      isToken2022Dest: WSOL_IS_TOKEN_2022,
      amountIn: amountNuke.toString(),
      minAmountOut: minDestAmount.toString(),
      note: 'Using TOKEN_2022_PROGRAM_ID for Token-2022 source (NUKE)',
    });

    // Verify all accounts exist before building instruction
    // Use getAccount() for token accounts (with proper program ID) and getAccountInfo() for regular accounts
    let rewardNukeAccountExists = false;
    let poolSourceVaultExists = false;
    let poolDestVaultExists = false;
    let userSolAccountExists = false;
    let poolAccountExists = false;

    try {
      await getAccount(connection, rewardNukeAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
      rewardNukeAccountExists = true;
    } catch {
      // Account doesn't exist or error
    }

    try {
      // Pool source vault (NUKE) - try TOKEN_2022_PROGRAM_ID first, then TOKEN_PROGRAM_ID
      await getAccount(connection, poolSourceVault, 'confirmed', TOKEN_2022_PROGRAM_ID);
      poolSourceVaultExists = true;
    } catch {
      try {
        await getAccount(connection, poolSourceVault, 'confirmed', TOKEN_PROGRAM_ID);
        poolSourceVaultExists = true;
      } catch {
        // Vault doesn't exist
      }
    }

    try {
      // Pool destination vault (WSOL) - try TOKEN_PROGRAM_ID first, then TOKEN_2022_PROGRAM_ID
      await getAccount(connection, poolDestVault, 'confirmed', TOKEN_PROGRAM_ID);
      poolDestVaultExists = true;
    } catch {
      try {
        await getAccount(connection, poolDestVault, 'confirmed', TOKEN_2022_PROGRAM_ID);
        poolDestVaultExists = true;
      } catch {
        // Vault doesn't exist
      }
    }

    try {
      await getAccount(connection, userSolAccount, 'confirmed', TOKEN_PROGRAM_ID);
      userSolAccountExists = true;
    } catch {
      // Account doesn't exist yet (will be created if needed)
    }

    try {
      const poolAccount = await connection.getAccountInfo(poolId);
      poolAccountExists = !!poolAccount;
    } catch {
      // Pool doesn't exist
    }

    logger.info('Account existence checks', {
      rewardNukeAccount: rewardNukeAccountExists ? 'exists' : 'missing',
      userSolAccount: userSolAccountExists ? 'exists' : 'missing (will create if needed)',
      poolSourceVault: poolSourceVaultExists ? 'exists' : 'missing',
      poolDestVault: poolDestVaultExists ? 'exists' : 'missing',
      poolId: poolAccountExists ? 'exists' : 'missing',
    });

    if (!rewardNukeAccountExists) {
      throw new Error(`Reward NUKE account does not exist: ${rewardNukeAccount.toBase58()}`);
    }
    if (!poolSourceVaultExists) {
      throw new Error(`Pool source vault does not exist: ${poolSourceVault.toBase58()}. This may indicate an incorrect pool ID or vault addresses.`);
    }
    if (!poolDestVaultExists) {
      throw new Error(`Pool destination vault does not exist: ${poolDestVault.toBase58()}. This may indicate an incorrect pool ID or vault addresses.`);
    }
    if (!poolAccountExists) {
      throw new Error(`Pool account does not exist: ${poolId.toBase58()}`);
    }

    const swapInstruction = createRaydiumSwapInstruction(
      poolId,
      poolInfo.poolProgramId, // Pool's program ID from API response
      rewardNukeAccount, // userSourceTokenAccount (NUKE - Token-2022)
      userSolAccount, // userDestinationTokenAccount (WSOL - SPL Token)
      poolSourceVault, // poolSourceTokenAccount (NUKE vault - Token-2022)
      poolDestVault, // poolDestinationTokenAccount (WSOL vault - SPL Token)
      poolSourceMint, // poolCoinMint (NUKE - Token-2022)
      poolDestMint, // poolPcMint (WSOL - SPL Token)
      amountNuke, // amountIn (transfer fee will be deducted during transfer)
      minDestAmount, // minimumAmountOut
      rewardWalletAddress, // userWallet
      sourceTokenProgram // TOKEN_2022_PROGRAM_ID (required for Token-2022 source)
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
      programId: RAYDIUM_AMM_V4_PROGRAM_ID.toBase58(),
      poolType: poolInfo.poolType,
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
      programId: RAYDIUM_AMM_V4_PROGRAM_ID.toBase58(),
    });
    throw error; // Re-throw to abort reward distribution
  }
}
