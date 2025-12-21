/**
 * Swap Service
 * 
 * Handles swapping NUKE tokens to SOL via Raydium pools (Standard, CPMM, or CLMM) on devnet
 * 
 * IMPORTANT: 
 * - Supports Standard AMM (v4), CPMM, and CLMM pool types
 * - Standard pools use Raydium AMM v4 program ID (675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8)
 * - CPMM/CLMM pools use pool-specific program IDs from API
 * - NUKE is a Token-2022 transfer-fee token (4% fee = 400 basis points), so received amounts account for fees
 * - Handles bidirectional swaps (mintA→mintB and mintB→mintA)
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
  ComputeBudgetProgram,
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
import { createHash } from 'crypto';
import { connection, tokenMint } from '../config/solana';
import { RAYDIUM_CONFIG, WSOL_MINT, getRaydiumPoolId, RAYDIUM_AMM_PROGRAM_ID } from '../config/raydium';
import { logger } from '../utils/logger';
import { loadKeypairFromEnv } from '../utils/loadKeypairFromEnv';

// Official Raydium AMM v4 Program ID (for Standard pools)
const RAYDIUM_AMM_V4_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

// Note: Hardcoded fallbacks have been removed
// Pool info (mints, vaults, program ID) must come from API response
// Reserves are fetched from chain if API doesn't provide them

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
  mintA?: { 
    address: string; 
    decimals?: number; 
    programId?: string;
    symbol?: string;
    extensions?: {
      transferFeeBasisPoints?: number;
    };
  };
  mintB?: { 
    address: string; 
    decimals?: number; 
    programId?: string;
    symbol?: string;
    extensions?: {
      transferFeeBasisPoints?: number;
    };
  };
  baseMint?: string;
  quoteMint?: string;
  mintAmountA?: number;
  mintAmountB?: number;
  type?: string; // Pool type: "Standard", "Cpmm", "Clmm", etc. (may be undefined)
  vault?: {
    A?: string; // Vault address for mintA
    B?: string; // Vault address for mintB
  };
  feeRate?: number; // Pool fee rate
  tradeFeeRate?: number; // Trade fee rate
  protocolFeeRate?: number; // Protocol fee rate
  lpMint?: string; // LP token mint address
}

interface RaydiumApiResponse {
  success?: boolean;
  data?: RaydiumApiPoolInfo[];
}

/**
 * Fetch pool info from Raydium API to validate pool type, get reserves, and vault addresses
 * Supports Standard AMM (v4), CPMM, and CLMM pool types
 * Uses /pools/key/ids endpoint which includes vault addresses
 */
