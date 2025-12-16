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
  createSetTransferFeeInstruction,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Configuration (overridable via env)
const RPC = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
const MINT_ADDRESS = process.env.TOKEN_MINT || 'REPLACE_WITH_MINT';
const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || '6');

// New transfer fee configuration (defaults to 5% with 1,000 tokens max at 6 decimals)
const NEW_TRANSFER_FEE_BASIS_POINTS = Number(process.env.NEW_TRANSFER_FEE_BPS || '500'); // 5%
const NEW_MAX_TRANSFER_FEE = BigInt(
  process.env.NEW_MAX_TRANSFER_FEE || '1000000000' // 1,000 tokens with 6 decimals
);

// Keypair source: ADMIN_WALLET_JSON env or admin.json file
const ADMIN_KEYPAIR_PATH = path.join(process.cwd(), 'admin.json');

/**
 * Load keypair from JSON file
 */
function loadKeypair(filePath: string): Keypair {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Keypair file not found: ${filePath}`);
    }
    const secretKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
  } catch (error) {
    throw new Error(`Failed to load keypair from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main function to update TransferFeeConfig
 */
async function updateTransferFee(): Promise<void> {
  try {
    console.log('\n🚀 Updating TransferFeeConfig for Token-2022 Mint\n');
    console.log('═'.repeat(60));
    
    // Step 1: Connect to devnet
    console.log('\n📡 Step 1: Connecting to Solana Devnet...');
    const connection = new Connection(RPC, 'confirmed');
    const version = await connection.getVersion();
    console.log(`✅ Connected to Devnet (Version: ${version['solana-core']})\n`);

    // Step 2: Load admin payer wallet
    console.log('💼 Step 2: Loading admin payer wallet...');
    const adminWallet = process.env.ADMIN_WALLET_JSON
      ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.ADMIN_WALLET_JSON)))
      : loadKeypair(ADMIN_KEYPAIR_PATH);
    const adminBalance = await connection.getBalance(adminWallet.publicKey);
    console.log(`✅ Admin Wallet: ${adminWallet.publicKey.toBase58()}`);
    console.log(`   Balance: ${adminBalance / LAMPORTS_PER_SOL} SOL`);
    
    if (adminBalance < 0.01 * LAMPORTS_PER_SOL) {
      console.warn('⚠️  Warning: Low balance. You may need to airdrop SOL for devnet.');
    }
    console.log('');

    // Step 3: Transfer fee config authority = admin (mint authority)
    const transferFeeAuthority = adminWallet;
    console.log(`✅ Transfer Fee Config Authority: ${transferFeeAuthority.publicKey.toBase58()}\n`);

    // Step 4: Fetch current mint account and verify it exists
    console.log('🔍 Step 4: Fetching mint account...');
    const mintPublicKey = new PublicKey(MINT_ADDRESS);
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    
    if (!mintInfo) {
      throw new Error(`Mint account not found: ${MINT_ADDRESS}`);
    }
    
    if (!mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new Error(`Account is not a Token-2022 mint. Owner: ${mintInfo.owner.toBase58()}`);
    }
    
    console.log(`✅ Mint account found: ${mintPublicKey.toBase58()}`);
    
    // Parse mint and get current transfer fee config
    const parsedMint = unpackMint(mintPublicKey, mintInfo, TOKEN_2022_PROGRAM_ID);
    const currentTransferFeeConfig = getTransferFeeConfig(parsedMint);
    
    if (!currentTransferFeeConfig) {
      throw new Error('Mint does not have TransferFeeConfig extension');
    }
    
    console.log('\n📊 Current Transfer Fee Configuration:');
    console.log(`   Transfer Fee Config Authority: ${currentTransferFeeConfig.transferFeeConfigAuthority?.toBase58() || 'None'}`);
    console.log(`   Withdraw Withheld Authority: ${currentTransferFeeConfig.withdrawWithheldAuthority?.toBase58() || 'None'}`);
    console.log(`   Older Transfer Fee:`);
    console.log(`     Epoch: ${currentTransferFeeConfig.olderTransferFee.epoch.toString()}`);
    console.log(`     Fee Basis Points: ${currentTransferFeeConfig.olderTransferFee.transferFeeBasisPoints}`);
    console.log(`     Max Fee: ${currentTransferFeeConfig.olderTransferFee.maximumFee.toString()}`);
    console.log(`   Newer Transfer Fee:`);
    console.log(`     Epoch: ${currentTransferFeeConfig.newerTransferFee.epoch.toString()}`);
    console.log(`     Fee Basis Points: ${currentTransferFeeConfig.newerTransferFee.transferFeeBasisPoints}`);
    console.log(`     Max Fee: ${currentTransferFeeConfig.newerTransferFee.maximumFee.toString()}\n`);

    // Verify authority
    if (!currentTransferFeeConfig.transferFeeConfigAuthority) {
      throw new Error('Transfer fee config authority is not set');
    }
    
    if (!currentTransferFeeConfig.transferFeeConfigAuthority.equals(transferFeeAuthority.publicKey)) {
      throw new Error(
        `Transfer fee config authority mismatch. Expected: ${currentTransferFeeConfig.transferFeeConfigAuthority.toBase58()}, Got: ${transferFeeAuthority.publicKey.toBase58()}`
      );
    }

    // Step 5: Build and send transaction to update transfer fee
    console.log('📝 Step 5: Building transaction to update transfer fee...');
    console.log('   New Configuration:');
    console.log(`     Transfer Fee: ${NEW_TRANSFER_FEE_BASIS_POINTS / 100}% (${NEW_TRANSFER_FEE_BASIS_POINTS} basis points)`);
    console.log(`     Max Transfer Fee: ${NEW_MAX_TRANSFER_FEE.toString()} (${Number(NEW_MAX_TRANSFER_FEE) / 10 ** TOKEN_DECIMALS} tokens)\n`);

    const transaction = new Transaction();
    
    transaction.add(
      createSetTransferFeeInstruction(
        mintPublicKey,
        transferFeeAuthority.publicKey,
        [], // No multi-signers needed
        NEW_TRANSFER_FEE_BASIS_POINTS,
        NEW_MAX_TRANSFER_FEE,
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Step 6: Send and confirm transaction
    console.log('📤 Step 6: Sending transaction...');
    const blockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.feePayer = adminWallet.publicKey;
    transaction.sign(adminWallet, transferFeeAuthority);

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [adminWallet, transferFeeAuthority],
      { commitment: 'confirmed' }
    );
    
    console.log(`✅ Transaction confirmed!`);
    console.log(`   Signature: ${signature}\n`);

    // Step 7: Verify the updated transfer fee config
    console.log('🔍 Step 7: Verifying updated transfer fee configuration...');
    const updatedMintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!updatedMintInfo) {
      throw new Error('Failed to fetch updated mint account');
    }
    
    const updatedParsedMint = unpackMint(mintPublicKey, updatedMintInfo, TOKEN_2022_PROGRAM_ID);
    const updatedTransferFeeConfig = getTransferFeeConfig(updatedParsedMint);
    
    if (!updatedTransferFeeConfig) {
      throw new Error('TransferFeeConfig not found after update');
    }
    
    console.log('\n✅ Transfer Fee Configuration Updated Successfully!\n');
    console.log('📊 Updated Transfer Fee Configuration:');
    console.log(`   Transfer Fee Config Authority: ${updatedTransferFeeConfig.transferFeeConfigAuthority?.toBase58() || 'None'}`);
    console.log(`   Withdraw Withheld Authority: ${updatedTransferFeeConfig.withdrawWithheldAuthority?.toBase58() || 'None'}`);
    console.log(`   Older Transfer Fee:`);
    console.log(`     Epoch: ${updatedTransferFeeConfig.olderTransferFee.epoch.toString()}`);
    console.log(`     Fee Basis Points: ${updatedTransferFeeConfig.olderTransferFee.transferFeeBasisPoints}`);
    console.log(`     Max Fee: ${updatedTransferFeeConfig.olderTransferFee.maximumFee.toString()}`);
    console.log(`   Newer Transfer Fee:`);
    console.log(`     Epoch: ${updatedTransferFeeConfig.newerTransferFee.epoch.toString()}`);
    console.log(`     Fee Basis Points: ${updatedTransferFeeConfig.newerTransferFee.transferFeeBasisPoints}`);
    console.log(`     Max Fee: ${updatedTransferFeeConfig.newerTransferFee.maximumFee.toString()}\n`);

    // Final summary
    console.log('═'.repeat(60));
    console.log('\n🎉 Transfer Fee Update Complete!\n');
    console.log('📊 Summary:');
    console.log(`   Mint Address: ${mintPublicKey.toBase58()}`);
    console.log(`   New Transfer Fee: ${NEW_TRANSFER_FEE_BASIS_POINTS / 100}% (${NEW_TRANSFER_FEE_BASIS_POINTS} basis points)`);
    console.log(`   New Max Transfer Fee: ${NEW_MAX_TRANSFER_FEE.toString()} (${Number(NEW_MAX_TRANSFER_FEE) / 10 ** TOKEN_DECIMALS} tokens)`);
    console.log(`   Transaction Signature: ${signature}\n`);
    console.log('⚠️  Note: Transfer fee changes apply immediately for Token-2022.');

  } catch (error) {
    console.error('\n❌ Error updating transfer fee:');
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack}`);
      }
    } else {
      console.error(`   Unknown error: ${String(error)}`);
    }
    process.exit(1);
  }
}

// Run the script
updateTransferFee()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

