# Wallet Private Key Refactoring

## Summary

Refactored wallet private key handling to use Solana JSON keypairs safely across the backend.

## Changes Made

### 1. Created Helper Utility (`backend/src/utils/loadKeypairFromEnv.ts`)
- `loadKeypairFromEnv(envName)`: Loads required keypair from environment variable
- `loadKeypairFromEnvOptional(envName)`: Loads optional keypair (returns null if not set)
- Validates JSON format, array length (64 bytes), and value ranges (0-255)
- Only logs public keys (never secret keys)
- Provides descriptive error messages

### 2. Updated Tax Service (`backend/src/services/taxService.ts`)
- Replaced manual JSON parsing with `loadKeypairFromEnv()`
- Updated environment variable names:
  - `REWARD_WALLET_PRIVATE_KEY` → `REWARD_WALLET_PRIVATE_KEY_JSON`
  - `TREASURY_WALLET_PRIVATE_KEY` → `TREASURY_WALLET_PRIVATE_KEY_JSON`
- Removed all direct private key handling code
- Only logs public keys in all operations

### 3. Updated Reward Service (`backend/src/services/rewardService.ts`)
- Added import for `loadKeypairFromEnv` (for future use)
- Ensured admin wallet loading only logs public keys
- Maintained backward compatibility with `ADMIN_WALLET_JSON`

### 4. Added Startup Validation (`backend/src/index.ts`)
- Validates all wallet configurations on application startup
- Logs public keys for reward and treasury wallets
- Validates address matches (if provided)
- Crashes application if required wallets are missing or invalid
- Provides clear error messages for configuration issues

### 5. Updated Environment Template (`backend/ENV_TEMPLATE.txt`)
- Updated to use `REWARD_WALLET_PRIVATE_KEY_JSON`
- Updated to use `TREASURY_WALLET_PRIVATE_KEY_JSON`
- Added clear documentation about JSON array format
- Noted that addresses are optional (derived from private keys)

## Environment Variables

### Required
- `REWARD_WALLET_PRIVATE_KEY_JSON`: JSON array of 64 numbers
  - Format: `[12,34,56,78,...]` (64 numbers total)
  - Required for tax distribution operations

### Optional
- `REWARD_WALLET_ADDRESS`: Public key (optional, derived from private key if not set)
- `TREASURY_WALLET_ADDRESS`: Public key (optional, derived from private key if not set)
- `TREASURY_WALLET_PRIVATE_KEY_JSON`: JSON array of 64 numbers (optional, treasury can be receive-only)

## Security Rules

✅ **Never commit private keys**
✅ **Never add .env files to git**
✅ **All secrets live in Railway/Render env vars**
✅ **Never print private keys to logs**
✅ **Only log public keys** (`publicKey.toBase58()`)

## Converting Base58 Private Keys to JSON Array

If you have a base58 private key (like from Phantom or Solana CLI), you need to convert it to a JSON array format.

### Using Node.js Script

```javascript
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Your base58 private key
const base58Key = '2zL2NLzpdBM8JZdvQTaYYT96PEGKVdZV4JtLj6cPnLNVAvdGfz2DccocuSx9Ckp8tTBWpUFuqfnhKx4ASmnJ2Xoy';

// Decode base58 to Uint8Array
const secretKey = bs58.decode(base58Key);

// Convert to JSON array
const jsonArray = Array.from(secretKey);
console.log(JSON.stringify(jsonArray));
```

### Using Solana CLI

```bash
# If you have a keypair file
solana-keygen pubkey your-keypair.json
# Then extract the secret key array from the JSON file
```

## Railway/Render Setup

1. Go to your service environment variables
2. Add `REWARD_WALLET_PRIVATE_KEY_JSON`
3. Set value as a single-line JSON array: `[12,34,56,78,...]`
4. Add `TREASURY_WALLET_PRIVATE_KEY_JSON` (optional)
5. Set value as a single-line JSON array: `[12,34,56,78,...]`

## Validation

On startup, the application will:
1. ✅ Validate `REWARD_WALLET_PRIVATE_KEY_JSON` exists and is valid
2. ✅ Validate `TREASURY_WALLET_PRIVATE_KEY_JSON` (if provided)
3. ✅ Log public keys for both wallets
4. ✅ Validate address matches (if `REWARD_WALLET_ADDRESS` or `TREASURY_WALLET_ADDRESS` provided)
5. ❌ Crash with descriptive error if validation fails

## Devnet Compatibility

✅ Fully backend-signed transactions
✅ No Phantom dependency
✅ Works with scheduler + tax automation
✅ Compatible with Token-2022 program

