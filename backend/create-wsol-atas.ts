/**
 * Script to create WSOL ATAs for wallets that need them
 * Run this ONCE per wallet before performing swaps
 * 
 * Usage:
 *   cd backend
 *   npx tsx create-wsol-atas.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import { loadKeypairFromEnv } from './src/utils/loadKeypairFromEnv';
import { connection, NETWORK } from './src/config/solana';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// WSOL mint address (same for devnet and mainnet)
const WSOL_MINT = NATIVE_MINT; // So11111111111111111111111111111111111111112

// Get wallet addresses from environment variables (required)
function getRewardWalletAddress(): string {
  const rewardAddress = process.env.REWARD_WALLET_ADDRESS;
  if (!rewardAddress) {
    throw new Error('REWARD_WALLET_ADDRESS environment variable is required');
  }
  return rewardAddress;
}

function getTreasuryWalletAddress(): string | null {
  return process.env.TREASURY_WALLET_ADDRESS || null;
}

async function createWSOLATA(walletPublicKey: string, walletName: string): Promise<void> {
  const walletPubkey = new PublicKey(walletPublicKey);
  
  // Derive WSOL ATA address
  const wsolAta = getAssociatedTokenAddressSync(
    WSOL_MINT,
    walletPubkey,
    false,
    TOKEN_PROGRAM_ID
  );

  console.log(`\n${walletName}:`);
  console.log(`  Public Key: ${walletPublicKey}`);
  console.log(`  WSOL ATA:   ${wsolAta.toBase58()}`);

  // Check if ATA already exists
  try {
    await getAccount(connection, wsolAta, 'confirmed', TOKEN_PROGRAM_ID);
    console.log(`  ✅ WSOL ATA already exists - no action needed`);
    return;
  } catch (error) {
    // ATA doesn't exist, we need to create it
    console.log(`  ⚠️  WSOL ATA does not exist - creating...`);
  }

  // We need a payer wallet to create the ATA
  // Try to use reward wallet as payer (it should have SOL)
  let payerWallet: Keypair;
  try {
    payerWallet = loadKeypairFromEnv('REWARD_WALLET_PRIVATE_KEY_JSON');
    console.log(`  Using Reward Wallet as payer: ${payerWallet.publicKey.toBase58()}`);
  } catch (error) {
    throw new Error(
      `Cannot create WSOL ATA: Need REWARD_WALLET_PRIVATE_KEY_JSON to pay for transaction. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Check payer has SOL
  const payerBalance = await connection.getBalance(payerWallet.publicKey);
  if (payerBalance < 0.002 * 1e9) { // Need at least 0.002 SOL
    throw new Error(
      `Payer wallet has insufficient SOL. ` +
      `Required: 0.002 SOL, Available: ${payerBalance / 1e9} SOL. ` +
      `Please fund the payer wallet first.`
    );
  }

  // Create transaction to create WSOL ATA
  const transaction = new Transaction();
  transaction.add(
    createAssociatedTokenAccountInstruction(
      payerWallet.publicKey, // payer
      wsolAta,               // ata
      walletPubkey,          // owner
      WSOL_MINT,            // WSOL mint
      TOKEN_PROGRAM_ID      // SPL Token program
    )
  );

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payerWallet.publicKey;

  try {
    // Sign and send transaction
    transaction.sign(payerWallet);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payerWallet],
      { commitment: 'confirmed', maxRetries: 3 }
    );

    console.log(`  ✅ WSOL ATA created successfully!`);
    console.log(`  Transaction: https://solscan.io/tx/${signature}?cluster=${NETWORK}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('already in use')) {
      console.log(`  ✅ WSOL ATA already exists (created by another transaction)`);
    } else {
      throw new Error(
        `Failed to create WSOL ATA: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function main() {
  console.log('=== WSOL ATA Creation Script ===\n');
  console.log(`Network: ${NETWORK}`);
  console.log(`RPC: ${connection.rpcEndpoint}\n`);

  try {
    // Get wallet addresses from environment
    const rewardWalletAddress = getRewardWalletAddress();
    const treasuryWalletAddress = getTreasuryWalletAddress();

    console.log(`Reward Wallet Address: ${rewardWalletAddress}`);
    if (treasuryWalletAddress) {
      console.log(`Treasury Wallet Address: ${treasuryWalletAddress}`);
    }
    console.log('');

    // Create WSOL ATA for Reward Wallet (REQUIRED)
    await createWSOLATA(rewardWalletAddress, 'Reward Wallet');

    // Create WSOL ATA for Treasury Wallet (OPTIONAL - only if it performs swaps)
    if (treasuryWalletAddress) {
      await createWSOLATA(treasuryWalletAddress, 'Treasury Wallet');
    }

    console.log('\n=== Verification ===\n');
    
    // Verify Reward Wallet
    const rewardWsolAta = getAssociatedTokenAddressSync(
      WSOL_MINT,
      new PublicKey(rewardWalletAddress),
      false,
      TOKEN_PROGRAM_ID
    );
    try {
      const account = await getAccount(connection, rewardWsolAta, 'confirmed', TOKEN_PROGRAM_ID);
      console.log(`✅ Reward Wallet WSOL ATA exists: ${rewardWsolAta.toBase58()}`);
      console.log(`   Balance: ${account.amount.toString()}`);
    } catch (error) {
      console.log(`❌ Reward Wallet WSOL ATA not found: ${rewardWsolAta.toBase58()}`);
    }

    // Verify Treasury Wallet (if configured)
    if (treasuryWalletAddress) {
      const treasuryWsolAta = getAssociatedTokenAddressSync(
        WSOL_MINT,
        new PublicKey(treasuryWalletAddress),
        false,
        TOKEN_PROGRAM_ID
      );
      try {
        const account = await getAccount(connection, treasuryWsolAta, 'confirmed', TOKEN_PROGRAM_ID);
        console.log(`✅ Treasury Wallet WSOL ATA exists: ${treasuryWsolAta.toBase58()}`);
        console.log(`   Balance: ${account.amount.toString()}`);
      } catch (error) {
        console.log(`❌ Treasury Wallet WSOL ATA not found: ${treasuryWsolAta.toBase58()}`);
      }
    }

    console.log('\n=== Complete ===');
    console.log('WSOL ATAs have been created. Swaps should now work correctly.');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

