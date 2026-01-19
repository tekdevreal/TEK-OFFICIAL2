/**
 * Script to check the withdraw withheld authority for the token mint
 * This helps diagnose why tax harvesting might not be working
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getMint, unpackMint, getTransferFeeConfig } from '@solana/spl-token';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
const MINT_ADDRESS = process.env.TOKEN_MINT || 'DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K';
const REWARD_WALLET = process.env.REWARD_WALLET_ADDRESS || '6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo';

async function checkMintAuthority() {
  try {
    console.log('\n🔍 Checking Token-2022 Mint Authority\n');
    console.log('═'.repeat(60));
    
    const connection = new Connection(RPC, 'confirmed');
    const mintPublicKey = new PublicKey(MINT_ADDRESS);
    const rewardWalletPublicKey = new PublicKey(REWARD_WALLET);
    
    console.log(`\n📡 Connected to: ${RPC}`);
    console.log(`🪙 Mint: ${MINT_ADDRESS}`);
    console.log(`💰 Reward Wallet: ${REWARD_WALLET}\n`);
    
    // Get mint account
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintInfo) {
      throw new Error('Mint account not found');
    }
    
    // Parse mint
    const parsedMint = unpackMint(mintPublicKey, mintInfo, TOKEN_2022_PROGRAM_ID);
    const transferFeeConfig = getTransferFeeConfig(parsedMint);
    
    if (!transferFeeConfig) {
      console.log('❌ No transfer fee config found on mint');
      return;
    }
    
    console.log('\n📊 Transfer Fee Configuration:');
    console.log(`   Transfer Fee Config Authority: ${transferFeeConfig.transferFeeConfigAuthority?.toBase58() || 'None'}`);
    console.log(`   Withdraw Withheld Authority: ${transferFeeConfig.withdrawWithheldAuthority?.toBase58() || 'None'}`);
    console.log(`   Fee Basis Points: ${transferFeeConfig.newerTransferFee.transferFeeBasisPoints} (${transferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100}%)`);
    console.log(`   Max Fee: ${transferFeeConfig.newerTransferFee.maximumFee.toString()}\n`);
    
    // Check if reward wallet is the withdraw authority
    const withdrawAuthority = transferFeeConfig.withdrawWithheldAuthority;
    if (!withdrawAuthority) {
      console.log('❌ ERROR: No withdraw withheld authority is set!');
      console.log('   Tax harvesting will NOT work until this is set.\n');
      return;
    }
    
    if (withdrawAuthority.equals(rewardWalletPublicKey)) {
      console.log('✅ SUCCESS: Reward wallet IS the withdraw withheld authority');
      console.log('   Tax harvesting should work correctly.\n');
    } else {
      console.log('⚠️  WARNING: Reward wallet is NOT the withdraw withheld authority');
      console.log(`   Current authority: ${withdrawAuthority.toBase58()}`);
      console.log(`   Expected authority: ${REWARD_WALLET}`);
      console.log('   Tax harvesting will fail with "insufficient authority" error.\n');
      console.log('   SOLUTION: Update the withdraw withheld authority to the reward wallet.');
      console.log('   Use the updateTransferFee script or create a new script to update it.\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

checkMintAuthority();

