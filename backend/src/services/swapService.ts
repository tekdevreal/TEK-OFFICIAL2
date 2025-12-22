/**
 * Swap Service
 * 
 * Handles swapping NUKE tokens to SOL via Raydium pools (Standard, CPMM, or CLMM) on devnet and mainnet
 * 
 * IMPORTANT: 
 * - Standard pools: Uses @raydium-io/raydium-sdk for automatic account fetching and instruction building
 * - CLMM pools: Uses pool-specific program IDs with Anchor instruction format
 * - NUKE is a Token-2022 transfer-fee token (4% fee = 400 basis points), SDK handles transfer fees automatically
 * - Handles bidirectional swaps (mintA→mintB and mintB→mintA)
 * - Works on both devnet and mainnet with correct program IDs
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
import Decimal from 'decimal.js';
import { createHash } from 'crypto';
import { connection, tokenMint, NETWORK } from '../config/solana';
import { RAYDIUM_CONFIG, WSOL_MINT, getRaydiumPoolId, RAYDIUM_AMM_PROGRAM_ID } from '../config/raydium';
import { logger } from '../utils/logger';
import { loadKeypairFromEnv } from '../utils/loadKeypairFromEnv';
// Raydium SDK imports - using dynamic import to handle type issues
// import { Liquidity, ApiPoolInfoItem, jsonInfo2PoolKeys, LiquidityPoolKeys } from '@raydium-io/raydium-sdk';
import { getTransferFeeConfig, unpackMint } from '@solana/spl-token';

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
 * Fetch pool info from Raydium API in SDK-compatible format
 * Uses /pools/info/ids endpoint for SDK compatibility
 */
async function fetchPoolInfoForSDK(poolId: PublicKey): Promise<any> {
  const apiUrl = `https://api-v3${NETWORK === 'mainnet' ? '' : '-devnet'}.raydium.io/pools/info/ids?ids=${poolId.toBase58()}`;
  
  logger.info('Fetching pool info for SDK', {
    poolId: poolId.toBase58(),
    apiUrl,
    network: NETWORK,
  });

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

  const data = await response.json() as { success?: boolean; data?: any[] };
  if (!data.success || !data.data || data.data.length === 0) {
    throw new Error('Pool not found in Raydium API');
  }

  return data.data[0];
}

/**
 * Get transfer fee configuration for Token-2022 mint
 */