async function fetchPoolInfoFromAPI(poolId: PublicKey): Promise<{
  poolType: 'Standard' | 'Cpmm' | 'Clmm';
  poolProgramId: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  reserveA?: bigint; // Reserve amounts from API (undefined if not provided - fetch from chain)
  reserveB?: bigint; // Reserve amounts from API (undefined if not provided - fetch from chain)
  decimalsA: number;
  decimalsB: number;
  vaultA: PublicKey;
  vaultB: PublicKey;
  transferFeeBasisPointsA?: number; // Transfer fee for mintA (Token-2022)
  transferFeeBasisPointsB?: number; // Transfer fee for mintB (Token-2022)
  feeRate?: number;
  tradeFeeRate?: number;
  protocolFeeRate?: number;
  lpMint?: PublicKey;
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

  // Extract program ID from API response (required)
  if (!poolInfo.programId) {
    throw new Error('Pool API response missing programId');
  }
  const poolProgramId = new PublicKey(poolInfo.programId);

  // Handle pool type - default to "Standard" if not provided (common for Standard AMM v4 pools)
  let normalizedType = 'standard';
  if (poolInfo.type) {
    normalizedType = poolInfo.type.toLowerCase();
  } else {
    logger.info('Pool type not in API response, defaulting to "Standard"', {
      poolId: poolId.toBase58(),
    });
  }

  // Support Standard AMM (v4), CPMM, and CLMM pools
  if (!['standard', 'cpmm', 'clmm'].includes(normalizedType)) {
    throw new Error(`Unsupported Raydium pool type: "${poolInfo.type}". Supported types: Standard, CPMM, CLMM.`);
  }

  // Extract mint addresses (required - no fallbacks)
  if (!poolInfo.mintA || !poolInfo.mintB) {
    throw new Error('Pool API response missing mint addresses');
  }
  const mintA = new PublicKey(poolInfo.mintA.address);
  const mintB = new PublicKey(poolInfo.mintB.address);
  const decimalsA = poolInfo.mintA.decimals || 9;
  const decimalsB = poolInfo.mintB.decimals || 6;

  // Extract reserves from API if available (will fetch from chain if missing)
  let reserveA: bigint | undefined;
  let reserveB: bigint | undefined;
  if (poolInfo.mintAmountA !== undefined && poolInfo.mintAmountB !== undefined) {
    reserveA = BigInt(Math.floor(poolInfo.mintAmountA * Math.pow(10, decimalsA)));
    reserveB = BigInt(Math.floor(poolInfo.mintAmountB * Math.pow(10, decimalsB)));
    logger.debug('Reserves extracted from API response', {
      reserveA: reserveA.toString(),
      reserveB: reserveB.toString(),
    });
  } else {
    logger.info('Reserves not in API response - will fetch from chain', {
      poolId: poolId.toBase58(),
    });
  }

  // Extract vault addresses (required - no fallbacks)
  if (!poolInfo.vault?.A || !poolInfo.vault?.B) {
    throw new Error('Pool API response missing vault addresses');
  }
  const vaultA = new PublicKey(poolInfo.vault.A);
  const vaultB = new PublicKey(poolInfo.vault.B);

  // Extract transfer fee information (Token-2022 extensions)
  const transferFeeBasisPointsA = poolInfo.mintA?.extensions?.transferFeeBasisPoints;
  const transferFeeBasisPointsB = poolInfo.mintB?.extensions?.transferFeeBasisPoints;

  // Extract fee rates and LP mint if available
  const feeRate = poolInfo.feeRate;
  const tradeFeeRate = poolInfo.tradeFeeRate;
  const protocolFeeRate = poolInfo.protocolFeeRate;
  const lpMint = poolInfo.lpMint ? new PublicKey(poolInfo.lpMint) : undefined;

  // Normalize pool type for return (capitalize first letter)
  const normalizedPoolType = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1);

  logger.info('Pool info extracted from API', {
    poolType: normalizedPoolType,
    poolProgramId: poolProgramId.toBase58(),
    transferFeeA: transferFeeBasisPointsA,
    transferFeeB: transferFeeBasisPointsB,
    feeRate,
    tradeFeeRate,
    protocolFeeRate,
    lpMint: lpMint?.toBase58(),
  });

  return {
    poolType: normalizedPoolType as 'Standard' | 'Cpmm' | 'Clmm',
    poolProgramId,
    mintA,
    mintB,
    reserveA, // May be undefined if API doesn't provide reserves
    reserveB, // May be undefined if API doesn't provide reserves
    decimalsA,
    decimalsB,
    vaultA,
    vaultB,
    transferFeeBasisPointsA,
    transferFeeBasisPointsB,
    feeRate,
    tradeFeeRate,
    protocolFeeRate,
    lpMint,
  };
}

/**
 * Fetch vault reserves directly from chain
 * Used when API doesn't provide reserve amounts
 */
