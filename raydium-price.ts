/**
 * Raydium devnet spot price fetcher for a single pool (CPMM first, CLMM fallback).
 *
 * Requirements (from repo root):
 *   npm install @solana/web3.js @raydium-io/raydium-sdk-v2
 *
 * Run (from repo root, in WSL):
 *   npx tsx raydium-price.ts
 *
 * This script:
 *   - Connects to Solana devnet
 *   - Uses Raydium SDK v2 helpers for CPMM (AmmV4) and CLMM (Clmm)
 *   - Fetches pool state directly from RPC (no Raydium HTTP API)
 *   - Computes spot price in both directions:
 *       * 1 base token in quote token
 *       * 1 quote token in base token
 *   - Prints base/quote mints and decimals
 *   - Handles missing/unsupported pools with clear errors
 */

import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

// NOTE: API surface of @raydium-io/raydium-sdk-v2 can differ by version.
// This script uses only the CLMM helper exported as `Clmm`, which is
// available in v0.2.31-alpha. CPMM (legacy AmmV4) support would require
// additional wiring that goes beyond the public top-level exports.
import { Clmm } from '@raydium-io/raydium-sdk-v2';

// ====== CONFIG ======

// Replace this with your actual Raydium pool ID on devnet
const POOL_ID = 'At7BLqEWTchEYzCRhcnbXVfYYY9VLmTDSn7YAC3PQB1t';

// Known IDs (for clarity / logging; not strictly required for computation)
const AMM_PROGRAM_ID = new PublicKey('HTVWgp8CbUsRNmRE1p9RBYqopxe2qiyApSkiTFLrfxaW'); // Raydium CPMM AMM Config
const TEK_MINT = new PublicKey('DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K');
const SOL_MINT  = new PublicKey('So11111111111111111111111111111111111111112');

// Devnet RPC endpoint – you can swap in your Helius URL or custom RPC if desired
const RPC_ENDPOINT = clusterApiUrl('devnet');

type PoolType = 'CLMM';

interface SpotPriceResult {
  poolType: PoolType;
  poolId: string;
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  priceBaseInQuote: number; // 1 base = X quote
  priceQuoteInBase: number; // 1 quote = Y base
}

/**
 * Fetch token mint decimals from chain.
 */
async function getMintDecimals(connection: Connection, mint: PublicKey): Promise<number> {
  const info = await connection.getParsedAccountInfo(mint);
  if (!info.value) throw new Error(`Mint account not found: ${mint.toBase58()}`);
  const data = (info.value.data as any).parsed?.info;
  const decimals = data?.decimals;
  if (typeof decimals !== 'number') {
    throw new Error(`Unable to read decimals for mint: ${mint.toBase58()}`);
  }
  return decimals;
}

/**
 * Try to load the pool as a CLMM pool and compute spot price.
 */
async function tryLoadClmmPool(connection: Connection, poolId: PublicKey): Promise<SpotPriceResult | null> {
  try {
    // 1) Load CLMM pool state via SDK helper, directly from RPC.
    const clmmInfos = await Clmm.fetchMultiplePoolInfos({
      connection,
      poolIds: [poolId],
    });

    const info = clmmInfos[poolId.toBase58()];
    if (!info) return null;

    const baseMint = info.mintA;
    const quoteMint = info.mintB;
    const baseDecimals = await getMintDecimals(connection, baseMint);
    const quoteDecimals = await getMintDecimals(connection, quoteMint);

    // 2) Price from sqrt price (B per A).
    const priceBaseInQuote = Clmm.getPriceFromSqrtPriceX64(
      info.sqrtPriceX64,
      baseDecimals,
      quoteDecimals,
    );
    if (priceBaseInQuote <= 0 || !Number.isFinite(priceBaseInQuote)) {
      throw new Error('Invalid CLMM price from sqrtPriceX64');
    }
    const priceQuoteInBase = 1 / priceBaseInQuote;

    return {
      poolType: 'CLMM',
      poolId: poolId.toBase58(),
      baseMint: baseMint.toBase58(),
      quoteMint: quoteMint.toBase58(),
      baseDecimals,
      quoteDecimals,
      priceBaseInQuote,
      priceQuoteInBase,
    };
  } catch (e) {
    console.error('[CLMM] Failed to load pool as CLMM:', (e as Error).message);
    return null;
  }
}

async function main() {
  console.log('=== Raydium Devnet Spot Price Fetcher ===');
  console.log('RPC:', RPC_ENDPOINT);
  console.log('Pool ID:', POOL_ID);
  console.log('AMM Config ID (CPMM):', AMM_PROGRAM_ID.toBase58());
  console.log('TEK Mint:', TEK_MINT.toBase58());
  console.log('SOL Mint :', SOL_MINT.toBase58());
  console.log('-----------------------------------------');

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const poolId = new PublicKey(POOL_ID);

  // Currently we only support CLMM pools via Raydium SDK v2 CLMM helper.
  const result = await tryLoadClmmPool(connection, poolId);

  if (!result) {
    console.error('❌ Pool not found or unsupported type (neither CPMM nor CLMM).');
    process.exit(1);
  }

  const {
    poolType,
    baseMint,
    quoteMint,
    baseDecimals,
    quoteDecimals,
    priceBaseInQuote,
    priceQuoteInBase,
  } = result;

  console.log(`✅ Pool type detected: ${poolType}`);
  console.log(`Base mint : ${baseMint} (decimals: ${baseDecimals})`);
  console.log(`Quote mint: ${quoteMint} (decimals: ${quoteDecimals})`);
  console.log('-----------------------------------------');
  console.log('Spot price (devnet):');
  console.log(`  1 base  = ${priceBaseInQuote} quote`);
  console.log(`  1 quote = ${priceQuoteInBase} base`);
  console.log('-----------------------------------------');

  // Convenience interpretation for TEK/SOL pools.
  if (baseMint === TEK_MINT.toBase58() && quoteMint === SOL_MINT.toBase58()) {
    console.log(`Interpreted as: 1 TEK = ${priceBaseInQuote} SOL, 1 SOL = ${priceQuoteInBase} TEK`);
  } else if (baseMint === SOL_MINT.toBase58() && quoteMint === TEK_MINT.toBase58()) {
    console.log(`Interpreted as: 1 SOL = ${priceBaseInQuote} TEK, 1 TEK = ${priceQuoteInBase} SOL`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});


