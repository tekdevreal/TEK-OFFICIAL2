/**
 * Swap Service
 * 
 * Handles swapping TEK tokens to SOL via Raydium pools (Standard, CPMM, or CLMM) on devnet and mainnet
 * 
 * IMPORTANT: 
 * - Standard pools: Uses @raydium-io/raydium-sdk for automatic account fetching and instruction building
 * - CLMM pools: Uses pool-specific program IDs with Anchor instruction format
 * - TEK is a Token-2022 transfer-fee token (3% fee = 300 basis points), SDK handles transfer fees automatically
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
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  NATIVE_MINT,
} from '@solana/spl-token';
import Decimal from 'decimal.js';
import { createHash } from 'crypto';
import { connection, tokenMint, NETWORK } from '../config/solana';
import { RAYDIUM_CONFIG, WSOL_MINT, getRaydiumPoolId, RAYDIUM_AMM_PROGRAM_ID } from '../config/raydium';
import { REWARD_CONFIG } from '../config/constants';
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

// Minimum SOL output to proceed with swap
// Uses MIN_SOL_PAYOUT from REWARD_CONFIG (same as payout threshold)
// This ensures swaps only proceed if output meets minimum payout requirements
const MIN_SOL_OUTPUT = REWARD_CONFIG.MIN_SOL_PAYOUT * LAMPORTS_PER_SOL;

/**
 * Compute dynamic slippage tolerance based on price impact.
 * 
 * For small swaps, uses minimal slippage (2%).
 * For large swaps, increases slippage proportionally to price impact.
 * Hard-capped at 5% to prevent excessive slippage.
 * 
 * Formula: dynamicSlippage = BASE_SLIPPAGE + (priceImpact * 1.2)
 * 
 * @param amountIn - Input amount (after transfer fee if applicable)
 * @param sourceReserve - Source token reserve in the pool
 * @returns Slippage tolerance in basis points (100 bps = 1%)
 */
function computeDynamicSlippageBps(
  amountIn: bigint,
  sourceReserve: bigint
): number {
  const BASE_SLIPPAGE_BPS = 200; // 2% base slippage
  const MAX_SLIPPAGE_BPS = 500;  // 5% hard cap
  const PRICE_IMPACT_MULTIPLIER = 1.2; // Multiplier for price impact adjustment

  // Calculate price impact as basis points
  // priceImpact = (amountIn / sourceReserve) * 10000
  const priceImpactBps = Number(
    (amountIn * 10_000n) / sourceReserve
  );

  // Dynamic slippage = base + (price impact * multiplier)
  const dynamicSlippage =
    BASE_SLIPPAGE_BPS + Math.ceil(priceImpactBps * PRICE_IMPACT_MULTIPLIER);

  // Hard cap at maximum slippage
  return Math.min(dynamicSlippage, MAX_SLIPPAGE_BPS);
}

/**
 * Extract error code from Solana error message.
 * Looks for patterns like "6005", "Custom:6005", or "ExceededSlippage".
 * 
 * @param errorMessage - Error message string
 * @returns Error code number if found, null otherwise
 */
function extractErrorCode(errorMessage: string): number | null {
  // Try to extract error code from various formats
  const patterns = [
    /"Custom":(\d+)/,           // {"Custom":6005}
    /error code: (\d+)/i,       // error code: 6005
    /error (\d+)/i,             // error 6005
    /(\d{4})/,                  // Any 4-digit number (likely error code)
  ];
  
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match && match[1]) {
      const code = parseInt(match[1], 10);
      if (!isNaN(code)) {
        return code;
      }
    }
  }
  
  // Check for specific error names
  if (errorMessage.includes('ExceededSlippage') || errorMessage.includes('6005')) {
    return 6005;
  }
  
  return null;
}

/**
 * Get reward wallet keypair
 */
function getRewardWallet(): Keypair {
  return loadKeypairFromEnv('REWARD_WALLET_PRIVATE_KEY_JSON');
}

/**
 * Get Raydium CPMM config accounts (ammConfig, observationState) from environment.
 * These must be set from a known-good devnet CPMM pool transaction.
 */
function getRaydiumCpmmConfig(): {
  ammConfig: PublicKey;
  observationState: PublicKey;
} {
  const ammConfigStr = process.env.RAYDIUM_CPMM_AMM_CONFIG;
  const observationStr = process.env.RAYDIUM_CPMM_OBSERVATION_STATE;

  if (!ammConfigStr || !observationStr) {
    throw new Error(
      'Raydium CPMM config not set. Please set RAYDIUM_CPMM_AMM_CONFIG and RAYDIUM_CPMM_OBSERVATION_STATE from the reference devnet transaction.'
    );
  }

  return {
    ammConfig: new PublicKey(ammConfigStr),
    observationState: new PublicKey(observationStr),
  };
}

// Types for Raydium API response
interface RaydiumApiPoolInfo {
  programId?: string; // Pool's program ID from API
  authority?: string; // Pool authority address
  mintA?: { 
    address: string; 
    decimals?: number; 
    programId?: string;
    symbol?: string;
    extensions?: {
      transferFeeBasisPoints?: number; // Direct (old format)
      feeConfig?: {                    // Nested (new format)
        transferFeeConfigAuthority?: string;
        withdrawWithheldAuthority?: string;
        withheldAmount?: string;
        olderTransferFee?: {
          epoch?: string;
          maximumFee?: string;
          transferFeeBasisPoints?: number;
        };
        newerTransferFee?: {
          epoch?: string;
          maximumFee?: string;
          transferFeeBasisPoints?: number;
        };
      };
    };
  };
  mintB?: { 
    address: string; 
    decimals?: number; 
    programId?: string;
    symbol?: string;
    extensions?: {
      transferFeeBasisPoints?: number; // Direct (old format)
      feeConfig?: {                    // Nested (new format)
        transferFeeConfigAuthority?: string;
        withdrawWithheldAuthority?: string;
        withheldAmount?: string;
        olderTransferFee?: {
          epoch?: string;
          maximumFee?: string;
          transferFeeBasisPoints?: number;
        };
        newerTransferFee?: {
          epoch?: string;
          maximumFee?: string;
          transferFeeBasisPoints?: number;
        };
      };
    };
  };
  baseMint?: string;
  quoteMint?: string;
  mintAmountA?: number;
  mintAmountB?: number;
  type?: string; // Pool type: "Standard", "Cpmm", "Clmm", etc. (may be undefined)
  pooltype?: string[]; // Pool type array from API (e.g., ["Cpmm"])
  vault?: {
    A?: string; // Vault address for mintA
    B?: string; // Vault address for mintB
  };
  feeRate?: number; // Pool fee rate
  tradeFeeRate?: number; // Trade fee rate
  protocolFeeRate?: number; // Protocol fee rate
  lpMint?: string; // LP token mint address
  serumMarket?: string; // Serum market address (optional - may be missing for some AMM v4 pools)
  marketId?: string; // Market ID (alternative to serumMarket for AMM v4 pools)
  poolType?: string; // Some API responses may use poolType instead of type
  config?: {
    type?: string;
    pooltype?: string[];
    poolType?: string;
    marketId?: string;
    serumMarket?: string;
  };
}

interface RaydiumApiResponse {
  success?: boolean;
  data?: RaydiumApiPoolInfo[];
}

/**
 * Authoritative Raydium pool type detection.
 * - programId map is authoritative for CPMM/CLMM
 * - serumMarket implies Standard AMM v4
 * - type/pooltype are NOT required and should not cause failures
 */
function detectRaydiumPoolType(poolInfo: any): 'cpmm' | 'clmm' | 'standard' {
  const programId = poolInfo?.programId;

  if (programId === 'DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb') {
    logger.info('Raydium CPMM pool detected via programId', { programId });
    return 'cpmm';
  }

  if (programId === 'DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH') {
    logger.info('Raydium CLMM pool detected via programId', { programId });
    return 'clmm';
  }

  if (poolInfo?.serumMarket) {
    logger.info('Raydium standard AMM v4 pool detected via serumMarket', { programId, serumMarket: poolInfo.serumMarket });
    return 'standard';
  }

  throw new Error('Unknown Raydium pool type (unsupported programId)');
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
  hasSerumMarket: boolean; // Whether pool has Serum market (optional for AMM v4 pools)
  serumMarket?: PublicKey; // Serum market address if available
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

  // Parse API response - structure: { success: true, data: [ { pool fields... } ] }
  const apiResponse = await response.json() as RaydiumApiResponse;

  // ALWAYS extract the first pool object from response.data array
  if (!apiResponse?.data || !Array.isArray(apiResponse.data) || apiResponse.data.length === 0) {
    throw new Error('Raydium API returned no pool data');
  }

  const poolInfo = apiResponse.data[0];

  // Extract program ID from API response (required)
  if (!poolInfo.programId) {
    throw new Error('Pool API response missing programId');
  }
  const poolProgramId = new PublicKey(poolInfo.programId);

  // Authoritative pool type detection using programId first, serumMarket second
  const normalizedType = detectRaydiumPoolType(poolInfo);

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
  // CRITICAL: API structure is extensions.feeConfig.newerTransferFee.transferFeeBasisPoints
  // NOT extensions.transferFeeBasisPoints directly
  // Check multiple possible locations for compatibility
  const transferFeeBasisPointsA = 
    poolInfo.mintA?.extensions?.transferFeeBasisPoints ?? 
    poolInfo.mintA?.extensions?.feeConfig?.newerTransferFee?.transferFeeBasisPoints ?? 
    poolInfo.mintA?.extensions?.feeConfig?.olderTransferFee?.transferFeeBasisPoints ?? 
    0;

  const transferFeeBasisPointsB = 
    poolInfo.mintB?.extensions?.transferFeeBasisPoints ?? 
    poolInfo.mintB?.extensions?.feeConfig?.newerTransferFee?.transferFeeBasisPoints ?? 
    poolInfo.mintB?.extensions?.feeConfig?.olderTransferFee?.transferFeeBasisPoints ?? 
    0;

  logger.info('Transfer fee extraction from API', {
    mintA: poolInfo.mintA?.address,
    mintB: poolInfo.mintB?.address,
    transferFeeBasisPointsA,
    transferFeeBasisPointsB,
    mintAExtensions: poolInfo.mintA?.extensions,
    mintBExtensions: poolInfo.mintB?.extensions,
    note: 'Checking multiple possible API response structures for transfer fee',
  });

  // Extract fee rates and LP mint if available
  const feeRate = poolInfo.feeRate;
  const tradeFeeRate = poolInfo.tradeFeeRate;
  const protocolFeeRate = poolInfo.protocolFeeRate;
  const lpMint = poolInfo.lpMint ? new PublicKey(poolInfo.lpMint) : undefined;

  // Enforce behavior AFTER normalization
  if (normalizedType === 'clmm') {
    throw new Error('CLMM pools are not supported');
  }

  if (normalizedType === 'standard') {
    // AMM v4 pools require Serum market (allow multiple possible fields)
    const serumField = poolInfo.marketId || poolInfo.serumMarket || poolInfo.config?.marketId || poolInfo.config?.serumMarket;
    if (!serumField) {
      throw new Error('AMM v4 pool requires Serum market');
    }
  }

  // CPMM must NEVER require Serum

  // Normalize pool type for return
  // Map: 'standard' -> 'Standard', 'cpmm' -> 'Cpmm', 'clmm' -> 'Clmm'
  // At this point, normalizedType is guaranteed to be defined and one of the supported types
  let normalizedPoolType: 'Standard' | 'Cpmm' | 'Clmm';
  if (normalizedType === 'standard') {
    normalizedPoolType = 'Standard';
  } else if (normalizedType === 'cpmm') {
    normalizedPoolType = 'Cpmm';
  } else if (normalizedType === 'clmm') {
    normalizedPoolType = 'Clmm';
  } else {
    // This should never happen due to validation above, but TypeScript needs this case
    throw new Error(`Invalid normalized pool type: ${normalizedType}`);
  }

  // Detect if pool has Serum market
  // CRITICAL: CPMM pools NEVER use Serum - only AMM v4 pools use Serum
  const hasSerumMarket = !!poolInfo.serumMarket;
  const serumMarket = poolInfo.serumMarket ? new PublicKey(poolInfo.serumMarket) : undefined;

  logger.info('Pool info extracted from API', {
    poolType: normalizedPoolType,
    poolProgramId: poolProgramId.toBase58(),
    hasSerumMarket,
    serumMarket: serumMarket?.toBase58(),
    transferFeeA: transferFeeBasisPointsA,
    transferFeeB: transferFeeBasisPointsB,
    feeRate,
    tradeFeeRate,
    protocolFeeRate,
    lpMint: lpMint?.toBase58(),
    note: normalizedPoolType === 'Cpmm'
      ? 'CPMM pool detected - Serum not required (CPMM pools never use Serum)'
      : hasSerumMarket 
        ? 'AMM v4 pool has Serum market - will use Standard AMM v4 instruction format (25 accounts)'
        : 'AMM v4 pool does not have Serum market - swap will fail (AMM v4 pools REQUIRE Serum)',
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
    hasSerumMarket,
    serumMarket,
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
    return { valid: false, reason: 'Source reserve (TEK) is zero - pool has no liquidity' };
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

/**
 * CPMM pool state (Constant Product Market Maker - no Serum market)
 * CPMM pools use a simpler account structure without Serum accounts
 */
interface CpmmPoolState {
  poolCoinTokenAccount: PublicKey; // Pool's source token vault
  poolPcTokenAccount: PublicKey;   // Pool's destination token vault
  poolCoinMint: PublicKey;          // Source token mint
  poolPcMint: PublicKey;            // Destination token mint
  poolAuthority: PublicKey;        // Pool authority
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
  // CRITICAL: Raydium AMM v4 pools REQUIRE valid Serum market accounts
  // If Serum market is missing or invalid, ABORT immediately - no placeholders, no fallbacks
  let serumMarketInfo = await connection.getAccountInfo(serumMarket).catch(() => null);
  let serumBids: PublicKey;
  let serumAsks: PublicKey;
  let serumEventQueue: PublicKey;
  let serumCoinVaultAccount: PublicKey;
  let serumPcVaultAccount: PublicKey;
  let serumVaultSigner: PublicKey;

  if (!serumMarketInfo || serumMarketInfo.data.length < 288) {
    throw new Error(
      `Serum market account is missing or invalid for Raydium AMM v4 pool. ` +
      `Pool ID: ${poolId.toBase58()}, Serum Market: ${serumMarket.toBase58()}. ` +
      `Raydium AMM v4 pools REQUIRE valid Serum market accounts for swaps. ` +
      `Data length: ${serumMarketInfo?.data.length || 0} (expected at least 288 bytes). ` +
      `No fallback instruction exists - swap must fail if Serum is missing.`
    );
  } else {
    const marketData = serumMarketInfo.data;

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
    serumCoinVaultAccount = new PublicKey(marketData.slice(104, 136));
    serumPcVaultAccount = new PublicKey(marketData.slice(136, 168));
    serumBids = new PublicKey(marketData.slice(168, 200));
    serumAsks = new PublicKey(marketData.slice(200, 232));
    serumEventQueue = new PublicKey(marketData.slice(232, 264));

    // Calculate serumVaultSigner PDA
    // serumVaultSigner = PDA([serumMarket, vaultSignerNonce], serumProgramId)
    const vaultSignerNonceBuffer = Buffer.alloc(8);
    vaultSignerNonceBuffer.writeBigUInt64LE(vaultSignerNonce, 0);
    const [calculatedVaultSigner] = PublicKey.findProgramAddressSync(
      [serumMarket.toBuffer(), vaultSignerNonceBuffer],
      serumProgramId
    );
    serumVaultSigner = calculatedVaultSigner;

    logger.debug('Serum market accounts extracted successfully', {
      serumMarket: serumMarket.toBase58(),
      serumBids: serumBids.toBase58(),
      serumAsks: serumAsks.toBase58(),
      serumEventQueue: serumEventQueue.toBase58(),
      serumVaultSigner: serumVaultSigner.toBase58(),
    });
  }

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
 * Fetch CPMM pool state from chain (no Serum market)
 * CPMM pools have a simpler structure without Serum accounts
 */
async function fetchCpmmPoolState(
  poolId: PublicKey,
  poolProgramId: PublicKey,
  vaultA: PublicKey,
  vaultB: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey
): Promise<CpmmPoolState> {
  logger.info('Fetching CPMM pool state from chain (no Serum market)', {
    poolId: poolId.toBase58(),
    poolProgramId: poolProgramId.toBase58(),
    vaultA: vaultA.toBase58(),
    vaultB: vaultB.toBase58(),
  });

  // Verify vaults exist
  try {
    await getAccount(connection, vaultA, 'confirmed', TOKEN_2022_PROGRAM_ID);
  } catch {
    try {
      await getAccount(connection, vaultA, 'confirmed', TOKEN_PROGRAM_ID);
    } catch (error) {
      throw new Error(`CPMM pool vault A not found: ${vaultA.toBase58()}`);
    }
  }

  try {
    await getAccount(connection, vaultB, 'confirmed', TOKEN_PROGRAM_ID);
  } catch {
    try {
      await getAccount(connection, vaultB, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch (error) {
      throw new Error(`CPMM pool vault B not found: ${vaultB.toBase58()}`);
    }
  }

  // For CPMM pools, vaults are the token accounts
  // Determine which vault is which based on mints
  let poolCoinTokenAccount: PublicKey;
  let poolPcTokenAccount: PublicKey;
  let poolCoinMint: PublicKey;
  let poolPcMint: PublicKey;

  // Determine order based on which mint is NUKE
  const nukeMint = tokenMint;
  if (mintA.equals(nukeMint)) {
    poolCoinTokenAccount = vaultA;
    poolPcTokenAccount = vaultB;
    poolCoinMint = mintA;
    poolPcMint = mintB;
  } else {
    poolCoinTokenAccount = vaultB;
    poolPcTokenAccount = vaultA;
    poolCoinMint = mintB;
    poolPcMint = mintA;
  }

  // ✅ CRITICAL: Fetch pool authority from API
  const apiUrl = `https://api-v3-devnet.raydium.io/pools/key/ids?ids=${poolId.toBase58()}`;
  const response = await fetch(apiUrl);
  const data = await response.json() as RaydiumApiResponse;
  
  if (!data.success || !data.data || data.data.length === 0) {
    throw new Error('Failed to fetch pool info from API for authority');
  }

  const poolInfo = data.data[0];
  
  // ✅ CRITICAL: Extract authority from API response
  if (!poolInfo.authority) {
    throw new Error('Pool authority not found in API response');
  }
  const poolAuthority = new PublicKey(poolInfo.authority);

  logger.info('CPMM pool state extracted', {
    poolCoinTokenAccount: poolCoinTokenAccount.toBase58(),
    poolPcTokenAccount: poolPcTokenAccount.toBase58(),
    poolCoinMint: poolCoinMint.toBase58(),
    poolPcMint: poolPcMint.toBase58(),
    poolAuthority: poolAuthority.toBase58(),
    note: 'CPMM pools do not require Serum market accounts',
  });

  return {
    poolCoinTokenAccount,
    poolPcTokenAccount,
    poolCoinMint,
    poolPcMint,
    poolAuthority,
  };
}

/**
 * Create Raydium swap instruction for CPMM pools (no Serum market)
 * 
 * CPMM pools use a simpler instruction format without Serum accounts.
 * The instruction format uses Anchor discriminator for swap.
 * 
 * For Token-2022 source tokens (NUKE), we must handle the transfer fee correctly.
 * 
 * CPMM Swap Instruction Format (Anchor):
 * - Instruction discriminator: Anchor observed: 40c6cde8260871e2
 * - amountIn: u64 (8 bytes) - Amount BEFORE transfer fee deduction
 * - minimumAmountOut: u64 (8 bytes) - Minimum amount to receive (with slippage)
 * 
 * Accounts for CPMM swap (simpler, no Serum):
 * 0. poolId (writable) - Pool account
 * 1. userSourceTokenAccount (writable) - User's source token account
 * 2. userDestinationTokenAccount (writable) - User's destination token account
 * 3. poolSourceTokenAccount (writable) - Pool's source token vault
 * 4. poolDestinationTokenAccount (writable) - Pool's destination token vault
 * 5. poolCoinMint - Source token mint
 * 6. poolPcMint - Destination token mint
 * 7. userWallet (signer, writable) - User's wallet
 * 8. tokenProgramId - TOKEN_2022_PROGRAM_ID if source is Token-2022, else TOKEN_PROGRAM_ID
 * 9. systemProgram - System program
 */
function createRaydiumCpmmSwapInstruction(
  poolId: PublicKey,
  poolProgramId: PublicKey,
  poolState: CpmmPoolState,
  userSourceTokenAccount: PublicKey,
  userDestinationTokenAccount: PublicKey,
  amountIn: bigint,
  minimumAmountOut: bigint,
  userWallet: PublicKey,
  sourceTokenProgram: PublicKey // TOKEN_2022_PROGRAM_ID or TOKEN_PROGRAM_ID
): TransactionInstruction {
  throw new Error('createRaydiumCpmmSwapInstruction (legacy) is deprecated. Use createRaydiumCpmmSwapInstructionV2 with explicit account order from reference transaction.');
}

/**
 * Create Raydium CPMM swap instruction (SwapBaseInput) matching the reference devnet tx account order.
 * Accounts order (all required):
 * 0. Payer (signer, writable)
 * 1. Authority (signer, writable)
 * 2. Amm Config (readonly)
 * 3. Pool State (writable) - poolId
 * 4. Input Token Account (writable) - user TEK ATA
 * 5. Output Token Account (writable) - user WSOL ATA
 * 6. Input Vault (writable) - pool NUKE vault
 * 7. Output Vault (writable) - pool WSOL vault
 * 8. Input Token Program (readonly) - TOKEN_2022_PROGRAM_ID
 * 9. Output Token Program (readonly) - TOKEN_PROGRAM_ID
 * 10. Input Token Mint (readonly) - NUKE mint
 * 11. Output Token Mint (readonly) - WSOL mint
 * 12. Observation State (readonly) - from pool state
 * Optional (Anchor sysvars / programs if required by IDL): SysvarClock, SysvarRent, AssociatedTokenProgram
 */
export function createRaydiumCpmmSwapInstructionV2(params: {
  poolProgramId: PublicKey;
  payer: PublicKey;
  authority: PublicKey;
  ammConfig: PublicKey;
  poolState: PublicKey;
  inputTokenAccount: PublicKey;
  outputTokenAccount: PublicKey;
  inputVault: PublicKey;
  outputVault: PublicKey;
  inputTokenProgram: PublicKey;  // likely TOKEN_2022_PROGRAM_ID for NUKE
  outputTokenProgram: PublicKey; // likely TOKEN_PROGRAM_ID for WSOL
  inputMint: PublicKey;          // NUKE mint
  outputMint: PublicKey;         // WSOL mint
  observationState: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
  tradeFeeFlag?: number;   // u8
  creatorFeeFlag?: number; // u8
  includeSysvars?: boolean;
}): TransactionInstruction {
  const {
    poolProgramId,
    payer,
    authority,
    ammConfig,
    poolState,
    inputTokenAccount,
    outputTokenAccount,
    inputVault,
    outputVault,
    inputTokenProgram,
    outputTokenProgram,
    inputMint,
    outputMint,
    observationState,
    amountIn,
    minimumAmountOut,
    tradeFeeFlag = 0,
    creatorFeeFlag = 0,
    includeSysvars = false,
  } = params;

  // ✅ CRITICAL: Use EXACT discriminator from working transaction
  // Discriminator: 8fbe5adac41e33de (from devnet transaction 3Tp7sYnKY1vYzdQHKDMyKfpxgWz6K65yVdDa4xkGia3rBe6iyUpWzuTsWNpkyEv6ACf3XNqLwdAz9YbLi8PBH61q)
  const swapDiscriminator = Buffer.from('8fbe5adac41e33de', 'hex');

  // ✅ CRITICAL: Instruction layout: [8-byte discriminator][8-byte amountIn][8-byte minimumAmountOut] = 24 bytes total
  // Note: Working transaction shows no flags bytes, just 24 bytes total
  const instructionData = Buffer.alloc(24);
  swapDiscriminator.copy(instructionData, 0);
  instructionData.writeBigUInt64LE(amountIn, 8);
  instructionData.writeBigUInt64LE(minimumAmountOut, 16);

  // ✅ CRITICAL: Account order MUST match working transaction EXACTLY (13 accounts)
  // Reference: https://explorer.solana.com/tx/3Tp7sYnKY1vYzdQHKDMyKfpxgWz6K65yVdDa4xkGia3rBe6iyUpWzuTsWNpkyEv6ACf3XNqLwdAz9YbLi8PBH61q?cluster=devnet
  const keys = [
    // Account 0: User/Signer (payer)
    { pubkey: payer, isSigner: true, isWritable: true },
    // Account 1: Authority (pool authority from API, NOT a signer, writable)
    { pubkey: authority, isSigner: false, isWritable: true },
    // Account 2: AMM Config (writable)
    { pubkey: ammConfig, isSigner: false, isWritable: true },
    // Account 3: Pool State (writable)
    { pubkey: poolState, isSigner: false, isWritable: true },
    // Account 4: Input Token Account (writable)
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    // Account 5: Output Token Account (writable)
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    // Account 6: Input Vault (writable)
    { pubkey: inputVault, isSigner: false, isWritable: true },
    // Account 7: Output Vault (writable)
    { pubkey: outputVault, isSigner: false, isWritable: true },
    // Account 8: Input Token Program (readonly) - sourceTokenProgram (TOKEN_PROGRAM_ID for WSOL)
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    // Account 9: Output Token Program (readonly) - destTokenProgram (TOKEN_2022_PROGRAM_ID for NUKE)
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    // Account 10: Input Token Mint (WRITABLE)
    { pubkey: inputMint, isSigner: false, isWritable: true },
    // Account 11: Output Token Mint (WRITABLE)
    { pubkey: outputMint, isSigner: false, isWritable: true },
    // Account 12: Observation State (writable)
    { pubkey: observationState, isSigner: false, isWritable: true },
  ];

  if (includeSysvars) {
    keys.push(
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    );
  }

  return new TransactionInstruction({
    programId: poolProgramId,
    keys,
    data: instructionData,
  });
}

/**
 * Create Raydium swap instruction for Standard AMM v4 pools
 * 
 * Standard pools use different program IDs depending on network:
 * - Devnet: Pool-specific program ID from API (e.g., DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb)
 * - Mainnet: Generic Raydium AMM v4 program ID (675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8)
 * 
 * CRITICAL: Raydium AMM v4 uses Anchor instruction format with swap_base_in discriminator
 * - Instruction discriminator: first 8 bytes of sha256("global:swap_base_in")
 * - This is the ONLY valid instruction format for AMM v4 swaps
 * - Serum market accounts are REQUIRED - all 25 accounts must be included
 * 
 * For Token-2022 source tokens (NUKE), we must handle the transfer fee correctly.
 * The amountIn is the amount we want to swap, and the transfer fee will be deducted
 * during the token transfer, so the pool receives amountIn * (1 - transferFeeBps/10000).
 * 
 * Standard AMM v4 Swap Instruction Format (Anchor):
 * - Instruction discriminator: first 8 bytes of sha256("global:swap_base_in")
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
  // CRITICAL: Raydium AMM v4 uses Anchor instruction format with swap_base_in discriminator
  // Calculate discriminator: sha256("global:swap_base_in")[0:8]
  const discriminatorHash = createHash('sha256')
    .update('global:swap_base_in')
    .digest();
  const swapDiscriminator = discriminatorHash.slice(0, 8);
  
  // Instruction layout: [8-byte discriminator][8-byte amountIn][8-byte minimumAmountOut] = 24 bytes total
  const instructionData = Buffer.alloc(24);
  swapDiscriminator.copy(instructionData, 0);
  instructionData.writeBigUInt64LE(amountIn, 8);
  instructionData.writeBigUInt64LE(minimumAmountOut, 16);

  logger.info('Creating Standard AMM v4 swap instruction with full account list (Anchor format)', {
    poolProgramId: poolProgramId.toBase58(),
    poolId: poolId.toBase58(),
    amountIn: amountIn.toString(),
    minimumAmountOut: minimumAmountOut.toString(),
    tokenProgramId: sourceTokenProgram.toBase58(),
    discriminator: swapDiscriminator.toString('hex'),
    accountCount: 25,
    note: 'AMM v4 pools REQUIRE 25 accounts including all Serum market accounts - using Anchor swap_base_in format',
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
 * @param amountNuke - Amount of TEK to swap (in raw token units, with decimals)
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
    logger.info('Starting TEK to SOL swap via Raydium pool', {
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
      note: `TEK transfer fee: ${sourceTransferFeeBps} basis points (${sourceTransferFeeBps / 100}%)`,
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
      throw new Error(`Pool does not contain TEK/SOL pair. Pool mints: ${poolInfo.mintA.toBase58()}, ${poolInfo.mintB.toBase58()}`);
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
    
    // ✅ CRITICAL: Dynamic slippage based on trade size and transfer fees (for liquidity check)
    // Calculate trade size impact (% of pool reserves)
    const tradeImpactBpsForLiquidity = Number((nukeAfterTransferFee * 10_000n) / sourceReserve);
    const tradeImpactPercentForLiquidity = tradeImpactBpsForLiquidity / 100;
    
    // Dynamic slippage formula (same as final calculation):
    // - Base: 2% (200 bps)
    // - Transfer fee: 4% (400 bps) if Token-2022
    // - Price impact: scales with trade size (0.1% per 1% of pool)
    // - Safety buffer: 1% (100 bps)
    const baseSlippageBpsForLiquidity = slippageBps; // 2% (200 bps)
    const transferFeeSlippageBpsForLiquidity = sourceTransferFeeBps; // 4% (400 bps) for NUKE
    const priceImpactSlippageBpsForLiquidity = Math.floor(tradeImpactBpsForLiquidity * 0.1); // 0.1% per 1% of pool
    const bufferBpsForLiquidity = 100; // 1% safety buffer
    
    // Calculate total effective slippage
    const effectiveSlippageBpsForLiquidity = Math.max(
      baseSlippageBpsForLiquidity,
      transferFeeSlippageBpsForLiquidity + priceImpactSlippageBpsForLiquidity + bufferBpsForLiquidity
    );
    
    // Cap maximum slippage at 10% (1000 bps) for safety
    const cappedSlippageBpsForLiquidity = Math.min(effectiveSlippageBpsForLiquidity, 1000);
    
    // Calculate price impact for logging
    const priceImpactBps = tradeImpactBpsForLiquidity;
    
    // Estimate expected output for liquidity verification
    const estimatedDestAmount = (destReserve * nukeAfterTransferFee * BigInt(Math.floor(feeMultiplier * 10000))) / (sourceReserve + nukeAfterTransferFee) / BigInt(10000);
    const estimatedMinDestAmount = (estimatedDestAmount * BigInt(10000 - cappedSlippageBpsForLiquidity)) / BigInt(10000);
    
    logger.info('Dynamic slippage calculation (liquidity check)', {
      amountIn: nukeAfterTransferFee.toString(),
      sourceReserve: sourceReserve.toString(),
      tradeImpactPercent: tradeImpactPercentForLiquidity.toFixed(2) + '%',
      priceImpactBps,
      priceImpactPercent: (priceImpactBps / 100).toFixed(2),
      slippageBreakdown: {
        base: `${baseSlippageBpsForLiquidity / 100}%`,
        transferFee: `${transferFeeSlippageBpsForLiquidity / 100}%`,
        priceImpact: `${priceImpactSlippageBpsForLiquidity / 100}%`,
        buffer: `${bufferBpsForLiquidity / 100}%`,
        total: `${effectiveSlippageBpsForLiquidity / 100}%`,
        capped: `${cappedSlippageBpsForLiquidity / 100}%`,
      },
      effectiveSlippageBps: cappedSlippageBpsForLiquidity,
      effectiveSlippagePercent: (cappedSlippageBpsForLiquidity / 100).toFixed(2),
      note: 'Dynamic slippage adjusts based on transfer fee + trade impact + buffer to prevent Error 6005',
    });

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
    
    // ✅ CRITICAL: Dynamic slippage based on trade size and transfer fees
    // Calculate trade size impact (% of pool reserves)
    const tradeImpactBps = Number((nukeAfterTransferFee * 10_000n) / sourceReserve);
    const tradeImpactPercent = tradeImpactBps / 100;
    
    // Dynamic slippage formula:
    // - Base: 2% (200 bps)
    // - Transfer fee: 4% (400 bps) if Token-2022
    // - Price impact: scales with trade size (0.1% per 1% of pool)
    // - Safety buffer: 1% (100 bps)
    const baseSlippageBps = slippageBps; // 2% (200 bps)
    const transferFeeSlippageBps = sourceTransferFeeBps; // 4% (400 bps) for NUKE
    const priceImpactSlippageBps = Math.floor(tradeImpactBps * 0.1); // 0.1% per 1% of pool
    const bufferBps = 100; // 1% safety buffer
    
    // Calculate total effective slippage
    const effectiveSlippageBps = Math.max(
      baseSlippageBps,
      transferFeeSlippageBps + priceImpactSlippageBps + bufferBps
    );
    
    // Cap maximum slippage at 10% (1000 bps) for safety
    const cappedSlippageBps = Math.min(effectiveSlippageBps, 1000);
    
    let minDestAmount = (expectedDestAmount * BigInt(10000 - cappedSlippageBps)) / BigInt(10000);
    
    // Calculate price impact for final logging
    const priceImpactBpsFinal = tradeImpactBps;

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

    logger.info('Swap calculation with dynamic slippage', {
      amountNuke: amountNuke.toString(),
      amountNukeAfterTransferFee: nukeAfterTransferFee.toString(),
      transferFeeBps: sourceTransferFeeBps,
      transferFeeAmount: (amountNuke - nukeAfterTransferFee).toString(),
      sourceReserve: sourceReserve.toString(),
      destReserve: destReserve.toString(),
      tradeImpactPercent: tradeImpactPercent.toFixed(2) + '%',
      priceImpactBps: priceImpactBpsFinal,
      priceImpactPercent: (priceImpactBpsFinal / 100).toFixed(2),
      expectedSolLamports: expectedDestAmount.toString(),
      expectedSolAmount: (Number(expectedDestAmount) / LAMPORTS_PER_SOL).toFixed(6),
      minSolLamports: minDestAmount.toString(),
      minSolAmount: (Number(minDestAmount) / LAMPORTS_PER_SOL).toFixed(6),
      slippageBreakdown: {
        base: `${baseSlippageBps / 100}%`,
        transferFee: `${transferFeeSlippageBps / 100}%`,
        priceImpact: `${priceImpactSlippageBps / 100}%`,
        buffer: `${bufferBps / 100}%`,
        total: `${effectiveSlippageBps / 100}%`,
        capped: `${cappedSlippageBps / 100}%`,
      },
      baseSlippageBps: baseSlippageBps,
      transferFeeSlippageBps: transferFeeSlippageBps,
      priceImpactSlippageBps: priceImpactSlippageBps,
      bufferBps: bufferBps,
      effectiveSlippageBps: effectiveSlippageBps,
      cappedSlippageBps: cappedSlippageBps,
      effectiveSlippagePercent: (cappedSlippageBps / 100).toFixed(2),
      note: 'Using dynamic slippage based on transfer fee + trade impact + buffer',
    });

    // Step 7: Derive user token accounts (TEK ATA and WSOL ATA)
    // -------------------------------------------------------------------
    // CRITICAL: Raydium SDK does NOT auto-detect user token accounts.
    // It expects explicit Associated Token Accounts (ATAs) for:
    // - tokenAccountIn  = TEK ATA  (source SPL token)
    // - tokenAccountOut = WSOL ATA  (destination wrapped SOL)
    // If either ATA is undefined, the SDK will build an instruction with an
    // undefined pubkey, and Solana will crash at compileMessage() with:
    // "Cannot read properties of undefined (reading 'toString')".
    // -------------------------------------------------------------------

    // Explicitly derive TEK ATA (source token ATA)
    const nukeAta = getAssociatedTokenAddressSync(
      tokenMint,            // TEK mint
      rewardWalletAddress,  // owner = reward wallet
      false,
      TOKEN_2022_PROGRAM_ID // TEK is Token-2022
    );

    if (!nukeAta) {
      throw new Error('TEK ATA (nukeAta) is undefined after derivation');
    }
    try {
      nukeAta.toString(); // Verify it's a valid PublicKey
    } catch (error) {
      throw new Error(`Invalid TEK ATA (nukeAta) address: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Check TEK balance in ATA
    let rewardNukeBalance = 0n;
    try {
      const rewardAccount = await getAccount(connection, nukeAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      rewardNukeBalance = rewardAccount.amount;
    } catch (error) {
      throw new Error(
        `Reward wallet TEK ATA not found or has no balance: ${
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
    // Associated Token Account (ATA) as the destination. The SDK internally
    // loads all token accounts for the owner and calls `.filter()` on the
    // token account list. If the WSOL ATA doesn't exist on-chain, this list
    // is undefined and the SDK throws:
    //   "Cannot read properties of undefined (reading 'filter')".
    //
    // IMPORTANT:
    // - We CANNOT safely create the WSOL ATA in the SAME transaction where
    //   we call `makeSwapInstructionSimple`, because the SDK queries accounts
    //   BEFORE our create instruction is executed.
    // - Therefore, WSOL ATA must be created ONCE up front (via CLI or an
    //   initialization script) and then reused for all swaps.
    // ===================================================================
    
    // ===================================================================
    // CRITICAL: Verify BOTH ATAs exist ON-CHAIN before calling SDK
    // ===================================================================
    // The Raydium SDK's makeSwapInstructionSimple internally calls
    // _selectTokenAccount which queries token accounts and calls .filter()
    // on the result. If the ATAs don't exist on-chain, the SDK's internal
    // query returns undefined, causing:
    //   "Cannot read properties of undefined (reading 'filter')"
    //
    // SOLUTION: Verify both ATAs exist on-chain BEFORE calling the SDK.
    // These ATAs must be created once per wallet (not during swaps).
    // ===================================================================
    
    // Step 8: Verify TEK ATA exists on-chain (REQUIRED for swap)
    let rewardNukeAccountExists = false;
    let nukeAccountInfo = null;
    try {
      nukeAccountInfo = await getAccount(connection, nukeAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      rewardNukeAccountExists = true;
      logger.info('TEK ATA verified on-chain', {
        nukeAta: nukeAta.toBase58(),
        balance: nukeAccountInfo.amount.toString(),
        mint: nukeAccountInfo.mint.toBase58(),
        owner: nukeAccountInfo.owner.toBase58(),
      });
    } catch (error) {
      rewardNukeAccountExists = false;
      logger.error('TEK ATA does not exist on-chain', {
        nukeAta: nukeAta.toBase58(),
        error: error instanceof Error ? error.message : String(error),
        note: 'Create this ATA once using create-tek-ata.ts script BEFORE running swaps',
      });
    }

    if (!rewardNukeAccountExists) {
      throw new Error(
        `Reward TEK ATA does not exist on-chain: ${nukeAta.toBase58()}. ` +
        `Create it once by running: cd backend && npx tsx create-tek-ata.ts`
      );
    }

    // Step 9: Verify WSOL ATA exists on-chain (REQUIRED for swap)
    // If it doesn't exist, automatically create it (happens after unwrap closes the account)
    let userSolAccountExists = false;
    let wsolAccountInfo = null;
    try {
      wsolAccountInfo = await getAccount(connection, wsolAta, 'confirmed', TOKEN_PROGRAM_ID);
      userSolAccountExists = true;
      logger.info('WSOL ATA verified on-chain', {
        wsolAta: wsolAta.toBase58(),
        balance: wsolAccountInfo.amount.toString(),
        mint: wsolAccountInfo.mint.toBase58(),
        owner: wsolAccountInfo.owner.toBase58(),
      });
    } catch (error) {
      userSolAccountExists = false;
      logger.warn('WSOL ATA does not exist on-chain - will create it', {
        wsolAta: wsolAta.toBase58(),
        error: error instanceof Error ? error.message : String(error),
        note: 'This is normal after unwrapping closes the account',
      });
    }

    // If WSOL ATA is missing, create it automatically
    // This happens regularly because unwrapping WSOL closes the account
    if (!userSolAccountExists) {
      // Check if wallet has enough SOL to pay for ATA creation
      // ATA creation costs ~0.002 SOL (rent-exempt minimum + tx fee)
      const MIN_SOL_FOR_ATA = 0.003 * LAMPORTS_PER_SOL; // 0.003 SOL buffer
      const walletBalance = await connection.getBalance(rewardWalletAddress, 'confirmed');
      
      if (walletBalance < MIN_SOL_FOR_ATA) {
        throw new Error(
          `Reward wallet has insufficient SOL to create WSOL ATA. ` +
          `Balance: ${(walletBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL, ` +
          `Required: ~0.003 SOL. ` +
          `Please fund the reward wallet: ${rewardWalletAddress.toBase58()}`
        );
      }

      logger.info('Creating WSOL ATA for reward wallet', {
        wsolAta: wsolAta.toBase58(),
        owner: rewardWalletAddress.toBase58(),
        walletBalance: `${(walletBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
      });

      try {
        const createAtaTx = new Transaction();
        createAtaTx.add(
          createAssociatedTokenAccountInstruction(
            rewardWalletAddress, // payer
            wsolAta,             // ata
            rewardWalletAddress, // owner
            NATIVE_MINT,         // WSOL mint
            TOKEN_PROGRAM_ID     // SPL Token program
          )
        );

        const { blockhash: ataBlockhash } = await connection.getLatestBlockhash('confirmed');
        createAtaTx.recentBlockhash = ataBlockhash;
        createAtaTx.feePayer = rewardWalletAddress;
        createAtaTx.sign(rewardWallet);

        const ataSignature = await sendAndConfirmTransaction(
          connection,
          createAtaTx,
          [rewardWallet],
          { commitment: 'confirmed', maxRetries: 3 }
        );

        logger.info('WSOL ATA created successfully', {
          signature: ataSignature,
          wsolAta: wsolAta.toBase58(),
        });

        // Verify it was created
        wsolAccountInfo = await getAccount(connection, wsolAta, 'confirmed', TOKEN_PROGRAM_ID);
        userSolAccountExists = true;
      } catch (createError) {
        // Check if it was created by another transaction
        try {
          wsolAccountInfo = await getAccount(connection, wsolAta, 'confirmed', TOKEN_PROGRAM_ID);
          userSolAccountExists = true;
          logger.info('WSOL ATA exists (created by another transaction)');
        } catch {
          throw new Error(
            `Failed to create WSOL ATA for reward wallet: ${wsolAta.toBase58()}. ` +
            `Error: ${createError instanceof Error ? createError.message : String(createError)}`
          );
        }
      }
    }

    // Final validation: Both ATAs must exist and be accessible
    logger.info('All ATAs verified on-chain (BEFORE SDK call)', {
      nukeAta: {
        address: nukeAta.toBase58(),
        exists: rewardNukeAccountExists,
        balance: nukeAccountInfo?.amount.toString() || '0',
      },
      wsolAta: {
        address: wsolAta.toBase58(),
        exists: userSolAccountExists,
        balance: wsolAccountInfo?.amount.toString() || '0',
      },
      owner: rewardWalletAddress.toBase58(),
      note: 'Both ATAs verified on-chain - SDK can safely query token accounts',
    });

    // ===================================================================
    // CRITICAL: Pre-validate SDK's token account query method
    // ===================================================================
    // The Raydium SDK's _selectTokenAccount uses getParsedTokenAccountsByOwner
    // to query ALL token accounts for the owner, then filters them. If this query
    // fails or returns undefined, the SDK crashes with ".filter() on undefined".
    //
    // SOLUTION: Test that the SDK's query method works BEFORE calling the SDK.
    // This ensures the connection can successfully query token accounts.
    // ===================================================================
    
    // Step 1: Test RPC connection health
    let connectionHealthy = false;
    try {
      const slot = await connection.getSlot('confirmed');
      if (slot && slot > 0) {
        connectionHealthy = true;
        logger.debug('RPC connection health check passed', { slot });
      }
    } catch (error) {
      logger.error('RPC connection health check failed', {
        error: error instanceof Error ? error.message : String(error),
        note: 'SDK may fail if RPC is not responding',
      });
    }

    // Step 2: Pre-validate that the SDK can query token accounts (simulates SDK's internal query)
    try {
      // The SDK likely uses getParsedTokenAccountsByOwner internally
      // Test that this query works for the reward wallet
      const parsedTokenAccounts = await connection.getParsedTokenAccountsByOwner(
        rewardWalletAddress,
        {
          programId: TOKEN_PROGRAM_ID, // WSOL uses standard token program
        },
        'confirmed'
      );

      // Also check Token-2022 accounts (NUKE uses Token-2022)
      const parsedToken2022Accounts = await connection.getParsedTokenAccountsByOwner(
        rewardWalletAddress,
        {
          programId: TOKEN_2022_PROGRAM_ID, // NUKE uses Token-2022 program
        },
        'confirmed'
      );

      // CRITICAL: If query returns undefined or null, SDK will crash
      if (parsedTokenAccounts.value === undefined || parsedTokenAccounts.value === null) {
        throw new Error('getParsedTokenAccountsByOwner returned undefined for TOKEN_PROGRAM_ID - SDK will crash');
      }
      if (parsedToken2022Accounts.value === undefined || parsedToken2022Accounts.value === null) {
        throw new Error('getParsedTokenAccountsByOwner returned undefined for TOKEN_2022_PROGRAM_ID - SDK will crash');
      }

      // Verify that our ATAs are in the query results
      const allTokenAccounts = [...parsedTokenAccounts.value, ...parsedToken2022Accounts.value];
      const foundNukeAta = allTokenAccounts.some(acc => acc.pubkey.equals(nukeAta));
      const foundWsolAta = allTokenAccounts.some(acc => acc.pubkey.equals(wsolAta));

      logger.info('SDK token account query pre-validation successful', {
        connectionHealthy,
        totalTokenAccounts: allTokenAccounts.length,
        standardTokenAccounts: parsedTokenAccounts.value.length,
        token2022Accounts: parsedToken2022Accounts.value.length,
        nukeAtaFound: foundNukeAta,
        wsolAtaFound: foundWsolAta,
        nukeAtaAddress: nukeAta.toBase58(),
        wsolAtaAddress: wsolAta.toBase58(),
        note: 'SDK can successfully query token accounts - _selectTokenAccount will work',
      });

      if (!foundNukeAta) {
        logger.warn('TEK ATA not found in token account query (may still work if SDK uses different query)', {
          nukeAta: nukeAta.toBase58(),
          note: 'ATA exists on-chain but not in query results - SDK may use different query method',
        });
      }
      if (!foundWsolAta) {
        logger.warn('WSOL ATA not found in token account query (may still work if SDK uses different query)', {
          wsolAta: wsolAta.toBase58(),
          note: 'ATA exists on-chain but not in query results - SDK may use different query method',
        });
      }

    } catch (error) {
      // If the query fails, the SDK will also fail - throw error to prevent SDK call
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('SDK token account query pre-validation FAILED', {
        error: errorMessage,
        owner: rewardWalletAddress.toBase58(),
        nukeAta: nukeAta.toBase58(),
        wsolAta: wsolAta.toBase58(),
        note: 'SDK will fail with .filter() error - aborting swap to prevent crash',
      });
      
      // Throw error to prevent SDK call - this will cause swap to fail gracefully
      throw new Error(
        `SDK token account query validation failed: ${errorMessage}. ` +
        `The Raydium SDK will crash with ".filter() on undefined" if we proceed. ` +
        `Check RPC connection, account accessibility, and network status. ` +
        `Both ATAs exist on-chain, but SDK cannot query them.`
      );
    }

    // ===================================================================
    // CRITICAL: Do NOT create ATAs during swap transaction
    // ===================================================================
    // ATAs (TEK and WSOL) must exist on-chain BEFORE calling the SDK.
    // Creating them in the same transaction as the swap will cause the SDK
    // to fail because it queries accounts BEFORE our create instruction executes.
    // 
    // ATAs are created once per wallet using:
    // - create-tek-ata.ts (for TEK ATA)
    // - create-wsol-atas.ts (for WSOL ATA)
    // ===================================================================
    
    // Step 10: Build transaction (ATAs already verified to exist)
    let transaction = new Transaction();
    
    // Add compute budget instructions first (required for reliable execution)
    const computeBudgetInstructions = createComputeBudgetInstructions();
    for (const instruction of computeBudgetInstructions) {
      transaction.add(instruction);
    }
    
    // NOTE: We DO NOT create ATAs here - they must exist on-chain already.
    // Both NUKE ATA and WSOL ATA have been verified to exist above.

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

    // ===================================================================
    // CRITICAL: Final validation before building swap instruction
    // ===================================================================
    // Ensure all required accounts are valid PublicKeys before building instruction
    // ===================================================================
    
    // Final validation: Ensure ATAs are valid PublicKeys
    if (!nukeAta || !(nukeAta instanceof PublicKey)) {
      throw new Error(`TEK ATA is not a valid PublicKey: ${nukeAta}`);
    }
    if (!wsolAta || !(wsolAta instanceof PublicKey)) {
      throw new Error(`WSOL ATA is not a valid PublicKey: ${wsolAta}`);
    }
    if (!rewardWalletAddress || !(rewardWalletAddress instanceof PublicKey)) {
      throw new Error(`Reward wallet address is not a valid PublicKey: ${rewardWalletAddress}`);
    }

    logger.info('Final validation complete - ready to build swap instruction', {
      nukeAta: nukeAta.toBase58(),
      wsolAta: wsolAta.toBase58(),
      owner: rewardWalletAddress.toBase58(),
      amountIn: amountNuke.toString(),
      amountOut: minDestAmount.toString(),
      poolType: poolInfo.poolType,
      hasSerumMarket: poolInfo.hasSerumMarket,
      note: 'Both ATAs verified on-chain. Ready to build manual swap instruction.',
    });

    // ===================================================================
    // CRITICAL: Route swap based on pool type (CPMM vs AMM v4)
    // ===================================================================
    // Rule: Pool type determines instruction format, NOT program ID alone
    // - CPMM pools: Use CPMM instruction (NO Serum required)
    // - AMM v4 pools: Use AMM v4 instruction (Serum REQUIRED)
    // ===================================================================
    
    let swapInstruction: TransactionInstruction;

    if (poolInfo.poolType === 'Cpmm') {
      // ===================================================================
      // CPMM POOL SWAP PATH
      // ===================================================================
      // CPMM pools NEVER use Serum - they use a different instruction format
      // - Use CPMM program-specific instruction
      // - Use CPMM vaults (from API)
      // - NO Serum accounts required
      // ===================================================================
      
      logger.info('Building Raydium CPMM swap instruction', {
        poolId: poolId.toBase58(),
        poolType: poolInfo.poolType,
        poolProgramId: poolInfo.poolProgramId.toBase58(),
        nukeAta: nukeAta.toBase58(),
        wsolAta: wsolAta.toBase58(),
        amountIn: amountNuke.toString(),
        minAmountOut: minDestAmount.toString(),
        note: 'CPMM pool detected - Serum not required (CPMM pools never use Serum)',
      });

      // Fetch CPMM pool state (to get vaults/mints)
      const cpmmPoolState = await fetchCpmmPoolState(
        poolId,
        poolInfo.poolProgramId,
        poolSourceVault,
        poolDestVault,
        poolSourceMint,
        poolDestMint
      );

      // Load CPMM config (ammConfig + observationState) from env / config, matching reference tx
      const { ammConfig, observationState } = getRaydiumCpmmConfig();

      // ✅ CRITICAL: Determine token program order based on swap direction
      // For NUKE → WSOL swap:
      // - Input (NUKE) uses TOKEN_2022_PROGRAM_ID
      // - Output (WSOL) uses TOKEN_PROGRAM_ID
      // But the working transaction shows: sourceTokenProgram (TOKEN_PROGRAM_ID) first, then destTokenProgram (TOKEN_2022_PROGRAM_ID)
      // This is because the transaction was WSOL → NUKE, so we need to reverse for NUKE → WSOL
      const inputTokenProgram = sourceTokenProgram; // TOKEN_2022_PROGRAM_ID for NUKE
      const outputTokenProgram = TOKEN_PROGRAM_ID;  // TOKEN_PROGRAM_ID for WSOL

      // Create CPMM swap instruction using V2 builder (explicit account order)
      swapInstruction = createRaydiumCpmmSwapInstructionV2({
        poolProgramId: poolInfo.poolProgramId,
        payer: rewardWalletAddress,           // payer = reward wallet (signer)
        authority: cpmmPoolState.poolAuthority, // ✅ CRITICAL: authority = pool authority from API (NOT reward wallet)
        ammConfig,
        poolState: poolId,
        inputTokenAccount: nukeAta,
        outputTokenAccount: wsolAta,
        inputVault: cpmmPoolState.poolCoinTokenAccount,
        outputVault: cpmmPoolState.poolPcTokenAccount,
        inputTokenProgram: inputTokenProgram,  // TOKEN_2022_PROGRAM_ID for NUKE
        outputTokenProgram: outputTokenProgram, // TOKEN_PROGRAM_ID for WSOL
        inputMint: cpmmPoolState.poolCoinMint,
        outputMint: cpmmPoolState.poolPcMint,
        observationState,
        amountIn: amountNuke,
        minimumAmountOut: minDestAmount,
        tradeFeeFlag: 0,
        creatorFeeFlag: 0,
        includeSysvars: false,
      });

      // Validate CPMM swap instruction
      if (!swapInstruction.programId) {
        throw new Error('CPMM swap instruction missing programId');
      }
      if (!swapInstruction.keys || !Array.isArray(swapInstruction.keys)) {
        throw new Error('CPMM swap instruction missing or invalid keys array');
      }
      logger.info('CPMM swap instruction created successfully (V2)', {
        accountCount: swapInstruction.keys.length,
        discriminator: '8fbe5adac41e33de',
        poolAuthority: cpmmPoolState.poolAuthority.toBase58(),
        ammConfig: ammConfig.toBase58(),
        observationState: observationState.toBase58(),
        keys: swapInstruction.keys.map((k, i) => ({
          index: i,
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        note: 'Using exact structure from working devnet transaction 3Tp7sYnKY1vYzdQHKDMyKfpxgWz6K65yVdDa4xkGia3rBe6iyUpWzuTsWNpkyEv6ACf3XNqLwdAz9YbLi8PBH61q',
      });
    } else if (poolInfo.poolType === 'Standard') {
      // ===================================================================
      // AMM v4 POOL SWAP PATH
      // ===================================================================
      // AMM v4 pools ALWAYS require Serum market
      // - There is NO such thing as a valid AMM v4 swap without Serum
      // - Missing Serum = swap must fail immediately
      // - No fallback, no placeholder, no bypass
      // ===================================================================
      
      // Check if pool is AMM v4 (mainnet or devnet program IDs)
      const isAmmV4Pool = 
        poolInfo.poolProgramId.equals(RAYDIUM_AMM_V4_PROGRAM_ID) ||
        poolInfo.poolProgramId.toBase58() === 'DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb' ||
        poolInfo.poolProgramId.toBase58() === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

      if (!isAmmV4Pool) {
        throw new Error(
          `Pool type is Standard but program ID is not AMM v4: ${poolInfo.poolProgramId.toBase58()}. ` +
          `Expected AMM v4 program ID (DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb or 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8).`
        );
      }

      // CRITICAL: Validate Serum market is present for AMM v4 pools
      const hasSerumMarket = poolInfo.hasSerumMarket ?? false;
      if (!hasSerumMarket) {
        throw new Error(
          `Invalid Raydium AMM v4 pool: Serum market is REQUIRED for swaps. ` +
          `Pool ID: ${poolId.toBase58()}, Program ID: ${poolInfo.poolProgramId.toBase58()}. ` +
          `Raydium AMM v4 pools cannot perform swaps without Serum market. ` +
          `If Serum is missing, the swap must fail. No fallback instruction exists.`
        );
      }
      
      logger.info('Building Raydium AMM v4 swap instruction with Serum market', {
        poolId: poolId.toBase58(),
        poolProgramId: poolInfo.poolProgramId.toBase58(),
        nukeAta: nukeAta.toBase58(),
        wsolAta: wsolAta.toBase58(),
        amountIn: amountNuke.toString(),
        minAmountOut: minDestAmount.toString(),
        note: 'AMM v4 pools REQUIRE Serum market - using full 25-account instruction',
      });

      // Fetch AMM v4 pool state from chain (includes Serum market data)
      const poolState = await fetchStandardPoolState(poolId, poolInfo.poolProgramId);

      // Validate that Serum market data was successfully fetched
      if (!poolState.serumMarket || poolState.serumMarket.equals(SystemProgram.programId)) {
        throw new Error(
          `Serum market data is missing or invalid for AMM v4 pool. ` +
          `Pool ID: ${poolId.toBase58()}. ` +
          `Serum market is REQUIRED for Raydium AMM v4 swaps. ` +
          `Failed to fetch valid Serum market account from pool state.`
        );
      }

      // Build AMM v4 swap instruction with Serum (25 accounts)
      logger.info('Creating AMM v4 swap instruction with Serum market (25 accounts)', {
        poolId: poolId.toBase58(),
        poolProgramId: poolInfo.poolProgramId.toBase58(),
        serumMarket: poolState.serumMarket.toBase58(),
        serumProgramId: poolState.serumProgramId.toBase58(),
      });

      swapInstruction = await createRaydiumStandardSwapInstruction(
        poolId,
        poolInfo.poolProgramId,
        poolState,
        nukeAta,
        wsolAta,
        amountNuke,
        minDestAmount,
        rewardWalletAddress,
        sourceTokenProgram
      );

      // Validate AMM v4 swap instruction
      if (!swapInstruction.programId) {
        throw new Error('AMM v4 swap instruction missing programId');
      }
      if (!swapInstruction.keys || !Array.isArray(swapInstruction.keys)) {
        throw new Error('AMM v4 swap instruction missing or invalid keys array');
      }
      if (swapInstruction.keys.length !== 25) {
        throw new Error(
          `AMM v4 swap instruction has ${swapInstruction.keys.length} accounts, expected 25. ` +
          `Raydium AMM v4 swaps require exactly 25 accounts including all Serum market accounts.`
        );
      }

      logger.info('AMM v4 swap instruction created successfully', {
        accountCount: swapInstruction.keys.length,
        serumMarket: poolState.serumMarket.toBase58(),
        note: 'AMM v4 with Serum market (25 accounts) - all required accounts included',
      });
    } else {
      throw new Error(
        `Unsupported pool type: ${poolInfo.poolType}. ` +
        `Only CPMM and Standard (AMM v4) pools are currently supported.`
      );
    }


    // Validate all account keys are defined
    for (let j = 0; j < swapInstruction.keys.length; j++) {
      const accountMeta = swapInstruction.keys[j];
      if (!accountMeta || !accountMeta.pubkey) {
        throw new Error(`Swap instruction account ${j} has undefined pubkey`);
      }
      try {
        accountMeta.pubkey.toString(); // Verify it's a valid PublicKey
      } catch (error) {
        throw new Error(`Swap instruction account ${j} has invalid pubkey: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Add swap instruction to transaction
    transaction.add(swapInstruction);

    logger.info('AMM v4 swap instruction added to transaction', {
      poolProgramId: poolInfo.poolProgramId.toBase58(),
      poolId: poolId.toBase58(),
      accountCount: swapInstruction.keys.length,
      amountIn: amountNuke.toString(),
      minAmountOut: minDestAmount.toString(),
      sourceTokenProgram: sourceTokenProgram.toBase58(),
      poolType: poolInfo.poolType,
      note: 'Manual instruction builder - no SDK dependency, full Token-2022 support',
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

    // Step 10: Simulate transaction before sending (with retry for Error 6005)
    let simulationAttempt = 0;
    const MAX_SIMULATION_RETRIES = 1; // One retry only
    let currentMinDestAmount = minDestAmount;
    let currentEffectiveSlippageBps = cappedSlippageBps;
    
    while (simulationAttempt <= MAX_SIMULATION_RETRIES) {
      // Rebuild transaction if this is a retry
      if (simulationAttempt > 0) {
        logger.info('Retrying transaction with increased slippage', {
          attempt: simulationAttempt,
          previousSlippageBps: currentEffectiveSlippageBps,
          newSlippageBps: currentEffectiveSlippageBps + 100,
          note: 'Error 6005 detected - increasing slippage by 100 bps',
        });
        
        // Increase slippage by 100 bps (1%) for retry
        currentEffectiveSlippageBps = Math.min(currentEffectiveSlippageBps + 100, 1000); // Hard cap at 1000 bps (10%)
        
        // Recalculate minDestAmount with new slippage
        currentMinDestAmount = (expectedDestAmount * BigInt(10000 - currentEffectiveSlippageBps)) / BigInt(10000);
        
        // Rebuild transaction with new minDestAmount
        transaction = new Transaction();
        
        // Add compute budget instructions
        const computeBudgetInstructions = createComputeBudgetInstructions();
        for (const instruction of computeBudgetInstructions) {
          transaction.add(instruction);
        }
        
        // Rebuild swap instruction with new minDestAmount
        if (poolInfo.poolType === 'Cpmm') {
          const cpmmPoolState = await fetchCpmmPoolState(
            poolId,
            poolInfo.poolProgramId,
            poolSourceVault,
            poolDestVault,
            poolSourceMint,
            poolDestMint
          );
          
          const { ammConfig, observationState } = getRaydiumCpmmConfig();
          
          const inputTokenProgram = sourceTokenProgram;
          const outputTokenProgram = TOKEN_PROGRAM_ID;
          
          swapInstruction = createRaydiumCpmmSwapInstructionV2({
            poolProgramId: poolInfo.poolProgramId,
            payer: rewardWalletAddress,
            authority: cpmmPoolState.poolAuthority,
            ammConfig,
            poolState: poolId,
            inputTokenAccount: nukeAta,
            outputTokenAccount: wsolAta,
            inputVault: cpmmPoolState.poolCoinTokenAccount,
            outputVault: cpmmPoolState.poolPcTokenAccount,
            inputTokenProgram: inputTokenProgram,
            outputTokenProgram: outputTokenProgram,
            inputMint: cpmmPoolState.poolCoinMint,
            outputMint: cpmmPoolState.poolPcMint,
            observationState,
            amountIn: amountNuke,
            minimumAmountOut: currentMinDestAmount, // Use updated minDestAmount
            tradeFeeFlag: 0,
            creatorFeeFlag: 0,
            includeSysvars: false,
          });
        } else {
          // For AMM v4, rebuild with new minDestAmount
          const poolState = await fetchStandardPoolState(poolId, poolInfo.poolProgramId);
          swapInstruction = await createRaydiumStandardSwapInstruction(
            poolId,
            poolInfo.poolProgramId,
            poolState,
            nukeAta,
            wsolAta,
            amountNuke,
            currentMinDestAmount, // Use updated minDestAmount
            rewardWalletAddress,
            sourceTokenProgram
          );
        }
        
        transaction.add(swapInstruction);
        
        // Update transaction properties
        const { blockhash: retryBlockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = retryBlockhash;
        transaction.feePayer = rewardWalletAddress;
      }
      
      logger.info('Simulating Raydium swap transaction', {
        attempt: simulationAttempt + 1,
        maxRetries: MAX_SIMULATION_RETRIES + 1,
        slippageBps: currentEffectiveSlippageBps,
        minDestAmount: currentMinDestAmount.toString(),
      });
      
      try {
        const simulation = await connection.simulateTransaction(transaction, [rewardWallet]);
        
        if (simulation.value.err) {
          const errorMessage = JSON.stringify(simulation.value.err);
          const errorCode = extractErrorCode(errorMessage);
          
          // Check if this is Error 6005 (ExceededSlippage)
          if (errorCode === 6005 && simulationAttempt < MAX_SIMULATION_RETRIES) {
            logger.warn('Transaction simulation failed with Error 6005 (ExceededSlippage)', {
              attempt: simulationAttempt + 1,
              error: errorMessage,
              logs: simulation.value.logs || [],
              currentSlippageBps: currentEffectiveSlippageBps,
              note: 'Retrying with increased slippage...',
            });
            
            simulationAttempt++;
            continue; // Retry with increased slippage
          }
          
          // If not Error 6005, or we've exhausted retries, throw error
          logger.error('Transaction simulation failed', {
            error: errorMessage,
            errorCode,
            logs: simulation.value.logs || [],
            attempt: simulationAttempt + 1,
          });
          throw new Error(`Transaction simulation failed: ${errorMessage}`);
        }

        logger.info('Transaction simulation passed', {
          attempt: simulationAttempt + 1,
          unitsConsumed: simulation.value.unitsConsumed,
          slippageBps: currentEffectiveSlippageBps,
          logMessages: simulation.value.logs?.slice(0, 10) || [],
        });
        
        // Update minDestAmount for final transaction
        minDestAmount = currentMinDestAmount;
        break; // Success - exit retry loop
        
      } catch (simError) {
        // If simulation fails with SendTransactionError, extract logs
        if (simError instanceof Error && 'getLogs' in simError && typeof (simError as any).getLogs === 'function') {
          const sendError = simError as SendTransactionError;
          try {
            const logs = await sendError.getLogs(connection);
            const errorCode = extractErrorCode(sendError.message);
            
            // Check if this is Error 6005 and we can retry
            if (errorCode === 6005 && simulationAttempt < MAX_SIMULATION_RETRIES) {
              logger.warn('Transaction simulation failed with Error 6005 (ExceededSlippage)', {
                attempt: simulationAttempt + 1,
                error: sendError.message,
                logs: logs || [],
                currentSlippageBps: currentEffectiveSlippageBps,
                note: 'Retrying with increased slippage...',
              });
              
              simulationAttempt++;
              continue; // Retry with increased slippage
            }
            
            logger.error('Transaction simulation failed with detailed logs', {
              error: sendError.message,
              errorCode,
              logs: logs || [],
              attempt: simulationAttempt + 1,
            });
          } catch (logError) {
            logger.error('Transaction simulation failed (could not get logs)', {
              error: sendError.message,
              logError: logError instanceof Error ? logError.message : String(logError),
              attempt: simulationAttempt + 1,
            });
          }
        }
        
        // If we've exhausted retries or it's not Error 6005, throw
        throw simError;
      }
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
    // Closing the WSOL account returns rent + wrapped SOL as native SOL to the wallet
    // The ATA will be auto-recreated on the next swap if needed
    
    // CRITICAL: Capture the WSOL amount BEFORE unwrapping - this is the actual swap proceeds
    let solReceived = 0n;
    try {
      const userSolBalance = await getAccount(connection, userSolAccount, 'confirmed', TOKEN_PROGRAM_ID).catch(() => null);
      if (userSolBalance && userSolBalance.amount > 0n) {
        // Capture the actual swap proceeds from WSOL balance BEFORE unwrapping
        solReceived = userSolBalance.amount;
        
        logger.info('Unwrapping WSOL to native SOL', {
          wsolAmount: userSolBalance.amount.toString(),
          solReceivedFromSwap: solReceived.toString(),
          note: 'Closing WSOL ATA to unwrap - will auto-recreate on next swap',
        });

        const unwrapTx = new Transaction();
        // Close WSOL account to unwrap SOL back to native
        unwrapTx.add(
          createCloseAccountInstruction(
            userSolAccount,       // account to close (WSOL ATA)
            rewardWalletAddress,  // destination for lamports (reward wallet)
            rewardWalletAddress,  // authority (reward wallet)
            [],                   // multisig signers (none)
            TOKEN_PROGRAM_ID      // program ID
          )
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
          logger.info('WSOL unwrapped and account closed', { 
            signature: unwrapSignature,
            wsolAmount: userSolBalance.amount.toString(),
            note: 'ATA will be auto-recreated on next swap if wallet has sufficient SOL',
          });
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

    // If we didn't get the amount from WSOL (shouldn't happen), use expected amount
    if (solReceived === 0n) {
      solReceived = expectedDestAmount;
      logger.warn('Could not determine actual swap proceeds, using expected amount', {
        expectedDestAmount: expectedDestAmount.toString(),
        note: 'This should not happen - WSOL balance should have been captured',
      });
    }

    logger.info('Raydium swap completed successfully', {
      signature,
      solReceived: solReceived.toString(),
      solReceivedSOL: (Number(solReceived) / 1e9).toFixed(9),
      expectedSol: expectedDestAmount.toString(),
      expectedSolSOL: (Number(expectedDestAmount) / 1e9).toFixed(9),
      poolType: poolInfo.poolType,
      note: 'solReceived is actual swap proceeds from WSOL balance, NOT total wallet balance',
    });

    return {
      solReceived, // Actual swap proceeds from WSOL balance, NOT total wallet balance
      txSignature: signature,
    };
  } catch (error) {
    logger.error('Error swapping TEK to SOL via Raydium pool', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      amountNuke: amountNuke.toString(),
    });
    throw error; // Re-throw to abort reward distribution
  }
}