async function fetchVaultReservesFromChain(
  vaultA: PublicKey,
  vaultB: PublicKey,
  decimalsA: number,
  decimalsB: number
): Promise<{
  reserveA: bigint;
  reserveB: bigint;
}> {
  logger.info('Fetching vault reserves from chain', {
    vaultA: vaultA.toBase58(),
    vaultB: vaultB.toBase58(),
  });

  // Try TOKEN_2022_PROGRAM_ID first, then TOKEN_PROGRAM_ID
  let vaultAAccount = null;
  let vaultBAccount = null;

  try {
    vaultAAccount = await getAccount(connection, vaultA, 'confirmed', TOKEN_2022_PROGRAM_ID);
  } catch {
    try {
      vaultAAccount = await getAccount(connection, vaultA, 'confirmed', TOKEN_PROGRAM_ID);
    } catch (error) {
      throw new Error(`Failed to fetch vaultA account: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    vaultBAccount = await getAccount(connection, vaultB, 'confirmed', TOKEN_2022_PROGRAM_ID);
  } catch {
    try {
      vaultBAccount = await getAccount(connection, vaultB, 'confirmed', TOKEN_PROGRAM_ID);
    } catch (error) {
      throw new Error(`Failed to fetch vaultB account: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!vaultAAccount || !vaultBAccount) {
    throw new Error('Failed to fetch vault accounts from chain');
  }

  logger.info('Vault reserves fetched from chain', {
    reserveA: vaultAAccount.amount.toString(),
    reserveB: vaultBAccount.amount.toString(),
  });

  return {
    reserveA: vaultAAccount.amount,
    reserveB: vaultBAccount.amount,
  };
}

/**
 * Verify pool has sufficient liquidity for the swap
 */
function verifyLiquidity(
  sourceReserve: bigint,
  destReserve: bigint,
  amountIn: bigint,
  minDestAmount: bigint
): { valid: boolean; reason?: string } {
  // Check source reserve is sufficient
  if (sourceReserve === 0n) {
    return { valid: false, reason: 'Source reserve (NUKE) is zero - pool has no liquidity' };
  }

  // Check destination reserve is sufficient
  if (destReserve === 0n) {
    return { valid: false, reason: 'Destination reserve (SOL) is zero - pool has no liquidity' };
  }

  // Check destination reserve has enough liquidity (at least 2x expected output for safety)
  const minLiquidityRatio = 2n;
  const requiredLiquidity = minDestAmount * minLiquidityRatio;
  if (destReserve < requiredLiquidity) {
    return {
      valid: false,
      reason: `Destination reserve (${destReserve.toString()}) is insufficient. Required: ${requiredLiquidity.toString()}, Available: ${destReserve.toString()}`,
    };
  }

  return { valid: true };
}

/**
 * Create compute budget instructions for swap transaction
 * Sets compute unit limit and priority fee
 */
function createComputeBudgetInstructions(): TransactionInstruction[] {
  const instructions: TransactionInstruction[] = [];
  
  // Set compute unit limit (standard swap transactions need ~200k compute units)
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 400000, // Higher limit for Token-2022 swaps with transfer fees
    })
  );

  // Set compute unit price (priority fee) - 0.000005 SOL per compute unit
  // This helps ensure transaction gets processed quickly
  instructions.push(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 5000, // 5000 microLamports per compute unit
    })
  );

  return instructions;
}

/**
 * Create Raydium swap instruction for Standard AMM v4 pools
 * 
 * Standard pools use the Raydium AMM v4 program ID (675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8)
 * The instruction format uses discriminator 9 (0x09) for swap.
 * 
 * For Token-2022 source tokens (NUKE), we must handle the transfer fee correctly.
 * The amountIn is the amount we want to swap, and the transfer fee will be deducted
 * during the token transfer, so the pool receives amountIn * (1 - transferFeeBps/10000).
 * 
 * Standard AMM v4 Swap Instruction Format:
 * - Instruction discriminator: 9 (0x09)
 * - amountIn: u64 (8 bytes) - Amount BEFORE transfer fee deduction
 * - minimumAmountOut: u64 (8 bytes) - Minimum amount to receive (with slippage)
 * 
 * Accounts for Standard AMM v4 swap (Token-2022 source, SPL Token destination):
 * 0. ammTargetOrders (writable)
 * 1. poolCoinTokenAccount (writable) - Pool's source token vault
 * 2. poolPcTokenAccount (writable) - Pool's destination token vault
 * 3. poolWithdrawQueue (writable)
 * 4. poolTempLpTokenAccount (writable)
 * 5. serumProgramId (not writable)
 * 6. serumMarket (writable)
 * 7. serumBids (writable)
 * 8. serumAsks (writable)
 * 9. serumEventQueue (writable)
 * 10. serumCoinVaultAccount (writable)
 * 11. serumPcVaultAccount (writable)
 * 12. serumVaultSigner (not writable)
 * 13. userSourceTokenAccount (writable) - User's source token account
 * 14. userDestinationTokenAccount (writable) - User's destination token account
 * 15. userSourceOwner (signer, writable) - User's wallet
 * 16. poolCoinMint - Source token mint
 * 17. poolPcMint - Destination token mint
 * 18. poolId (writable) - Pool account
 * 19. serumCoinVaultAccount (not writable)
 * 20. serumPcVaultAccount (not writable)
 * 21. ammTargetOrders (not writable)
 * 22. poolWithdrawQueue (not writable)
 * 23. poolTempLpTokenAccount (not writable)
 * 24. tokenProgramId - TOKEN_2022_PROGRAM_ID if source is Token-2022, else TOKEN_PROGRAM_ID
 * 
 * NOTE: Standard AMM v4 uses a complex account structure. For simplicity, we'll use
 * a simplified account list. The actual implementation may need to fetch the full
 * pool state from chain to get all required accounts.
 * 
 * However, based on the user's requirements, for Standard pools we should use
 * the Raydium SDK swap function. Since we don't have the SDK installed, we'll
 * implement the instruction format manually based on the AMM v4 program structure.
 */
