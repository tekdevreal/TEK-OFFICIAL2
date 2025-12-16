import { Keypair } from '@solana/web3.js';
import { logger } from './logger';

/**
 * Load a Solana keypair from an environment variable containing a JSON array
 * 
 * The environment variable should contain a JSON array of numbers representing
 * the secret key as a Uint8Array (64 bytes for Solana keypairs).
 * 
 * Example env var value:
 * [12,34,56,78,...] (64 numbers total)
 * 
 * @param envName - Name of the environment variable containing the JSON keypair
 * @returns Keypair loaded from the environment variable
 * @throws Error if env var is missing, invalid JSON, or invalid keypair format
 */
export function loadKeypairFromEnv(envName: string): Keypair {
  const envValue = process.env[envName];
  
  if (!envValue) {
    throw new Error(
      `Environment variable ${envName} is required but not set. ` +
      `Please set it to a JSON array of 64 numbers representing the secret key.`
    );
  }

  let secretKey: Uint8Array;
  
  try {
    // Parse JSON array
    const parsed = JSON.parse(envValue);
    
    // Validate it's an array
    if (!Array.isArray(parsed)) {
      throw new Error(`${envName} must be a JSON array, got ${typeof parsed}`);
    }
    
    // Validate length (Solana keypairs are 64 bytes)
    if (parsed.length !== 64) {
      throw new Error(
        `${envName} must contain exactly 64 numbers (got ${parsed.length}). ` +
        `Solana keypairs require 64-byte secret keys.`
      );
    }
    
    // Validate all elements are numbers
    for (let i = 0; i < parsed.length; i++) {
      if (typeof parsed[i] !== 'number' || parsed[i] < 0 || parsed[i] > 255) {
        throw new Error(
          `${envName} contains invalid value at index ${i}: ${parsed[i]}. ` +
          `All values must be numbers between 0 and 255.`
        );
      }
    }
    
    // Convert to Uint8Array
    secretKey = Uint8Array.from(parsed);
  } catch (parseError) {
    if (parseError instanceof SyntaxError) {
      throw new Error(
        `${envName} contains invalid JSON: ${parseError.message}. ` +
        `Expected format: [12,34,56,...] (64 numbers)`
      );
    }
    // Re-throw validation errors
    throw parseError;
  }

  try {
    // Create keypair from secret key
    const keypair = Keypair.fromSecretKey(secretKey);
    
    // Log public key (safe to log)
    logger.info(`Keypair loaded from ${envName}`, {
      envName,
      publicKey: keypair.publicKey.toBase58(),
      keypairLength: secretKey.length,
    });
    
    return keypair;
  } catch (keypairError) {
    throw new Error(
      `Failed to create keypair from ${envName}: ${keypairError instanceof Error ? keypairError.message : String(keypairError)}. ` +
      `The secret key may be invalid or corrupted.`
    );
  }
}

/**
 * Load a keypair from environment variable, returning null if not set (optional keypair)
 * 
 * @param envName - Name of the environment variable
 * @returns Keypair if env var is set and valid, null otherwise
 */
export function loadKeypairFromEnvOptional(envName: string): Keypair | null {
  try {
    return loadKeypairFromEnv(envName);
  } catch (error) {
    // If env var is missing, return null (optional)
    if (error instanceof Error && error.message.includes('is required but not set')) {
      logger.debug(`Optional keypair ${envName} not set, returning null`);
      return null;
    }
    // Re-throw other errors (invalid format, etc.)
    throw error;
  }
}

