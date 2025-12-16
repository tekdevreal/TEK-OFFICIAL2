import { AccountInfo } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, unpackMint, unpackAccount } from '@solana/spl-token';
import { connection, tokenMint } from '../config/solana';
import { logger } from '../utils/logger';

export interface TokenHolder {
  address: string;
  owner: string;
  amount: string;
  decimals: number;
}

export interface MintInfo {
  address: string;
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean;
}

/**
 * Fetch mint account information
 */
export async function getMintInfo(): Promise<MintInfo> {
  try {
    const mintAccountInfo = await connection.getAccountInfo(tokenMint);
    
    if (!mintAccountInfo) {
      throw new Error(`Mint account not found: ${tokenMint.toBase58()}`);
    }

    const parsedMint = unpackMint(tokenMint, mintAccountInfo, TOKEN_2022_PROGRAM_ID);
    
    return {
      address: tokenMint.toBase58(),
      decimals: parsedMint.decimals,
      supply: parsedMint.supply.toString(),
      mintAuthority: parsedMint.mintAuthority ? parsedMint.mintAuthority.toBase58() : null,
      freezeAuthority: parsedMint.freezeAuthority ? parsedMint.freezeAuthority.toBase58() : null,
      isInitialized: parsedMint.mintAuthority !== null,
    };
  } catch (error) {
    logger.error('Error fetching mint info', {
      error: error instanceof Error ? error.message : String(error),
      mint: tokenMint.toBase58(),
    });
    throw error;
  }
}

/**
 * Fetch total token supply
 */
export async function getTokenSupply(): Promise<string> {
  try {
    const mintInfo = await getMintInfo();
    return mintInfo.supply;
  } catch (error) {
    logger.error('Error fetching token supply', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Fetch all token holders (token accounts) for the mint
 */
export async function getTokenHolders(): Promise<TokenHolder[]> {
  try {
    // Token-2022 accounts can have variable sizes due to extensions
    // Remove dataSize filter to get all accounts, then filter by mint
    const tokenAccounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0, // Mint address offset in token account (first 32 bytes)
            bytes: tokenMint.toBase58(),
          },
        },
      ],
    });

    logger.debug('Found token accounts for mint', {
      count: tokenAccounts.length,
      mint: tokenMint.toBase58(),
    });

    const holders: TokenHolder[] = [];
    const mintInfo = await getMintInfo();

    for (const { pubkey, account } of tokenAccounts) {
      try {
        // Parse token account using SPL Token library
        const parsedAccount = unpackAccount(pubkey, account as AccountInfo<Buffer>, TOKEN_2022_PROGRAM_ID);
        
        // Verify this account belongs to our mint
        if (!parsedAccount.mint.equals(tokenMint)) {
          continue;
        }

        // Only include accounts with balance > 0
        if (parsedAccount.amount > 0n) {
          holders.push({
            address: pubkey.toBase58(),
            owner: parsedAccount.owner.toBase58(),
            amount: parsedAccount.amount.toString(),
            decimals: mintInfo.decimals,
          });
        }
      } catch (parseError) {
        logger.warn('Error parsing token account', {
          address: pubkey.toBase58(),
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        // Continue with next account
      }
    }

    // Sort by amount (descending)
    holders.sort((a, b) => {
      const amountA = BigInt(a.amount);
      const amountB = BigInt(b.amount);
      if (amountA > amountB) return -1;
      if (amountA < amountB) return 1;
      return 0;
    });

    logger.info('Fetched token holders', {
      count: holders.length,
      mint: tokenMint.toBase58(),
      totalAccountsFound: tokenAccounts.length,
      accountsWithBalance: holders.length,
    });

    return holders;
  } catch (error) {
    logger.error('Error fetching token holders', {
      error: error instanceof Error ? error.message : String(error),
      mint: tokenMint.toBase58(),
    });
    throw error;
  }
}