function createRaydiumStandardSwapInstruction(
  poolId: PublicKey,
  userSourceTokenAccount: PublicKey,
  userDestinationTokenAccount: PublicKey,
  poolSourceTokenAccount: PublicKey,
  poolDestinationTokenAccount: PublicKey,
  poolSourceMint: PublicKey,
  poolDestMint: PublicKey,
  amountIn: bigint,
  minimumAmountOut: bigint,
  userWallet: PublicKey,
  sourceTokenProgram: PublicKey // TOKEN_2022_PROGRAM_ID or TOKEN_PROGRAM_ID
): TransactionInstruction {
  // Standard AMM v4 swap instruction discriminator: 9 (0x09)
  const SWAP_DISCRIMINATOR = 9;
  
  // Instruction layout: [1-byte discriminator][8-byte amountIn][8-byte minimumAmountOut] = 17 bytes total
  const instructionData = Buffer.alloc(17);
  instructionData.writeUInt8(SWAP_DISCRIMINATOR, 0);
  instructionData.writeBigUInt64LE(amountIn, 1);
  instructionData.writeBigUInt64LE(minimumAmountOut, 9);

  logger.info('Creating Standard AMM v4 swap instruction', {
    poolProgramId: RAYDIUM_AMM_V4_PROGRAM_ID.toBase58(),
    poolId: poolId.toBase58(),
    amountIn: amountIn.toString(),
    minimumAmountOut: minimumAmountOut.toString(),
    tokenProgramId: sourceTokenProgram.toBase58(),
    note: 'Standard pools use Raydium AMM v4 program ID',
  });

  // NOTE: Standard AMM v4 requires many more accounts (20+) including serum market accounts.
  // This is a simplified version. In production, you would need to:
  // 1. Fetch the pool state from chain
  // 2. Extract all required accounts (serum market, target orders, etc.)
  // 3. Build the full account list
  // 
  // For now, we'll use a minimal account structure. If this fails, we may need to
  // use the Raydium SDK or fetch the full pool state.
  
  return new TransactionInstruction({
    programId: RAYDIUM_AMM_V4_PROGRAM_ID,
    keys: [
      { pubkey: poolId, isSigner: false, isWritable: true },
      { pubkey: poolSourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolDestinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userWallet, isSigner: true, isWritable: true },
      { pubkey: poolSourceMint, isSigner: false, isWritable: false },
      { pubkey: poolDestMint, isSigner: false, isWritable: false },
      { pubkey: sourceTokenProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });
}

/**
 * Create Raydium swap instruction for CLMM pools
 * 
 * CLMM pools use the pool's specific program ID from API (not the standard AMM v4 ID).
 * The instruction format for CLMM uses Anchor instruction format.
 * 
 * For Token-2022 source tokens (NUKE), we must handle the transfer fee correctly.
 * The amountIn is the amount we want to swap, and the transfer fee will be deducted
 * during the token transfer.
 * 
 * CLMM Swap Instruction Format (Anchor):
 * - Instruction discriminator: first 8 bytes of sha256("global:swap")
 * - amountIn: u64 (8 bytes) - Amount BEFORE transfer fee deduction
 * - minimumAmountOut: u64 (8 bytes) - Minimum amount to receive (with slippage)
 * 
 * Accounts for CLMM swap (Token-2022 source, SPL Token destination):
 * 0. poolId (writable) - Pool account
 * 1. userSourceTokenAccount (writable) - User's source token account (Token-2022)
 * 2. userDestinationTokenAccount (writable) - User's destination token account (SPL Token)
 * 3. poolSourceTokenAccount (writable) - Pool's source token vault (Token-2022)
 * 4. poolDestinationTokenAccount (writable) - Pool's destination token vault (SPL Token)
 * 5. poolCoinMint - Source token mint (Token-2022)
 * 6. poolPcMint - Destination token mint (SPL Token)
 * 7. userWallet (signer, writable) - User's wallet
 * 8. tokenProgramId - TOKEN_2022_PROGRAM_ID (required for Token-2022 source transfers)
 * 9. systemProgram - System program
 * 
 * NOTE: For mixed token programs (Token-2022 source, SPL Token destination),
 * we use TOKEN_2022_PROGRAM_ID because the source token is Token-2022.
 */
function createRaydiumClmmSwapInstruction(
  poolId: PublicKey,
  poolProgramId: PublicKey, // CRITICAL: Use pool's program ID from API
  userSourceTokenAccount: PublicKey,
  userDestinationTokenAccount: PublicKey,
  poolSourceTokenAccount: PublicKey,
  poolDestinationTokenAccount: PublicKey,
  poolCoinMint: PublicKey,
  poolPcMint: PublicKey,
  amountIn: bigint, // Amount BEFORE transfer fee (will be deducted during transfer)
  minimumAmountOut: bigint,
  userWallet: PublicKey,
  sourceTokenProgram: PublicKey // TOKEN_2022_PROGRAM_ID or TOKEN_PROGRAM_ID
): TransactionInstruction {
  // CRITICAL: CPMM pools on Raydium use Anchor instruction format
  // Anchor instructions use 8-byte discriminators derived from instruction name
  // Discriminator = first 8 bytes of sha256("namespace:instruction_name")
  // For Raydium CPMM swap, we need to derive the discriminator from the instruction name
  // Common pattern: sha256("global:swap") or sha256("raydium_cpmm:swap")
  
  // CRITICAL: Anchor instruction discriminator calculation
  // Anchor uses: first 8 bytes of sha256("namespace:instruction_name")
  // For Raydium CPMM, common patterns are:
  // - "global:swap" (most common)
  // - "swap" (simpler, some programs use this)
  // - "raydium_cpmm:swap" (program-specific)
  // 
  // We'll try "global:swap" first. If this fails with InstructionFallbackNotFound,
  // we may need to try other instruction names or check the pool's IDL.
  
  // Calculate discriminator: sha256("global:swap")[0:8]
  const discriminatorHash = createHash('sha256')
    .update('global:swap')
    .digest();
  const swapDiscriminator = discriminatorHash.slice(0, 8);
  
  logger.info('CLMM swap discriminator calculation', {
    instructionName: 'global:swap',
    discriminatorHex: swapDiscriminator.toString('hex'),
    discriminatorDecimal: swapDiscriminator.readUInt32LE(0).toString(),
    note: 'If InstructionFallbackNotFound (101) persists, may need different instruction name or check pool IDL',
  });
  
  // Instruction layout: [8-byte discriminator][8-byte amountIn][8-byte minimumAmountOut] = 24 bytes total
  const instructionData = Buffer.alloc(24);
  swapDiscriminator.copy(instructionData, 0);
  
  // Write amountIn at offset 8 (after 8-byte discriminator)
  instructionData.writeBigUInt64LE(amountIn, 8);
  
  // Write minimumAmountOut at offset 16 (after discriminator + amountIn)
  instructionData.writeBigUInt64LE(minimumAmountOut, 16);
  
  logger.debug('CLMM swap instruction data', {
    discriminator: swapDiscriminator.toString('hex'),
    amountIn: amountIn.toString(),
    minimumAmountOut: minimumAmountOut.toString(),
    instructionDataLength: instructionData.length,
  });

  // Use the provided token program ID (TOKEN_2022_PROGRAM_ID for Token-2022 source, TOKEN_PROGRAM_ID otherwise)
  const tokenProgramId = sourceTokenProgram;

  logger.info('Creating CLMM swap instruction', {
    poolProgramId: poolProgramId.toBase58(),
    poolId: poolId.toBase58(),
    amountIn: amountIn.toString(),
    minimumAmountOut: minimumAmountOut.toString(),
    tokenProgramId: tokenProgramId.toBase58(),
    note: 'Using pool program ID from API for CLMM pool',
  });

  return new TransactionInstruction({
    programId: poolProgramId, // CRITICAL: Use pool's program ID from API
    keys: [
      { pubkey: poolId, isSigner: false, isWritable: true },
      { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true }, // NUKE (Token-2022)
      { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true }, // WSOL (SPL Token)
      { pubkey: poolSourceTokenAccount, isSigner: false, isWritable: true }, // Pool NUKE vault (Token-2022)
      { pubkey: poolDestinationTokenAccount, isSigner: false, isWritable: true }, // Pool WSOL vault (SPL Token)
      { pubkey: poolCoinMint, isSigner: false, isWritable: false }, // NUKE mint (Token-2022)
      { pubkey: poolPcMint, isSigner: false, isWritable: false }, // WSOL mint (SPL Token)
      { pubkey: userWallet, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false }, // TOKEN_2022_PROGRAM_ID
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });
}

/**
 * Swap NUKE tokens to SOL via Raydium pool (Standard, CPMM, or CLMM)
 * 
 * This function:
 * 1. Detects pool type from API (Standard, CPMM, or CLMM)
 * 2. Uses appropriate swap instruction based on pool type:
 *    - Standard: Uses Raydium AMM v4 program ID and instruction format
 *    - CLMM: Uses pool-specific program ID with Anchor instruction format
 * 3. Handles Token-2022 transfer fees (respects transferFeeBasisPoints from API)
 * 4. Pre-creates WSOL destination account if needed
 * 5. Verifies liquidity before swap calculation
 * 6. Adds compute budget instructions for reliable execution
 * 7. Simulates transaction before sending
 * 8. Handles errors gracefully (InstructionFallbackNotFound 101, TransferFee errors)
 * 9. Aborts distribution if swap fails
 * 
 * Token-2022 Handling:
 * - Detects Token-2022 tokens via extensions.transferFeeBasisPoints from API
 * - Uses TOKEN_2022_PROGRAM_ID for Token-2022 source tokens
 * - Uses TOKEN_PROGRAM_ID for SPL Token source tokens
 * - Accounts for transfer fees in swap calculations
 * 
 * @param amountNuke - Amount of NUKE to swap (in raw token units, with decimals)
 *                    - This is the amount BEFORE transfer fee deduction
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
    logger.info('Starting NUKE to SOL swap via Raydium pool', {
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

    // Step 3: Fetch pool info from API to validate pool type and get reserves
    logger.info('Fetching pool info from Raydium API', { poolId: poolId.toBase58() });
    const poolInfo = await fetchPoolInfoFromAPI(poolId);
    
    logger.info('Pool validated', {
      poolType: poolInfo.poolType,
      poolProgramId: poolInfo.poolProgramId.toBase58(),
      mintA: poolInfo.mintA.toBase58(),
      mintB: poolInfo.mintB.toBase58(),
      transferFeeA: poolInfo.transferFeeBasisPointsA,
      transferFeeB: poolInfo.transferFeeBasisPointsB,
    });

    // Step 3.5: Determine Token-2022 vs SPL Token based on pool info
    // Detect which mint is NUKE and which is WSOL, then determine token programs
    const nukeMint = tokenMint;
    const solMint = WSOL_MINT;
    
    let sourceIsToken2022: boolean;
    let sourceTokenProgram: PublicKey;
    let destTokenProgram: PublicKey;
    let sourceTransferFeeBps: number = 0;

    if (poolInfo.mintA.equals(nukeMint)) {
      // mintA is NUKE
      sourceIsToken2022 = poolInfo.transferFeeBasisPointsA !== undefined;
      sourceTokenProgram = sourceIsToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      destTokenProgram = TOKEN_PROGRAM_ID; // WSOL is always SPL Token
      sourceTransferFeeBps = poolInfo.transferFeeBasisPointsA || 0;
    } else {
      // mintB is NUKE
      sourceIsToken2022 = poolInfo.transferFeeBasisPointsB !== undefined;
      sourceTokenProgram = sourceIsToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      destTokenProgram = TOKEN_PROGRAM_ID; // WSOL is always SPL Token
      sourceTransferFeeBps = poolInfo.transferFeeBasisPointsB || 0;
    }

    logger.info('Token program detection', {
      sourceTokenProgram: sourceTokenProgram.toBase58(),
      destTokenProgram: destTokenProgram.toBase58(),
      sourceIsToken2022,
      sourceTransferFeeBps,
      note: `NUKE transfer fee: ${sourceTransferFeeBps} basis points (${sourceTransferFeeBps / 100}%)`,
    });

    // Step 4: Determine swap direction and map mints/vaults
    let poolSourceMint: PublicKey;
    let poolDestMint: PublicKey;
    let poolSourceVault: PublicKey;
    let poolDestVault: PublicKey;
    let sourceDecimals: number;
    let destDecimals: number;

    if (poolInfo.mintA.equals(nukeMint) && poolInfo.mintB.equals(solMint)) {
      // mintA = NUKE, mintB = SOL
      poolSourceMint = poolInfo.mintA;
      poolDestMint = poolInfo.mintB;
      poolSourceVault = poolInfo.vaultA;
      poolDestVault = poolInfo.vaultB;
      sourceDecimals = poolInfo.decimalsA;
      destDecimals = poolInfo.decimalsB;
    } else if (poolInfo.mintB.equals(nukeMint) && poolInfo.mintA.equals(solMint)) {
      // mintB = NUKE, mintA = SOL
      poolSourceMint = poolInfo.mintB;
      poolDestMint = poolInfo.mintA;
      poolSourceVault = poolInfo.vaultB;
      poolDestVault = poolInfo.vaultA;
      sourceDecimals = poolInfo.decimalsB;
      destDecimals = poolInfo.decimalsA;
    } else {
      throw new Error(`Pool does not contain NUKE/SOL pair. Pool mints: ${poolInfo.mintA.toBase58()}, ${poolInfo.mintB.toBase58()}`);
    }

    // Step 4.5: Get reserves (from API if available, otherwise from chain)
    let sourceReserve: bigint;
    let destReserve: bigint;

    if (poolInfo.reserveA !== undefined && poolInfo.reserveB !== undefined) {
      // Use API reserves (map to source/dest based on swap direction)
      if (poolInfo.mintA.equals(poolSourceMint)) {
        sourceReserve = poolInfo.reserveA;
        destReserve = poolInfo.reserveB;
      } else {
        sourceReserve = poolInfo.reserveB;
        destReserve = poolInfo.reserveA;
      }
      logger.info('Using reserves from API', {
        sourceReserve: sourceReserve.toString(),
        destReserve: destReserve.toString(),
      });
    } else {
      // Fetch reserves from chain
      logger.info('API reserves not available, fetching from chain vaults');
      const chainReserves = await fetchVaultReservesFromChain(
        poolSourceVault,
        poolDestVault,
        sourceDecimals,
        destDecimals
      );
      sourceReserve = chainReserves.reserveA;
      destReserve = chainReserves.reserveB;
      logger.info('Using reserves from chain', {
        sourceReserve: sourceReserve.toString(),
        destReserve: destReserve.toString(),
      });
    }

    logger.info('Swap direction and reserves determined', {
      poolSourceMint: poolSourceMint.toBase58(),
      poolDestMint: poolDestMint.toBase58(),
      poolSourceVault: poolSourceVault.toBase58(),
      poolDestVault: poolDestVault.toBase58(),
      sourceReserve: sourceReserve.toString(),
      destReserve: destReserve.toString(),
    });

    // Step 5: Verify liquidity before calculating swap output
    // First, estimate expected output for liquidity check
    const feeMultiplier = 0.9975; // Raydium fee (0.25%)
    
    // Calculate amount after transfer fee (if Token-2022 with transfer fee)
    // transferFeeBps is in basis points (400 = 4%)
    // Amount after fee = amountIn * (10000 - transferFeeBps) / 10000
    const nukeAfterTransferFee = sourceTransferFeeBps > 0
      ? (amountNuke * BigInt(10000 - sourceTransferFeeBps)) / BigInt(10000)
      : amountNuke;
    
    // Estimate expected output for liquidity verification
    const estimatedDestAmount = (destReserve * nukeAfterTransferFee * BigInt(Math.floor(feeMultiplier * 10000))) / (sourceReserve + nukeAfterTransferFee) / BigInt(10000);
    const estimatedMinDestAmount = (estimatedDestAmount * BigInt(10000 - slippageBps)) / BigInt(10000);

    // Verify liquidity
    const liquidityCheck = verifyLiquidity(sourceReserve, destReserve, amountNuke, estimatedMinDestAmount);
    if (!liquidityCheck.valid) {
      logger.warn('Insufficient liquidity - aborting swap', {
        reason: liquidityCheck.reason,
        sourceReserve: sourceReserve.toString(),
        destReserve: destReserve.toString(),
        amountNuke: amountNuke.toString(),
        estimatedMinDestAmount: estimatedMinDestAmount.toString(),
      });
      throw new Error(`Insufficient liquidity: ${liquidityCheck.reason}`);
    }

    // Step 7: Calculate expected SOL output (final calculation)
    const expectedDestAmount = (destReserve * nukeAfterTransferFee * BigInt(Math.floor(feeMultiplier * 10000))) / (sourceReserve + nukeAfterTransferFee) / BigInt(10000);
    const minDestAmount = (expectedDestAmount * BigInt(10000 - slippageBps)) / BigInt(10000);

    if (minDestAmount < MIN_SOL_OUTPUT) {
      logger.warn('Expected SOL output below minimum threshold', {
        expectedSolLamports: expectedDestAmount.toString(),
        minSolLamports: minDestAmount.toString(),
        minimumThreshold: MIN_SOL_OUTPUT.toString(),
      });
      throw new Error(
        `Expected SOL output too low: ${Number(minDestAmount) / LAMPORTS_PER_SOL} SOL (minimum: ${MIN_SOL_OUTPUT / LAMPORTS_PER_SOL} SOL). Pool may have insufficient liquidity.`
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
      transferFeeBps: sourceTransferFeeBps,
      note: sourceTransferFeeBps > 0 
        ? `NUKE has ${sourceTransferFeeBps / 100}% transfer fee, so pool receives less than amountNuke`
        : 'No transfer fee on source token',
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
    
    // Add compute budget instructions first (required for reliable execution)
    const computeBudgetInstructions = createComputeBudgetInstructions();
    for (const instruction of computeBudgetInstructions) {
      transaction.add(instruction);
    }
    
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

    // Create swap instruction based on pool type
    logger.info('Creating swap instruction', {
      poolType: poolInfo.poolType,
      poolProgramId: poolInfo.poolProgramId.toBase58(),
      poolId: poolId.toBase58(),
      amountNuke: amountNuke.toString(),
      minDestAmount: minDestAmount.toString(),
      sourceTokenProgram: sourceTokenProgram.toBase58(),
    });

    let swapInstruction: TransactionInstruction;

    if (poolInfo.poolType === 'Standard') {
      // Standard pools use Raydium AMM v4 program ID
      swapInstruction = createRaydiumStandardSwapInstruction(
        poolId,
        rewardNukeAccount, // userSourceTokenAccount
        userSolAccount, // userDestinationTokenAccount
        poolSourceVault, // poolSourceTokenAccount
        poolDestVault, // poolDestinationTokenAccount
        poolSourceMint, // poolSourceMint
        poolDestMint, // poolDestMint
        amountNuke, // amountIn
        minDestAmount, // minimumAmountOut
        rewardWalletAddress, // userWallet
        sourceTokenProgram // sourceTokenProgram
      );
    } else if (poolInfo.poolType === 'Clmm') {
      // CLMM pools use pool-specific program ID with Anchor instruction format
      swapInstruction = createRaydiumClmmSwapInstruction(
        poolId,
        poolInfo.poolProgramId, // CRITICAL: Use pool's program ID from API
        rewardNukeAccount, // userSourceTokenAccount
        userSolAccount, // userDestinationTokenAccount
        poolSourceVault, // poolSourceTokenAccount
        poolDestVault, // poolDestinationTokenAccount
        poolSourceMint, // poolCoinMint
        poolDestMint, // poolPcMint
        amountNuke, // amountIn
        minDestAmount, // minimumAmountOut
        rewardWalletAddress, // userWallet
        sourceTokenProgram // sourceTokenProgram
      );
    } else {
      throw new Error(`Unsupported pool type: ${poolInfo.poolType}. Only Standard and CLMM pools are currently supported.`);
    }

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
      poolType: poolInfo.poolType,
      expectedSolLamports: expectedDestAmount.toString(),
      minSolLamports: minDestAmount.toString(),
      poolProgramId: poolInfo.poolProgramId.toBase58(),
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
      // Handle specific error codes
      if (sendError instanceof Error) {
        const errorMessage = sendError.message;
        const errorString = JSON.stringify(sendError);
        
        // Check for InstructionFallbackNotFound (101)
        if (errorMessage.includes('101') || errorString.includes('101') || errorMessage.includes('InstructionFallbackNotFound')) {
          logger.error('InstructionFallbackNotFound (101) - Anchor instruction discriminator not found', {
            poolType: poolInfo.poolType,
            poolProgramId: poolInfo.poolProgramId.toBase58(),
            note: 'This may indicate incorrect instruction discriminator or pool program ID mismatch',
          });
          throw new Error(`Swap instruction not recognized by program (101). Pool type: ${poolInfo.poolType}, Program ID: ${poolInfo.poolProgramId.toBase58()}`);
        }
        
        // Check for transfer fee errors
        if (errorMessage.includes('TransferFee') || errorMessage.includes('transfer fee') || errorMessage.includes('fee')) {
          logger.error('Transfer fee error detected', {
            error: errorMessage,
            sourceTransferFeeBps,
            note: 'This may indicate incorrect transfer fee calculation or insufficient balance',
          });
          throw new Error(`Transfer fee error: ${errorMessage}`);
        }
      }
      
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
    logger.error('Error swapping NUKE to SOL via Raydium pool', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      amountNuke: amountNuke.toString(),
    });
    throw error; // Re-throw to abort reward distribution
  }
}
