/**
 * Activate Transfer Fee by Setting Epoch to Current Epoch
 * 
 * This script activates the Token-2022 transfer fee by updating the newerTransferFee
 * epoch to the current cluster epoch, making the 4% fee take effect immediately.
 * 
 * Root Cause: Transfer fees are epoch-gated. If newerTransferFee.epoch is in the future,
 * the fee will not be enforced until that epoch is reached.
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
  createSetTransferFeeInstruction,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration (overridable via env)
const RPC = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
const MINT_ADDRESS = process.env.TOKEN_MINT || 'DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K';
const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || '6');

// Keep the same fee configuration (4% = 400 basis points)
const TRANSFER_FEE_BASIS_POINTS = 400; // 4%
const MAX_TRANSFER_FEE = BigInt('10000000000000000'); // Keep existing max fee

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
 * Main function to activate transfer fee by setting epoch to current epoch
 */
async function activateTransferFee(): Promise<void> {
  try {
    console.log('\n🚀 Activating Transfer Fee for Token-2022 Mint\n');
    console.log('═'.repeat(80));
    console.log('This will set the transfer fee epoch to the current cluster epoch,');
    console.log('making the 4% fee take effect immediately.\n');
    
    // Step 1: Connect to devnet
    console.log('📡 Step 1: Connecting to Solana Devnet...');
    const connection = new Connection(RPC, 'confirmed');
    const version = await connection.getVersion();
    console.log(`✅ Connected to Devnet (Version: ${version['solana-core']})\n`);

    // Step 2: Get current epoch
    console.log('📊 Step 2: Getting current cluster epoch...');
    const epochInfo = await connection.getEpochInfo('confirmed');
    const currentEpoch = epochInfo.epoch;
    console.log(`✅ Current Epoch: ${currentEpoch}\n`);

    // Step 3: Load admin payer wallet
    console.log('💼 Step 3: Loading admin payer wallet...');
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
    // Convert epoch BigInt to number for comparison
    const feeEpochNum = Number(currentTransferFeeConfig.newerTransferFee.epoch);
    const olderEpochNum = Number(currentTransferFeeConfig.olderTransferFee.epoch);
    
    console.log(`   Older Transfer Fee:`);
    console.log(`     Epoch: ${olderEpochNum}`);
    console.log(`     Fee Basis Points: ${currentTransferFeeConfig.olderTransferFee.transferFeeBasisPoints}`);
    console.log(`   Newer Transfer Fee:`);
    console.log(`     Epoch: ${feeEpochNum} (${feeEpochNum <= currentEpoch ? '✅ ACTIVE' : '⏳ FUTURE - NOT ACTIVE'})`);
    console.log(`     Fee Basis Points: ${currentTransferFeeConfig.newerTransferFee.transferFeeBasisPoints} (${currentTransferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100}%)`);
    console.log(`     Max Fee: ${currentTransferFeeConfig.newerTransferFee.maximumFee.toString()}\n`);

    // Check if fee is already active
    if (feeEpochNum <= currentEpoch) {
      console.log('✅ Transfer fee is already active!');
      console.log(`   Current epoch: ${currentEpoch}`);
      console.log(`   Fee epoch: ${feeEpochNum}`);
      console.log('   No action needed.\n');
      return;
    }

    console.log('⚠️  Transfer fee is NOT active yet (epoch in future)');
    console.log(`   Current epoch: ${currentEpoch}`);
    console.log(`   Fee epoch: ${feeEpochNum}`);
    console.log(`   Epochs until activation: ${feeEpochNum - currentEpoch}\n`);

    // Verify authority
    if (!currentTransferFeeConfig.transferFeeConfigAuthority) {
      throw new Error('Transfer fee config authority is not set');
    }
    
    if (!currentTransferFeeConfig.transferFeeConfigAuthority.equals(adminWallet.publicKey)) {
      throw new Error(
        `Transfer fee config authority mismatch. Expected: ${currentTransferFeeConfig.transferFeeConfigAuthority.toBase58()}, Got: ${adminWallet.publicKey.toBase58()}`
      );
    }

    // Step 5: Build and send transaction to activate transfer fee
    console.log('📝 Step 5: Building transaction to activate transfer fee...');
    console.log('   Action: Setting transfer fee epoch to current epoch');
    console.log(`   Current Epoch: ${currentEpoch}`);
    console.log(`   Fee Basis Points: ${TRANSFER_FEE_BASIS_POINTS} (${TRANSFER_FEE_BASIS_POINTS / 100}%)`);
    console.log(`   Max Transfer Fee: ${MAX_TRANSFER_FEE.toString()} (${Number(MAX_TRANSFER_FEE) / 10 ** TOKEN_DECIMALS} tokens)\n`);
    console.log('   Note: createSetTransferFeeInstruction will set the fee to current epoch automatically.\n');

    const transaction = new Transaction();
    
    // createSetTransferFeeInstruction sets the newerTransferFee epoch to the current epoch
    transaction.add(
      createSetTransferFeeInstruction(
        mintPublicKey,
        adminWallet.publicKey,
        [], // No multi-signers needed
        TRANSFER_FEE_BASIS_POINTS,
        MAX_TRANSFER_FEE,
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Step 6: Send and confirm transaction
    console.log('📤 Step 6: Sending transaction...');
    const blockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.feePayer = adminWallet.publicKey;
    transaction.sign(adminWallet);

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [adminWallet],
      { commitment: 'confirmed' }
    );
    
    console.log(`✅ Transaction confirmed!`);
    console.log(`   Signature: ${signature}\n`);

    // Step 7: Verify the updated transfer fee config
    console.log('🔍 Step 7: Verifying updated transfer fee configuration...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for state update
    
    const updatedMintInfo = await connection.getAccountInfo(mintPublicKey, 'confirmed');
    if (!updatedMintInfo) {
      throw new Error('Failed to fetch updated mint account');
    }
    
    const updatedParsedMint = unpackMint(mintPublicKey, updatedMintInfo, TOKEN_2022_PROGRAM_ID);
    const updatedTransferFeeConfig = getTransferFeeConfig(updatedParsedMint);
    
    if (!updatedTransferFeeConfig) {
      throw new Error('TransferFeeConfig not found after update');
    }
    
    // Get updated epoch info
    const updatedEpochInfo = await connection.getEpochInfo('confirmed');
    const updatedCurrentEpoch = updatedEpochInfo.epoch;
    
    console.log('\n✅ Transfer Fee Configuration Updated Successfully!\n');
    console.log('📊 Updated Transfer Fee Configuration:');
    console.log(`   Transfer Fee Config Authority: ${updatedTransferFeeConfig.transferFeeConfigAuthority?.toBase58() || 'None'}`);
    console.log(`   Withdraw Withheld Authority: ${updatedTransferFeeConfig.withdrawWithheldAuthority?.toBase58() || 'None'}`);
    console.log(`   Older Transfer Fee:`);
    console.log(`     Epoch: ${updatedTransferFeeConfig.olderTransferFee.epoch.toString()}`);
    console.log(`     Fee Basis Points: ${updatedTransferFeeConfig.olderTransferFee.transferFeeBasisPoints}`);
    // Convert updated epoch BigInt to number for comparison
    const updatedFeeEpoch = Number(updatedTransferFeeConfig.newerTransferFee.epoch);
    
    console.log(`   Newer Transfer Fee:`);
    console.log(`     Epoch: ${updatedFeeEpoch} (${updatedFeeEpoch <= updatedCurrentEpoch ? '✅ ACTIVE NOW' : '⏳ Still in future'})`);
    console.log(`     Fee Basis Points: ${updatedTransferFeeConfig.newerTransferFee.transferFeeBasisPoints} (${updatedTransferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100}%)`);
    console.log(`     Max Fee: ${updatedTransferFeeConfig.newerTransferFee.maximumFee.toString()}\n`);

    // Final summary
    console.log('═'.repeat(80));
    console.log('\n🎉 Transfer Fee Activation Complete!\n');
    console.log('📊 Summary:');
    console.log(`   Mint Address: ${mintPublicKey.toBase58()}`);
    console.log(`   Transfer Fee: ${TRANSFER_FEE_BASIS_POINTS / 100}% (${TRANSFER_FEE_BASIS_POINTS} basis points)`);
    console.log(`   Fee Epoch: ${updatedFeeEpoch} (Current: ${updatedCurrentEpoch})`);
    console.log(`   Status: ${updatedFeeEpoch <= updatedCurrentEpoch ? '✅ ACTIVE' : '⏳ Pending'}`);
    console.log(`   Transaction Signature: ${signature}\n`);
    
    if (updatedFeeEpoch <= updatedCurrentEpoch) {
      console.log('✅ Transfer fee is now ACTIVE!');
      console.log('   - All transfers (wallet-to-wallet and DEX swaps) will now incur 4% fee');
      console.log('   - Fees will be withheld and can be harvested');
      console.log('   - Backend scheduler will collect and distribute fees\n');
    } else {
      console.log('⚠️  Transfer fee is still pending activation');
      console.log(`   Epochs until activation: ${updatedFeeEpoch - updatedCurrentEpoch}\n`);
    }

  } catch (error) {
    console.error('\n❌ Error activating transfer fee:');
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
activateTransferFee()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

