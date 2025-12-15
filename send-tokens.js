// send-tokens.js
// Utility script to send Token-2022 tokens from the admin wallet to a recipient.
// Uses the same ADMIN_WALLET_JSON / TOKEN_MINT / HELIUS_RPC_URL env vars as the backend.
//
// Required env vars:
// - HELIUS_RPC_URL       : RPC endpoint (devnet/mainnet)
// - TOKEN_MINT           : Mint public key of your Token-2022
// - ADMIN_WALLET_JSON    : JSON array of the admin wallet secret key
// - SEND_AMOUNT_TOKENS   : Amount to send in human units (e.g. "1000" for 1,000 tokens)
// - DESTINATION_ADDRESS  : Recipient wallet address (base58)
//
// Example:
// NODE_ENV=production \
// HELIUS_RPC_URL="https://..." \
// TOKEN_MINT="YourMintAddress" \
// ADMIN_WALLET_JSON='[ ... ]' \
// SEND_AMOUNT_TOKENS="1000" \
// DESTINATION_ADDRESS="Hxr478e7htMcWanKDMRvbynM8XaFupLcN3oDzJCuqS4D" \
// node send-tokens.js

import dotenv from 'dotenv';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getMint,
} from '@solana/spl-token';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

async function main() {
  const rpcUrl = requireEnv('HELIUS_RPC_URL');
  const mintAddress = requireEnv('TOKEN_MINT');
  const adminWalletJson = requireEnv('ADMIN_WALLET_JSON');
  const destinationAddress = requireEnv('DESTINATION_ADDRESS');

  const humanAmount = Number(process.env.SEND_AMOUNT_TOKENS || '0');
  if (!humanAmount || humanAmount <= 0) {
    throw new Error('SEND_AMOUNT_TOKENS must be a positive number (human units)');
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const mintPubkey = new PublicKey(mintAddress);

  const secretKey = Uint8Array.from(JSON.parse(adminWalletJson));
  const admin = Keypair.fromSecretKey(secretKey);
  const destinationOwner = new PublicKey(destinationAddress);

  console.log('🔐 Admin wallet:', admin.publicKey.toBase58());
  console.log('🎯 Destination:', destinationOwner.toBase58());
  console.log('🪙 Mint:', mintPubkey.toBase58());

  // Fetch mint info to get decimals
  const mintInfo = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
  const decimals = mintInfo.decimals;

  const rawAmount = BigInt(Math.round(humanAmount * 10 ** decimals));

  const fromAta = await getAssociatedTokenAddress(mintPubkey, admin.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const toAta = await getAssociatedTokenAddress(mintPubkey, destinationOwner, false, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction();

  // Create destination ATA if needed
  const toAtaInfo = await connection.getAccountInfo(toAta);
  if (!toAtaInfo) {
    console.log('🔧 Creating destination ATA:', toAta.toBase58());
    tx.add(
      createAssociatedTokenAccountInstruction(
        admin.publicKey,
        toAta,
        destinationOwner,
        mintPubkey,
        TOKEN_2022_PROGRAM_ID
      )
    );
  } else {
    console.log('ℹ️ Destination ATA already exists:', toAta.toBase58());
  }

  // Transfer instruction
  tx.add(
    createTransferInstruction(
      fromAta,
      toAta,
      admin.publicKey,
      rawAmount,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  tx.feePayer = admin.publicKey;
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  console.log('🚀 Sending tokens...', {
    amountHuman: humanAmount,
    amountRaw: rawAmount.toString(),
    decimals,
    from: admin.publicKey.toBase58(),
    fromAta: fromAta.toBase58(),
    toAta: toAta.toBase58(),
  });

  const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
    commitment: 'confirmed',
    skipPreflight: false,
  });

  console.log('✅ Transfer confirmed:', sig);
  const network = process.env.SOLANA_NETWORK || 'devnet';
  console.log(`🔗 Explorer: https://explorer.solana.com/tx/${sig}?cluster=${network}`);
}

main().catch((err) => {
  console.error('❌ Failed to send tokens:', err);
  process.exit(1);
});


