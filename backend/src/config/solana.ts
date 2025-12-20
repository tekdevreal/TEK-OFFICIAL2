import { Connection, PublicKey } from '@solana/web3.js';
import { env } from './env';
import { logger } from '../utils/logger';

// Lazy initialization of Solana connection to allow server to start without Solana config
let connectionInstance: Connection | null = null;
const NETWORK = (env.SOLANA_NETWORK as string) || 'devnet';

function validateRpcUrl(): string {
  const rpcUrl = (env.SOLANA_RPC_URL as string) || '';

  if (!rpcUrl) {
    throw new Error('SOLANA_RPC_URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new Error('SOLANA_RPC_URL is invalid');
  }

  const host = parsed.host;
  const provider = host.includes('alchemy.com') ? 'Alchemy' : 
                   host.includes('helius') ? 'Helius' : 
                   'Custom';

  logger.info('Solana RPC configured', {
    provider,
    host,
    network: NETWORK,
  });

  return rpcUrl;
}

function getConnection(): Connection {
  if (!connectionInstance) {
    const rpcUrl = validateRpcUrl();
    connectionInstance = new Connection(rpcUrl, 'confirmed');
  }
  return connectionInstance;
}

export const connection = getConnection();

// Lazy initialization of token mint to allow server to start without Solana config
let tokenMintInstance: PublicKey | null = null;

function getTokenMint(): PublicKey {
  if (!tokenMintInstance) {
    const mintAddress = (env.TOKEN_MINT as string) || '';
    if (!mintAddress || typeof mintAddress !== 'string') {
      throw new Error('TOKEN_MINT is required');
    }
    tokenMintInstance = new PublicKey(mintAddress);
  }
  return tokenMintInstance;
}

export const tokenMint = getTokenMint();

/**
 * Verify connection on startup (non-blocking)
 */
export async function verifySolanaConnection(): Promise<void> {
  try {
    const conn = getConnection();
    const version = await conn.getVersion();
    logger.info('Solana connection verified', {
      network: NETWORK,
      rpcHost: new URL((env.SOLANA_RPC_URL as string)).host,
      version: version['solana-core'],
      tokenMint: getTokenMint().toBase58(),
    });
  } catch (error) {
    logger.warn('Failed to verify Solana connection (non-critical)', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - allow server to start even if Solana connection fails
  }
}