async function getTokenTransferFee(mint: PublicKey): Promise<{ basisPoints: number; maximumFee: bigint } | null> {
  try {
    const mintInfo = await connection.getAccountInfo(mint);
    if (!mintInfo || !mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return null; // Not a Token-2022 mint
    }

    const parsedMint = unpackMint(mint, mintInfo, TOKEN_2022_PROGRAM_ID);
    const transferFeeConfig = getTransferFeeConfig(parsedMint);
    
    if (!transferFeeConfig) {
      return null; // No transfer fee configured
    }

    const activeFeeBps = transferFeeConfig.newerTransferFee?.transferFeeBasisPoints ?? 
                         transferFeeConfig.olderTransferFee?.transferFeeBasisPoints ?? 0;
    const maxFee = transferFeeConfig.newerTransferFee?.maximumFee ?? 
                   transferFeeConfig.olderTransferFee?.maximumFee ?? 0n;

    return {
      basisPoints: activeFeeBps,
      maximumFee: maxFee,
    };
  } catch (error) {
    logger.warn('Failed to get transfer fee config', {
      mint: mint.toBase58(),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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
 * Fetch Standard AMM v4 pool state from chain to extract all required accounts
 * 
 * Standard AMM v4 pool account structure (approximate offsets):
 * - Offset 0-8: status
 * - Offset 8-16: nonce
 * - Offset 16-48: tokenProgramId
 * - Offset 48-80: tokenAVault (base vault)
 * - Offset 80-112: tokenBVault (quote vault)
 * - Offset 112-144: poolCoinTokenAccount
 * - Offset 144-176: poolPcTokenAccount
 * - Offset 176-208: poolWithdrawQueue
 * - Offset 208-240: poolTempLpTokenAccount
 * - Offset 240-272: ammTargetOrders
 * - Offset 272-304: poolCoinMint
 * - Offset 304-336: poolPcMint
 * - Offset 336-368: serumMarket
 * - Offset 368-400: serumProgramId
 * - Offset 400-432: ammTargetOrders (duplicate)
 * - Offset 432-464: poolWithdrawQueue (duplicate)
 * - Offset 464-496: poolTempLpTokenAccount (duplicate)
 * - Offset 496-528: poolAuthority
 * 
 * Note: Actual offsets may vary. We'll parse the account data to extract PublicKeys.
 */
interface StandardPoolState {
  ammTargetOrders: PublicKey;
  poolCoinTokenAccount: PublicKey;
  poolPcTokenAccount: PublicKey;
  poolWithdrawQueue: PublicKey;
  poolTempLpTokenAccount: PublicKey;
  serumProgramId: PublicKey;
  serumMarket: PublicKey;
  serumBids: PublicKey;
  serumAsks: PublicKey;
  serumEventQueue: PublicKey;
  serumCoinVaultAccount: PublicKey;
  serumPcVaultAccount: PublicKey;
  serumVaultSigner: PublicKey;
  poolCoinMint: PublicKey;
  poolPcMint: PublicKey;
  poolAuthority: PublicKey;
}

async function fetchStandardPoolState(
  poolId: PublicKey,
  poolProgramId: PublicKey
): Promise<StandardPoolState> {
  logger.info('Fetching Standard AMM v4 pool state from chain', {
    poolId: poolId.toBase58(),
    poolProgramId: poolProgramId.toBase58(),
  });

  const poolAccountInfo = await connection.getAccountInfo(poolId);
  if (!poolAccountInfo) {
    throw new Error(`Pool account not found: ${poolId.toBase58()}`);
  }

  const data = poolAccountInfo.data;
  logger.debug('Pool account data', {
    dataLength: data.length,
    owner: poolAccountInfo.owner.toBase58(),
  });

  if (data.length < 600) {
    throw new Error(`Pool account data too short: ${data.length} bytes (expected at least 600). Pool may not be a Standard AMM v4 pool.`);
  }

  // Extract PublicKeys from pool account data
  // PublicKey is 32 bytes, so we read 32-byte chunks
  const readPublicKey = (offset: number, name: string): PublicKey => {
    if (offset + 32 > data.length) {
      throw new Error(`Cannot read ${name} at offset ${offset}: data length is ${data.length}`);
    }
    try {
      return new PublicKey(data.slice(offset, offset + 32));
    } catch (error) {
      throw new Error(`Invalid PublicKey for ${name} at offset ${offset}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Parse pool account structure
  // Standard AMM v4 pool account layout (approximate offsets - may vary):
  // - Offset 0-8: status
  // - Offset 8-16: nonce
  // - Offset 16-48: tokenProgramId
  // - Offset 48-80: tokenAVault
  // - Offset 80-112: tokenBVault
  // - Offset 112-144: poolCoinTokenAccount
  // - Offset 144-176: poolPcTokenAccount
  // - Offset 176-208: poolWithdrawQueue
  // - Offset 208-240: poolTempLpTokenAccount
  // - Offset 240-272: ammTargetOrders
  // - Offset 272-304: poolCoinMint
  // - Offset 304-336: poolPcMint
  // - Offset 336-368: serumMarket
  // - Offset 368-400: serumProgramId
  // - Offset 400-432: ammTargetOrders (duplicate)
  // - Offset 432-464: poolWithdrawQueue (duplicate)
  // - Offset 464-496: poolTempLpTokenAccount (duplicate)
  // - Offset 496-528: poolAuthority
  let poolCoinTokenAccount: PublicKey;
  let poolPcTokenAccount: PublicKey;
  let poolWithdrawQueue: PublicKey;
  let poolTempLpTokenAccount: PublicKey;
  let ammTargetOrders: PublicKey;
  let poolCoinMint: PublicKey;
  let poolPcMint: PublicKey;
  let serumMarket: PublicKey;
  let serumProgramId: PublicKey;
  let poolAuthority: PublicKey;

  try {
    poolCoinTokenAccount = readPublicKey(112, 'poolCoinTokenAccount');
    poolPcTokenAccount = readPublicKey(144, 'poolPcTokenAccount');
    poolWithdrawQueue = readPublicKey(176, 'poolWithdrawQueue');
    poolTempLpTokenAccount = readPublicKey(208, 'poolTempLpTokenAccount');
    ammTargetOrders = readPublicKey(240, 'ammTargetOrders');
    poolCoinMint = readPublicKey(272, 'poolCoinMint');
    poolPcMint = readPublicKey(304, 'poolPcMint');
    serumMarket = readPublicKey(336, 'serumMarket');
    serumProgramId = readPublicKey(368, 'serumProgramId');
    poolAuthority = readPublicKey(496, 'poolAuthority');
  } catch (error) {
    throw new Error(`Failed to parse pool account structure: ${error instanceof Error ? error.message : String(error)}. The pool may use a different account layout.`);
  }

  // Fetch Serum market account to get bids, asks, event queue, and vaults
  const serumMarketInfo = await connection.getAccountInfo(serumMarket);
  if (!serumMarketInfo) {
    throw new Error(`Serum market account not found: ${serumMarket.toBase58()}`);
  }

  const marketData = serumMarketInfo.data;
  if (marketData.length < 288) {
    throw new Error(`Serum market account data too short: ${marketData.length} bytes (expected at least 288)`);
  }

  // Serum market account structure (DEX v3):
  // - Offset 0-32: ownAddress
  // - Offset 32-40: vaultSignerNonce (u64, 8 bytes)
  // - Offset 40-72: baseMint
  // - Offset 72-104: quoteMint
  // - Offset 104-136: baseVault
  // - Offset 136-168: quoteVault
  // - Offset 168-200: bids
  // - Offset 200-232: asks
  // - Offset 232-264: eventQueue
  const vaultSignerNonce = marketData.readBigUInt64LE(32);
  const serumCoinVaultAccount = new PublicKey(marketData.slice(104, 136));
  const serumPcVaultAccount = new PublicKey(marketData.slice(136, 168));
  const serumBids = new PublicKey(marketData.slice(168, 200));
  const serumAsks = new PublicKey(marketData.slice(200, 232));
  const serumEventQueue = new PublicKey(marketData.slice(232, 264));

  // Calculate serumVaultSigner PDA
  // serumVaultSigner = PDA([serumMarket, vaultSignerNonce], serumProgramId)
  const vaultSignerNonceBuffer = Buffer.alloc(8);
  vaultSignerNonceBuffer.writeBigUInt64LE(vaultSignerNonce, 0);
  const [serumVaultSigner] = PublicKey.findProgramAddressSync(
    [serumMarket.toBuffer(), vaultSignerNonceBuffer],
    serumProgramId
  );

  logger.debug('Serum market accounts extracted', {
    serumMarket: serumMarket.toBase58(),
    serumBids: serumBids.toBase58(),
    serumAsks: serumAsks.toBase58(),
    serumEventQueue: serumEventQueue.toBase58(),
    serumVaultSigner: serumVaultSigner.toBase58(),
  });

  logger.info('Standard pool state extracted', {
    poolCoinTokenAccount: poolCoinTokenAccount.toBase58(),
    poolPcTokenAccount: poolPcTokenAccount.toBase58(),
    serumMarket: serumMarket.toBase58(),
    serumBids: serumBids.toBase58(),
    serumAsks: serumAsks.toBase58(),
  });

  return {
    ammTargetOrders,
    poolCoinTokenAccount,
    poolPcTokenAccount,
    poolWithdrawQueue,
    poolTempLpTokenAccount,
    serumProgramId,
    serumMarket,
    serumBids,
    serumAsks,
    serumEventQueue,
    serumCoinVaultAccount,
    serumPcVaultAccount,
    serumVaultSigner,
    poolCoinMint,
    poolPcMint,
    poolAuthority,
  };
}

/**
 * Create Raydium swap instruction for Standard AMM v4 pools
 * 
 * Standard pools use different program IDs depending on network:
 * - Devnet: Pool-specific program ID from API (e.g., DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb)
 * - Mainnet: Generic Raydium AMM v4 program ID (675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8)
 * 
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
 * Accounts for Standard AMM v4 swap (25 accounts total):
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
 * 19. serumCoinVaultAccount (not writable) - duplicate
 * 20. serumPcVaultAccount (not writable) - duplicate
 * 21. ammTargetOrders (not writable) - duplicate
 * 22. poolWithdrawQueue (not writable) - duplicate
 * 23. poolTempLpTokenAccount (not writable) - duplicate
 * 24. tokenProgramId - TOKEN_2022_PROGRAM_ID if source is Token-2022, else TOKEN_PROGRAM_ID
 */
async function createRaydiumStandardSwapInstruction(
  poolId: PublicKey,
  poolProgramId: PublicKey, // Pool-specific program ID for devnet, or AMM v4 ID for mainnet
  poolState: StandardPoolState,
  userSourceTokenAccount: PublicKey,
  userDestinationTokenAccount: PublicKey,
  amountIn: bigint,
  minimumAmountOut: bigint,
  userWallet: PublicKey,
  sourceTokenProgram: PublicKey // TOKEN_2022_PROGRAM_ID or TOKEN_PROGRAM_ID
): Promise<TransactionInstruction> {
  // Standard AMM v4 swap instruction discriminator: 9 (0x09)
  const SWAP_DISCRIMINATOR = 9;
  
  // Instruction layout: [1-byte discriminator][8-byte amountIn][8-byte minimumAmountOut] = 17 bytes total
  const instructionData = Buffer.alloc(17);
  instructionData.writeUInt8(SWAP_DISCRIMINATOR, 0);
  instructionData.writeBigUInt64LE(amountIn, 1);
  instructionData.writeBigUInt64LE(minimumAmountOut, 9);

  logger.info('Creating Standard AMM v4 swap instruction with full account list', {
    poolProgramId: poolProgramId.toBase58(),
    poolId: poolId.toBase58(),
    amountIn: amountIn.toString(),
    minimumAmountOut: minimumAmountOut.toString(),
    tokenProgramId: sourceTokenProgram.toBase58(),
    accountCount: 25,
    note: 'Standard pools require 25 accounts including Serum market accounts',
  });

  // Build complete account list (25 accounts as per Standard AMM v4 specification)
  return new TransactionInstruction({
    programId: poolProgramId,
    keys: [
      // 0-4: Pool accounts
      { pubkey: poolState.ammTargetOrders, isSigner: false, isWritable: true },
      { pubkey: poolState.poolCoinTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolState.poolPcTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolState.poolWithdrawQueue, isSigner: false, isWritable: true },
      { pubkey: poolState.poolTempLpTokenAccount, isSigner: false, isWritable: true },
      // 5-11: Serum market accounts
      { pubkey: poolState.serumProgramId, isSigner: false, isWritable: false },
      { pubkey: poolState.serumMarket, isSigner: false, isWritable: true },
      { pubkey: poolState.serumBids, isSigner: false, isWritable: true },
      { pubkey: poolState.serumAsks, isSigner: false, isWritable: true },
      { pubkey: poolState.serumEventQueue, isSigner: false, isWritable: true },
      { pubkey: poolState.serumCoinVaultAccount, isSigner: false, isWritable: true },
      { pubkey: poolState.serumPcVaultAccount, isSigner: false, isWritable: true },
      { pubkey: poolState.serumVaultSigner, isSigner: false, isWritable: false },
      // 13-15: User accounts
      { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userWallet, isSigner: true, isWritable: true },
      // 16-17: Mint accounts
      { pubkey: poolState.poolCoinMint, isSigner: false, isWritable: false },
      { pubkey: poolState.poolPcMint, isSigner: false, isWritable: false },
      // 18: Pool account
      { pubkey: poolId, isSigner: false, isWritable: true },
      // 19-23: Duplicate accounts (required by program)
      { pubkey: poolState.serumCoinVaultAccount, isSigner: false, isWritable: false },
      { pubkey: poolState.serumPcVaultAccount, isSigner: false, isWritable: false },
      { pubkey: poolState.ammTargetOrders, isSigner: false, isWritable: false },
      { pubkey: poolState.poolWithdrawQueue, isSigner: false, isWritable: false },
      { pubkey: poolState.poolTempLpTokenAccount, isSigner: false, isWritable: false },
      // 24: Token program
      { pubkey: sourceTokenProgram, isSigner: false, isWritable: false },
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
    
    // CRITICAL: Validate wallet is defined and has publicKey
    if (!rewardWallet) {
      throw new Error('Reward wallet is undefined');
    }
    
    if (!rewardWallet.publicKey) {
      throw new Error('Reward wallet missing publicKey');
    }
    
    const rewardWalletAddress = rewardWallet.publicKey;
    
    logger.debug('Reward wallet validated', {
      publicKey: rewardWalletAddress.toBase58(),
    });

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

    // Step 7: Derive user token accounts (NUKE ATA and WSOL ATA)
    // -------------------------------------------------------------------
    // CRITICAL: Raydium SDK does NOT auto-detect user token accounts.
    // It expects explicit Associated Token Accounts (ATAs) for:
    // - tokenAccountIn  = NUKE ATA  (source SPL token)
    // - tokenAccountOut = WSOL ATA  (destination wrapped SOL)
    // If either ATA is undefined, the SDK will build an instruction with an
    // undefined pubkey, and Solana will crash at compileMessage() with:
    // "Cannot read properties of undefined (reading 'toString')".
    // -------------------------------------------------------------------

    // Explicitly derive NUKE ATA (source token ATA)
    const nukeAta = getAssociatedTokenAddressSync(
      tokenMint,            // NUKE mint
      rewardWalletAddress,  // owner = reward wallet
      false,
      TOKEN_2022_PROGRAM_ID // NUKE is Token-2022
    );

    if (!nukeAta) {
      throw new Error('NUKE ATA (nukeAta) is undefined after derivation');
    }
    try {
      nukeAta.toString(); // Verify it's a valid PublicKey
    } catch (error) {
      throw new Error(`Invalid NUKE ATA (nukeAta) address: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Check NUKE balance in ATA
    let rewardNukeBalance = 0n;
    try {
      const rewardAccount = await getAccount(connection, nukeAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      rewardNukeBalance = rewardAccount.amount;
    } catch (error) {
      throw new Error(
        `Reward wallet NUKE ATA not found or has no balance: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (rewardNukeBalance < amountNuke) {
      throw new Error(
        `Insufficient NUKE balance. Required: ${amountNuke.toString()}, Available: ${rewardNukeBalance.toString()}`
      );
    }

    // Explicitly derive WSOL ATA (destination token ATA)
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,          // WSOL mint
      rewardWalletAddress,  // owner = reward wallet
      false,
      TOKEN_PROGRAM_ID      // WSOL is standard SPL Token
    );

    if (!wsolAta) {
      throw new Error('WSOL ATA (wsolAta) is undefined after derivation');
    }
    try {
      wsolAta.toString(); // Verify it's a valid PublicKey
    } catch (error) {
      throw new Error(`Invalid WSOL ATA (wsolAta) address: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Alias for readability in later code (unwrap logic, etc.)
    const userSolAccount = wsolAta;

    // Defensive guard: both ATAs MUST be resolved before calling Raydium SDK
    if (!nukeAta || !wsolAta) {
      throw new Error('User token accounts not resolved before Raydium swap (nukeAta or wsolAta undefined)');
    }

    logger.info('Raydium swap user accounts', {
      nukeAta: nukeAta.toBase58(),
      wsolAta: wsolAta.toBase58(),
      owner: rewardWalletAddress.toBase58(),
      nukeBalance: rewardNukeBalance.toString(),
    });

    // ===================================================================
    // CRITICAL: WSOL ATA MUST EXIST BEFORE CALLING RAYDIUM SDK
    // ===================================================================
    // When swapping SPL token → SOL, Raydium requires a WSOL (Wrapped SOL)
    // Associated Token Account (ATA) as the destination. If this account doesn't
    // exist, the SDK will create instructions referencing an undefined account,
    // causing "Cannot read properties of undefined (reading 'toString')" when
    // Solana tries to compile the transaction.
    //
    // SOLUTION: Check if WSOL ATA exists BEFORE calling SDK, and if missing,
    // add createAssociatedTokenAccountInstruction BEFORE SDK instructions.
    // ===================================================================
    
    // Step 8: Check WSOL ATA existence BEFORE building transaction
    // Use getAccount (SPL Token) instead of getAccountInfo for reliable token account checks
    let userSolAccountExists = false;
    try {
      await getAccount(connection, wsolAta, 'confirmed', TOKEN_PROGRAM_ID);
      userSolAccountExists = true;
      logger.info('WSOL ATA exists', { userSolAccount: wsolAta.toBase58() });
    } catch {
      // Account doesn't exist - we'll create it
      userSolAccountExists = false;
      logger.info('WSOL ATA missing - will create before swap', { 
        userSolAccount: wsolAta.toBase58() 
      });
    }

    // Verify source NUKE account exists (required for swap)
    let rewardNukeAccountExists = false;
    try {
      await getAccount(connection, nukeAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      rewardNukeAccountExists = true;
    } catch {
      // Account doesn't exist or error
    }

    if (!rewardNukeAccountExists) {
      throw new Error(`Reward NUKE ATA does not exist: ${nukeAta.toBase58()}`);
    }

    logger.info('Account existence checks (BEFORE SDK call)', {
      rewardNukeAccount: rewardNukeAccountExists ? 'exists' : 'missing',
      userSolAccount: userSolAccountExists ? 'exists' : 'missing (will create)',
      nukeAta: nukeAta.toBase58(),
      wsolAta: wsolAta.toBase58(),
      note: 'WSOL ATA must exist or be created BEFORE Raydium SDK instructions are added',
    });

    // Step 9: Build transaction
    const transaction = new Transaction();
    
    // Add compute budget instructions first (required for reliable execution)
    const computeBudgetInstructions = createComputeBudgetInstructions();
    for (const instruction of computeBudgetInstructions) {
      transaction.add(instruction);
    }
    
    // CRITICAL: Create WSOL ATA if missing - MUST be added BEFORE SDK instructions
    // This ensures the account exists when SDK instructions reference it
    if (!userSolAccountExists) {
      logger.info('Adding WSOL ATA creation instruction BEFORE SDK instructions', {
        userSolAccount: wsolAta.toBase58(),
        payer: rewardWalletAddress.toBase58(),
      });
      
      const createWSOLInstruction = createAssociatedTokenAccountInstruction(
        rewardWalletAddress, // payer
        wsolAta,             // ata
        rewardWalletAddress, // owner
        NATIVE_MINT,         // WSOL mint
        TOKEN_PROGRAM_ID     // SPL Token program
      );
      
      // Validate the instruction before adding
      if (!createWSOLInstruction.programId) {
        throw new Error('WSOL ATA creation instruction missing programId');
      }
      if (!createWSOLInstruction.keys || createWSOLInstruction.keys.length === 0) {
        throw new Error('WSOL ATA creation instruction missing keys');
      }
      
      // Validate all keys have valid pubkeys
      for (const key of createWSOLInstruction.keys) {
        if (!key || !key.pubkey) {
          throw new Error('WSOL ATA creation instruction has undefined account key');
        }
        try {
          key.pubkey.toString(); // Verify it's a valid PublicKey
        } catch (error) {
          throw new Error(`WSOL ATA creation instruction has invalid pubkey: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      transaction.add(createWSOLInstruction);
      logger.info('WSOL ATA creation instruction added to transaction', {
        instructionIndex: transaction.instructions.length - 1,
      });
    }

    // For non-Standard pools, verify pool vaults exist (Standard pools use SDK which handles this)
    if (poolInfo.poolType !== 'Standard') {
      let poolSourceVaultExists = false;
      let poolDestVaultExists = false;
      let poolAccountExists = false;

      try {
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
        const poolAccount = await connection.getAccountInfo(poolId);
        poolAccountExists = !!poolAccount;
      } catch {
        // Pool doesn't exist
      }

      if (!poolSourceVaultExists) {
        throw new Error(`Pool source vault does not exist: ${poolSourceVault.toBase58()}`);
      }
      if (!poolDestVaultExists) {
        throw new Error(`Pool destination vault does not exist: ${poolDestVault.toBase58()}`);
      }
      if (!poolAccountExists) {
        throw new Error(`Pool account does not exist: ${poolId.toBase58()}`);
      }
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

    // Use Raydium SDK for ALL pool types (Standard, CPMM, CLMM)
    // SDK automatically handles different pool types, vault accounts, and program IDs
    logger.info('Using Raydium SDK for swap (handles all pool types)', {
      network: NETWORK,
      poolId: poolId.toBase58(),
      poolType: poolInfo.poolType,
      poolProgramId: poolInfo.poolProgramId.toBase58(),
    });

    // Fetch pool info in SDK-compatible format
    const sdkPoolInfo = await fetchPoolInfoForSDK(poolId);

    // Use dynamic import for SDK to handle type issues
    logger.info('Creating swap transaction using Raydium SDK', {
      amountIn: amountNuke.toString(),
      slippageBps,
      minAmountOut: minDestAmount.toString(),
      poolType: sdkPoolInfo.type || poolInfo.poolType,
    });

    // Dynamically import SDK modules
    const { Liquidity, jsonInfo2PoolKeys } = await import('@raydium-io/raydium-sdk');
    
    // Map pool info properly - ONLY include required address fields (base58 addresses)
    // CRITICAL: SDK will try to parse ALL fields as PublicKeys, causing "invalid public key" errors
    // DO NOT include numeric metadata like openTime, feeRate, swap amounts, etc.
    // Only include: id, programId, authority, mintA, mintB, vaultA, vaultB, lpMint (all must be base58 addresses)
    // Following Chainstack article pattern: https://docs.chainstack.com/docs/solana-how-to-perform-token-swaps-using-the-raydium-sdk
    const sdkPoolKeysData: any = {
      id: sdkPoolInfo.id,
      programId: sdkPoolInfo.programId,
    };

    // CRITICAL: Add version field - SDK requires this for makeSwapInstruction
    // Version mapping: 4 = Standard AMM v4, 6 = CPMM, 7 = CLMM
    // Use version from API if available, otherwise infer from pool type
    if (sdkPoolInfo.version !== undefined) {
      sdkPoolKeysData.version = sdkPoolInfo.version;
    } else {
      // Infer version from pool type
      const poolTypeLower = (sdkPoolInfo.type || poolInfo.poolType || '').toLowerCase();
      if (poolTypeLower === 'cpmm') {
        sdkPoolKeysData.version = 6;
      } else if (poolTypeLower === 'clmm') {
        sdkPoolKeysData.version = 7;
      } else {
        // Default to Standard AMM v4 (version 4)
        sdkPoolKeysData.version = 4;
      }
      logger.info('Inferred pool version from pool type', {
        poolType: poolTypeLower,
        version: sdkPoolKeysData.version,
      });
    }

    // Only include addresses - extract from nested objects if needed
    if (sdkPoolInfo.mintA?.address) {
      sdkPoolKeysData.mintA = sdkPoolInfo.mintA.address; // Just the address string
    } else if (sdkPoolInfo.baseMint) {
      sdkPoolKeysData.mintA = sdkPoolInfo.baseMint;
    }

    if (sdkPoolInfo.mintB?.address) {
      sdkPoolKeysData.mintB = sdkPoolInfo.mintB.address; // Just the address string
    } else if (sdkPoolInfo.quoteMint) {
      sdkPoolKeysData.mintB = sdkPoolInfo.quoteMint;
    }

    // Vault addresses
    if (sdkPoolInfo.vault?.A) {
      sdkPoolKeysData.vaultA = sdkPoolInfo.vault.A;
    }
    if (sdkPoolInfo.vault?.B) {
      sdkPoolKeysData.vaultB = sdkPoolInfo.vault.B;
    }

    // LP mint - extract address if it's an object
    if (sdkPoolInfo.lpMint) {
      if (typeof sdkPoolInfo.lpMint === 'string') {
        sdkPoolKeysData.lpMint = sdkPoolInfo.lpMint;
      } else if (sdkPoolInfo.lpMint.address) {
        sdkPoolKeysData.lpMint = sdkPoolInfo.lpMint.address;
      }
    }

    // Authority (must be base58 address string)
    if (sdkPoolInfo.authority) {
      sdkPoolKeysData.authority = sdkPoolInfo.authority;
    }

    // CRITICAL: DO NOT include openTime, feeRate, or any numeric metadata
    // These are NOT public keys and will cause "invalid public key" errors
    // openTime is a numeric timestamp, NOT a base58 address

    // Remove any undefined/null values
    Object.keys(sdkPoolKeysData).forEach(key => {
      if (sdkPoolKeysData[key] === undefined || sdkPoolKeysData[key] === null) {
        delete sdkPoolKeysData[key];
      }
    });

    // Validate that all included fields are strings (base58 addresses) EXCEPT version
    // Version is a required numeric field for the SDK
    // This prevents numeric values from being passed to jsonInfo2PoolKeys() (except version)
    const numericFields = ['openTime', 'feeRate', 'tradeFeeRate', 'protocolFeeRate', 'mintAmountA', 'mintAmountB', 'tvl', 'volume', 'price'];
    const allowedNumericFields = ['version']; // Version is required by SDK
    for (const key of Object.keys(sdkPoolKeysData)) {
      if (numericFields.includes(key)) {
        logger.warn(`Removing numeric field ${key} from pool keys data (not a public key)`, {
          value: sdkPoolKeysData[key],
        });
        delete sdkPoolKeysData[key];
      } else if (typeof sdkPoolKeysData[key] !== 'string' && !allowedNumericFields.includes(key)) {
        logger.warn(`Removing non-string field ${key} from pool keys data (expected base58 address)`, {
          type: typeof sdkPoolKeysData[key],
          value: sdkPoolKeysData[key],
        });
        delete sdkPoolKeysData[key];
      }
    }

    logger.debug('Mapped pool info for SDK (base58 addresses + version field)', {
      includedFields: Object.keys(sdkPoolKeysData),
      version: sdkPoolKeysData.version,
      note: 'Included version field (required by SDK). Excluded openTime, feeRate, logoURI, symbol, price, tvl, volume, and other non-address fields',
    });
    
    // Convert to SDK pool keys
    // This includes base58 address strings and the version field (required by SDK)
    const poolKeys = jsonInfo2PoolKeys(sdkPoolKeysData);
    
    // Verify version is set after conversion
    if (!poolKeys.version) {
      throw new Error(`Pool keys missing version field after jsonInfo2PoolKeys conversion. Pool type: ${poolInfo.poolType}`);
    }

    logger.info('Pool keys extracted using SDK', {
      programId: poolKeys.programId.toBase58(),
      version: poolKeys.version,
      poolType: poolInfo.poolType,
      note: 'Version field is required by SDK for makeSwapInstruction',
    });

    // Use SDK's makeSwapInstructionSimple - Standard, CPMM, CLMM
    // SDK automatically handles vault accounts, program IDs, and instruction building.
    // We MUST pass explicit ATAs for tokenAccountIn/tokenAccountOut; SDK will not infer them.
    // NOTE: We intentionally cast the config to `any` to avoid tight coupling to SDK typings,
    // while still following the documented pattern from Chainstack.
    // Convert swap amounts to Decimal (SDK math expects Decimal/Number, not BN/bigint/string)
    const amountInDecimal = new Decimal(amountNuke.toString());
    const minAmountOutDecimal = new Decimal(minDestAmount.toString());

    if (!Decimal.isDecimal(amountInDecimal) || !Decimal.isDecimal(minAmountOutDecimal)) {
      throw new Error('Raydium swap amounts must be Decimal instances');
    }

    const swapConfigForSDK: any = {
      connection,
      poolKeys: poolKeys as any,
      userKeys: {
        tokenAccountIn: nukeAta,   // ✅ NUKE ATA (source SPL token)
        tokenAccountOut: wsolAta,  // ✅ WSOL ATA (destination wrapped SOL)
        owner: rewardWalletAddress,
      },
      amountIn: amountInDecimal,
      amountOut: minAmountOutDecimal,
      fixedSide: 'in',
    };

    const swapResult = await (Liquidity as any).makeSwapInstructionSimple(swapConfigForSDK);

    // CRITICAL: Raydium SDK returns innerTransactions (array) or innerTransaction (single)
    // Handle both cases to ensure we extract all instructions correctly
    let instructionsToAdd: TransactionInstruction[] = [];
    
    // Check for innerTransactions (plural - array of transactions)
    if ((swapResult as any).innerTransactions && Array.isArray((swapResult as any).innerTransactions)) {
      const innerTxs = (swapResult as any).innerTransactions;
      logger.info('SDK returned innerTransactions array', { count: innerTxs.length });
      
      for (const innerTx of innerTxs) {
        if (innerTx && innerTx.instructions && Array.isArray(innerTx.instructions)) {
          for (const instruction of innerTx.instructions) {
            if (instruction) {
              instructionsToAdd.push(instruction);
            }
          }
        }
      }
    }
    // Check for innerTransaction (singular - single transaction)
    else if ((swapResult as any).innerTransaction) {
      const innerTx = (swapResult as any).innerTransaction;
      logger.info('SDK returned innerTransaction (singular)');
      
      if (innerTx.instructions && Array.isArray(innerTx.instructions)) {
        for (const instruction of innerTx.instructions) {
          if (instruction) {
            instructionsToAdd.push(instruction);
          }
        }
      }
    }
    // Check for instructions directly on the result
    else if ((swapResult as any).instructions && Array.isArray((swapResult as any).instructions)) {
      logger.info('SDK returned instructions directly');
      instructionsToAdd = (swapResult as any).instructions.filter((ix: any) => ix !== null && ix !== undefined);
    }
    // Fallback: check if swapResult itself is an instruction
    else if (swapResult && typeof (swapResult as any).programId !== 'undefined' && (swapResult as any).keys) {
      logger.info('SDK returned single instruction');
      instructionsToAdd = [swapResult as unknown as TransactionInstruction];
    }

    if (instructionsToAdd.length === 0) {
      logger.error('SDK failed to generate swap instructions', {
        swapResultKeys: Object.keys(swapResult || {}),
        swapResultType: typeof swapResult,
      });
      throw new Error('SDK failed to generate swap instruction - no instructions found in result');
    }

    // Validate all instructions before adding
    for (let i = 0; i < instructionsToAdd.length; i++) {
      const instruction = instructionsToAdd[i];
      
      // Validate instruction structure
      if (!instruction.programId) {
        throw new Error(`Instruction ${i} missing programId`);
      }
      
      // Validate all account keys are defined
      if (!instruction.keys || !Array.isArray(instruction.keys)) {
        throw new Error(`Instruction ${i} missing or invalid keys array`);
      }
      
      for (let j = 0; j < instruction.keys.length; j++) {
        const accountMeta = instruction.keys[j];
        if (!accountMeta || !accountMeta.pubkey) {
          throw new Error(`Instruction ${i}, account ${j} has undefined pubkey`);
        }
        
        // Verify pubkey is a valid PublicKey (has toString method)
        try {
          const pubkeyStr = accountMeta.pubkey.toString();
          if (!pubkeyStr || pubkeyStr.length === 0) {
            throw new Error(`Instruction ${i}, account ${j} has invalid pubkey (empty string)`);
          }
        } catch (error) {
          throw new Error(`Instruction ${i}, account ${j} has invalid pubkey: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Add all validated instructions to transaction
    for (const instruction of instructionsToAdd) {
      transaction.add(instruction);
    }

    logger.info('Swap instructions created using SDK', {
      instructionCount: instructionsToAdd.length,
      poolType: poolInfo.poolType,
      note: 'SDK handles all pool types (Standard/CPMM/CLMM), account fetching, vault addresses, and instruction building automatically',
    });

    // ===================================================================
    // CRITICAL: Set transaction properties BEFORE simulation/signing
    // ===================================================================
    // Solana transactions REQUIRE recentBlockhash and feePayer to be set
    // before compileMessage() is called (which happens during sign() or
    // simulateTransaction()). If these are missing, compilation will fail.
    // ===================================================================
    
    // Step 10: Set transaction properties BEFORE simulation
    // CRITICAL: recentBlockhash and feePayer MUST be set before compileMessage/sign
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    // Validate feePayer is defined
    if (!rewardWalletAddress) {
      throw new Error('rewardWalletAddress is undefined - cannot set feePayer');
    }
    
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = rewardWalletAddress;

    // ===================================================================
    // CRITICAL: Validate ALL transaction fields before simulation
    // ===================================================================
    // This validation prevents "Cannot read properties of undefined (reading 'toString')"
    // errors by ensuring:
    // 1. recentBlockhash is set (required for transaction compilation)
    // 2. feePayer is set (required for transaction compilation)
    // 3. ALL instruction keys have valid pubkeys (prevents undefined.toString() errors)
    // ===================================================================
    
    if (!transaction.recentBlockhash) {
      throw new Error('Transaction missing recentBlockhash - cannot compile transaction');
    }
    
    if (!transaction.feePayer) {
      throw new Error('Transaction missing feePayer - cannot compile transaction');
    }
    
    // CRITICAL: Validate ALL instruction keys are defined and valid
    // This is the PRIMARY fix for "Cannot read properties of undefined (reading 'toString')"
    // Solana's compileMessage() iterates through all instruction keys and calls
    // pubkey.toString() on each. If any pubkey is undefined, this error occurs.
    const allInstructionKeys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
    for (let instIdx = 0; instIdx < transaction.instructions.length; instIdx++) {
      const instruction = transaction.instructions[instIdx];
      
      if (!instruction.keys || !Array.isArray(instruction.keys)) {
        throw new Error(`Instruction ${instIdx} missing keys array: ${instruction.programId?.toBase58() || 'unknown'}`);
      }
      
      for (let keyIdx = 0; keyIdx < instruction.keys.length; keyIdx++) {
        const key = instruction.keys[keyIdx];
        
        // CRITICAL: Check for undefined pubkey - this is what causes the error
        if (!key || !key.pubkey) {
          throw new Error(
            `Instruction ${instIdx}, account ${keyIdx} has undefined pubkey. ` +
            `This will cause "Cannot read properties of undefined (reading 'toString')" error. ` +
            `Program: ${instruction.programId?.toBase58() || 'unknown'}`
          );
        }
        
        // CRITICAL: Verify pubkey can be converted to string (has toString method)
        // This is what Solana does during compileMessage(), so we catch it here first
        try {
          const pubkeyStr = key.pubkey.toString();
          if (!pubkeyStr || pubkeyStr.length === 0) {
            throw new Error(`Instruction ${instIdx}, account ${keyIdx} has invalid pubkey (empty string)`);
          }
        } catch (error) {
          throw new Error(
            `Instruction ${instIdx}, account ${keyIdx} has invalid pubkey that cannot be converted to string. ` +
            `This will cause "Cannot read properties of undefined (reading 'toString')" error. ` +
            `Error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        
        allInstructionKeys.push(key);
      }
    }

    logger.info('Transaction validation before simulation - ALL CHECKS PASSED', {
      recentBlockhash: transaction.recentBlockhash,
      feePayer: transaction.feePayer.toBase58(),
      instructionCount: transaction.instructions.length,
      totalAccountKeys: allInstructionKeys.length,
      lastValidBlockHeight,
      note: 'All instruction keys validated - no undefined pubkeys found',
    });

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
    // CRITICAL: Validate transaction state before signing
    if (!transaction.recentBlockhash) {
      throw new Error('Cannot sign transaction: missing recentBlockhash');
    }
    
    if (!transaction.feePayer) {
      throw new Error('Cannot sign transaction: missing feePayer');
    }
    
    if (!rewardWallet || !rewardWallet.publicKey) {
      throw new Error('Cannot sign transaction: rewardWallet is invalid');
    }
    
    // Verify feePayer matches signer
    if (!transaction.feePayer.equals(rewardWallet.publicKey)) {
      logger.warn('feePayer does not match signer publicKey - this may cause issues', {
        feePayer: transaction.feePayer.toBase58(),
        signer: rewardWallet.publicKey.toBase58(),
      });
    }
    
    logger.info('Signing transaction', {
      feePayer: transaction.feePayer.toBase58(),
      signer: rewardWallet.publicKey.toBase58(),
      instructionCount: transaction.instructions.length,
      recentBlockhash: transaction.recentBlockhash,
    });
    
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

    // Step 12: Unwrap WSOL to native SOL if needed (for all swap types)
    // Check if we received WSOL and unwrap it to native SOL
    try {
      const userSolBalance = await getAccount(connection, userSolAccount, 'confirmed', TOKEN_PROGRAM_ID).catch(() => null);
      if (userSolBalance && userSolBalance.amount > 0n) {
        logger.info('Unwrapping WSOL to native SOL', {
          wsolAmount: userSolBalance.amount.toString(),
        });

        const unwrapTx = new Transaction();
        unwrapTx.add(
          createSyncNativeInstruction(userSolAccount),
          // Close WSOL account and send SOL to reward wallet
          new TransactionInstruction({
            programId: TOKEN_PROGRAM_ID,
            keys: [
              { pubkey: userSolAccount, isSigner: false, isWritable: true },
              { pubkey: rewardWalletAddress, isSigner: false, isWritable: true },
              { pubkey: rewardWalletAddress, isSigner: true, isWritable: false },
            ],
            data: Buffer.from([9]), // CloseAccount instruction discriminator
          })
        );

        const { blockhash: unwrapBlockhash } = await connection.getLatestBlockhash('confirmed');
        unwrapTx.recentBlockhash = unwrapBlockhash;
        unwrapTx.feePayer = rewardWalletAddress;
        unwrapTx.sign(rewardWallet);

        try {
          const unwrapSignature = await sendAndConfirmTransaction(
            connection,
            unwrapTx,
            [rewardWallet],
            { commitment: 'confirmed', maxRetries: 3 }
          );
          logger.info('WSOL unwrapped successfully', { signature: unwrapSignature });
        } catch (unwrapError) {
          logger.warn('Failed to unwrap WSOL, but swap succeeded', {
            error: unwrapError instanceof Error ? unwrapError.message : String(unwrapError),
            note: 'SOL is still available as WSOL in token account',
          });
        }
      }
    } catch (unwrapError) {
      logger.warn('Error checking/unwrapping WSOL', {
        error: unwrapError instanceof Error ? unwrapError.message : String(unwrapError),
      });
    }

    // Step 13: Verify SOL was received
    // Check both native SOL balance (after unwrap) and WSOL account balance
    let solReceived = 0n;
    try {
      const balance = await connection.getBalance(rewardWalletAddress, 'confirmed');
      solReceived = BigInt(balance);
    } catch {
      // Fallback to WSOL account balance
      const userSolBalance = await getAccount(connection, userSolAccount, 'confirmed', TOKEN_PROGRAM_ID).catch(() => null);
      solReceived = userSolBalance ? userSolBalance.amount : 0n;
    }

    logger.info('Raydium swap completed successfully', {
      signature,
      solReceived: solReceived.toString(),
      expectedSol: expectedDestAmount.toString(),
      poolType: poolInfo.poolType,
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
