/**
 * Set Withdraw Withheld Authority for NUKE Token-2022 Mint
 *
 * This script updates the Token-2022 transfer fee config so that
 * the withdraw-withheld authority (who can harvest tax fees) is
 * the reward wallet used by the backend.
 *
 * It uses:
 *  - ADMIN_WALLET_JSON or admin.json as the payer
 *  - The current transfer fee config authority's keypair
 *    (from tax-wallet.json by default) to sign the change
 *
 * Usage (from project root, in WSL):
 *   npx tsx setWithdrawAuthority.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getTransferFeeConfig,
  unpackMint,
  createSetAuthorityInstruction,
  AuthorityType,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// --- Config from env or sensible defaults ---
const RPC = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
const MINT_ADDRESS = process.env.TOKEN_MINT || 'DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K';
const REWARD_WALLET_ADDRESS =
  process.env.REWARD_WALLET_ADDRESS || '6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo';

function loadKeypairFromFile(filePath: string): Keypair {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Keypair file not found: ${filePath}`);
  }
  const secretKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

function loadAdminWallet(): Keypair {
  if (process.env.ADMIN_WALLET_JSON) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.ADMIN_WALLET_JSON)),
    );
  }
  // Fallback to admin.json for local/dev usage
  const ADMIN_KEYPAIR_PATH = path.join(process.cwd(), 'admin.json');
  return loadKeypairFromFile(ADMIN_KEYPAIR_PATH);
}

async function setWithdrawAuthority(): Promise<void> {
  console.log('\n🚀 Setting Withdraw Withheld Authority for NUKE Token-2022 Mint\n');
  console.log('═'.repeat(60));

  // 1) Connect to devnet
  console.log('\n📡 Step 1: Connecting to Solana Devnet...');
  const connection = new Connection(RPC, 'confirmed');
  const version = await connection.getVersion();
  console.log(`✅ Connected (solana-core: ${version['solana-core']})\n`);

  // 2) Load admin payer wallet
  console.log('💼 Step 2: Loading admin payer wallet...');
  const adminWallet = loadAdminWallet();
  const balance = await connection.getBalance(adminWallet.publicKey);
  console.log(`✅ Admin Wallet: ${adminWallet.publicKey.toBase58()}`);
  console.log(`   Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.warn('⚠️  Low balance: you may need to airdrop SOL on devnet.');
  }
  console.log('');

  // 3) Use admin wallet as the current withdraw-withheld authority.
  //    On-chain, withdrawWithheldAuthority is currently the admin wallet.
  console.log('🔑 Step 3: Using admin wallet as current withdraw-withheld authority...');
  const withdrawAuthorityWallet = adminWallet;
  console.log(`✅ Withdraw Authority Wallet: ${withdrawAuthorityWallet.publicKey.toBase58()}\n`);

  // 4) Fetch mint account and current transfer fee config
  console.log('🔍 Step 4: Fetching mint account and transfer fee config...');
  const mintPublicKey = new PublicKey(MINT_ADDRESS);
  const mintInfo = await connection.getAccountInfo(mintPublicKey);
  if (!mintInfo) {
    throw new Error(`Mint account not found: ${MINT_ADDRESS}`);
  }
  if (!mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(`Account is not a Token-2022 mint. Owner: ${mintInfo.owner.toBase58()}`);
  }

  const parsedMint = unpackMint(mintPublicKey, mintInfo, TOKEN_2022_PROGRAM_ID);
  const transferFeeConfig = getTransferFeeConfig(parsedMint);
  if (!transferFeeConfig) {
    throw new Error('Mint does not have TransferFeeConfig extension');
  }

  console.log('\n📊 Current Transfer Fee Configuration:');
  console.log(
    `   Transfer Fee Config Authority: ${transferFeeConfig.transferFeeConfigAuthority?.toBase58() || 'None'}`,
  );
  console.log(
    `   Withdraw Withheld Authority: ${transferFeeConfig.withdrawWithheldAuthority?.toBase58() || 'None'}`,
  );

  // 5) Check that our withdrawAuthorityWallet matches current withdrawWithheldAuthority
  const currentWithdrawAuthority = transferFeeConfig.withdrawWithheldAuthority;
  if (!currentWithdrawAuthority) {
    throw new Error('Mint has no withdrawWithheldAuthority set; cannot update.');
  }

  if (!currentWithdrawAuthority.equals(withdrawAuthorityWallet.publicKey)) {
    throw new Error(
      `Withdraw authority mismatch.\n` +
        `  On-chain: ${currentWithdrawAuthority.toBase58()}\n` +
        `  Local key: ${withdrawAuthorityWallet.publicKey.toBase58()}\n` +
        `You must sign with the current withdraw-withheld authority keypair.`,
    );
  }

  // 6) Build transaction to set new withdraw-withheld authority to reward wallet
  console.log('\n📝 Step 5: Building transaction to set withdraw-withheld authority...');
  const newWithdrawAuthority = new PublicKey(REWARD_WALLET_ADDRESS);
  console.log(`   New Withdraw Withheld Authority (Reward Wallet): ${newWithdrawAuthority.toBase58()}\n`);

  const tx = new Transaction().add(
    createSetAuthorityInstruction(
      mintPublicKey,
      withdrawAuthorityWallet.publicKey,
      AuthorityType.WithheldWithdraw,
      newWithdrawAuthority,
      [], // no multisig
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // 7) Send and confirm transaction
  console.log('📤 Step 6: Sending transaction...');
  const blockhash = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash.blockhash;
  tx.feePayer = adminWallet.publicKey;

  // Both admin (payer) and withdraw authority sign
  tx.sign(adminWallet, withdrawAuthorityWallet);

  const signature = await sendAndConfirmTransaction(connection, tx, [adminWallet, withdrawAuthorityWallet], {
    commitment: 'confirmed',
  });

  console.log(`✅ Transaction confirmed!`);
  console.log(`   Signature: ${signature}\n`);

  // 8) Verify updated config
  console.log('🔍 Step 7: Verifying updated transfer fee configuration...');
  const updatedMintInfo = await connection.getAccountInfo(mintPublicKey);
  if (!updatedMintInfo) {
    throw new Error('Failed to fetch updated mint account');
  }
  const updatedParsedMint = unpackMint(mintPublicKey, updatedMintInfo, TOKEN_2022_PROGRAM_ID);
  const updatedConfig = getTransferFeeConfig(updatedParsedMint);
  if (!updatedConfig) {
    throw new Error('TransferFeeConfig not found after update');
  }

  console.log('\n✅ Withdraw Withheld Authority Updated Successfully!\n');
  console.log('📊 Updated Transfer Fee Configuration:');
  console.log(
    `   Transfer Fee Config Authority: ${updatedConfig.transferFeeConfigAuthority?.toBase58() || 'None'}`,
  );
  console.log(
    `   Withdraw Withheld Authority: ${updatedConfig.withdrawWithheldAuthority?.toBase58() || 'None'}`,
  );

  console.log('\n🎉 Update Complete!\n');
  console.log('Summary:');
  console.log(`   Mint Address: ${mintPublicKey.toBase58()}`);
  console.log(`   New Withdraw Withheld Authority: ${newWithdrawAuthority.toBase58()}`);
}

setWithdrawAuthority()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });


