/**
 * Comprehensive Reward System Diagnostic
 * 
 * Checks all components of the reward system to identify issues
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getAccount,
  getAssociatedTokenAddressSync,
  unpackMint,
  getTransferFeeConfig,
  getTransferFeeAmount,
  unpackAccount,
} from '@solana/spl-token';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const RPC = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
const MINT_ADDRESS = process.env.TOKEN_MINT || 'DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K';
const REWARD_WALLET = process.env.REWARD_WALLET_ADDRESS || '6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo';
const TREASURY_WALLET = process.env.TREASURY_WALLET_ADDRESS || 'DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo';
const RAYDIUM_POOL_ID = process.env.RAYDIUM_POOL_ID || '4U8vs7wMVNijhjJsxBUA2JAif47QJcfBN97RKVRk7XQs';

async function diagnoseRewardSystem() {
  console.log('\n🔍 REWARD SYSTEM COMPREHENSIVE DIAGNOSTIC\n');
  console.log('═'.repeat(80));
  
  const connection = new Connection(RPC, 'confirmed');
  const mintPublicKey = new PublicKey(MINT_ADDRESS);
  const rewardWalletPublicKey = new PublicKey(REWARD_WALLET);
  const treasuryWalletPublicKey = new PublicKey(TREASURY_WALLET);
  const poolIdPublicKey = new PublicKey(RAYDIUM_POOL_ID);

  try {
    // 1. Check Connection
    console.log('\n📡 1. CONNECTION CHECK');
    console.log('─'.repeat(80));
    const version = await connection.getVersion();
    console.log(`✅ Connected to: ${RPC}`);
    console.log(`   Solana Version: ${version['solana-core']}`);

    // 2. Check Mint Configuration
    console.log('\n🪙 2. MINT CONFIGURATION');
    console.log('─'.repeat(80));
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintInfo) {
      console.log('❌ Mint account not found!');
      return;
    }
    
    const parsedMint = unpackMint(mintPublicKey, mintInfo, TOKEN_2022_PROGRAM_ID);
    const transferFeeConfig = getTransferFeeConfig(parsedMint);
    
    if (!transferFeeConfig) {
      console.log('❌ No transfer fee configuration found on mint!');
      console.log('   Transfer fees are required for tax collection.');
      return;
    }
    
    console.log(`✅ Mint: ${MINT_ADDRESS}`);
    console.log(`✅ Transfer Fee: ${transferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100}%`);
    console.log(`✅ Max Fee: ${transferFeeConfig.newerTransferFee.maximumFee.toString()}`);
    console.log(`✅ Transfer Fee Config Authority: ${transferFeeConfig.transferFeeConfigAuthority?.toBase58() || 'None'}`);
    console.log(`✅ Withdraw Withheld Authority: ${transferFeeConfig.withdrawWithheldAuthority?.toBase58() || 'None'}`);
    console.log(`✅ Mint Withheld Amount: ${transferFeeConfig.withheldAmount?.toString() || '0'}`);
    
    const mintWithheldHuman = transferFeeConfig.withheldAmount 
      ? (Number(transferFeeConfig.withheldAmount) / Math.pow(10, parsedMint.decimals)).toFixed(6)
      : '0.000000';
    console.log(`   Mint Withheld (Human): ${mintWithheldHuman} NUKE`);
    
    // Check if reward wallet is the withdraw authority
    const withdrawAuthority = transferFeeConfig.withdrawWithheldAuthority;
    if (!withdrawAuthority || !withdrawAuthority.equals(rewardWalletPublicKey)) {
      console.log(`\n⚠️  WARNING: Reward wallet is NOT the withdraw authority!`);
      console.log(`   Current Authority: ${withdrawAuthority?.toBase58() || 'None'}`);
      console.log(`   Reward Wallet: ${REWARD_WALLET}`);
      console.log(`   Action: Run setWithdrawAuthority.ts to fix this`);
    } else {
      console.log(`✅ Reward wallet IS the withdraw authority`);
    }

    // 3. Check Reward Wallet
    console.log('\n💰 3. REWARD WALLET');
    console.log('─'.repeat(80));
    const rewardWalletBalance = await connection.getBalance(rewardWalletPublicKey);
    console.log(`✅ Reward Wallet: ${REWARD_WALLET}`);
    console.log(`   SOL Balance: ${(rewardWalletBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    
    const rewardNukeAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      rewardWalletPublicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    try {
      const rewardNukeAccountInfo = await getAccount(connection, rewardNukeAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const rewardNukeBalance = rewardNukeAccountInfo.amount;
      const rewardNukeHuman = (Number(rewardNukeBalance) / Math.pow(10, parsedMint.decimals)).toFixed(6);
      console.log(`   NUKE Balance: ${rewardNukeHuman} NUKE (${rewardNukeBalance.toString()} raw)`);
    } catch (error) {
      console.log(`   NUKE Balance: 0 NUKE (account doesn't exist or has no balance)`);
    }

    // 4. Check Treasury Wallet
    console.log('\n🏛️  4. TREASURY WALLET');
    console.log('─'.repeat(80));
    const treasuryWalletBalance = await connection.getBalance(treasuryWalletPublicKey);
    console.log(`✅ Treasury Wallet: ${TREASURY_WALLET}`);
    console.log(`   SOL Balance: ${(treasuryWalletBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

    // 5. Check Token Accounts for Withheld Fees
    console.log('\n📊 5. TOKEN ACCOUNTS WITH WITHHELD FEES');
    console.log('─'.repeat(80));
    
    const tokenAccounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: mintPublicKey.toBase58(),
          },
        },
      ],
    });
    
    console.log(`   Total Token Accounts: ${tokenAccounts.length}`);
    
    let totalWithheldInAccounts = 0n;
    let accountsWithWithheld = 0;
    const accountsToCheck = tokenAccounts.slice(0, 50); // Check first 50
    
    for (const { pubkey, account } of accountsToCheck) {
      try {
        const parsedAccount = unpackAccount(pubkey, account, TOKEN_2022_PROGRAM_ID);
        if (!parsedAccount.mint.equals(mintPublicKey)) continue;
        
        const transferFeeAmount = getTransferFeeAmount(parsedAccount);
        if (transferFeeAmount && transferFeeAmount.withheldAmount > 0n) {
          totalWithheldInAccounts += transferFeeAmount.withheldAmount;
          accountsWithWithheld++;
          const withheldHuman = (Number(transferFeeAmount.withheldAmount) / Math.pow(10, parsedMint.decimals)).toFixed(6);
          console.log(`   📌 ${pubkey.toBase58().substring(0, 16)}... : ${withheldHuman} NUKE`);
        }
      } catch (error) {
        // Skip accounts that can't be parsed
      }
    }
    
    const totalWithheldHuman = (Number(totalWithheldInAccounts) / Math.pow(10, parsedMint.decimals)).toFixed(6);
    console.log(`\n   Accounts with withheld fees: ${accountsWithWithheld}`);
    console.log(`   Total withheld in accounts: ${totalWithheldHuman} NUKE`);
    console.log(`   Total withheld in mint: ${mintWithheldHuman} NUKE`);
    console.log(`   Grand Total Available: ${(Number(totalWithheldInAccounts + (transferFeeConfig.withheldAmount || 0n)) / Math.pow(10, parsedMint.decimals)).toFixed(6)} NUKE`);

    // 6. Check Raydium Pool
    console.log('\n🔄 6. RAYDIUM POOL CONFIGURATION');
    console.log('─'.repeat(80));
    console.log(`✅ Pool ID: ${RAYDIUM_POOL_ID}`);
    
    try {
      const poolAccount = await connection.getAccountInfo(poolIdPublicKey);
      if (poolAccount) {
        console.log(`✅ Pool account exists`);
        console.log(`   Account Owner: ${poolAccount.owner.toBase58()}`);
        console.log(`   Account Data Length: ${poolAccount.data.length} bytes`);
      } else {
        console.log(`❌ Pool account not found!`);
        console.log(`   This will prevent swaps from working.`);
      }
    } catch (error) {
      console.log(`⚠️  Error checking pool: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 7. Critical Issue Check
    console.log('\n🚨 7. CRITICAL ISSUES');
    console.log('─'.repeat(80));
    
    const issues: string[] = [];
    
    if (!transferFeeConfig) {
      issues.push('❌ No transfer fee configuration on mint');
    }
    
    if (!withdrawAuthority || !withdrawAuthority.equals(rewardWalletPublicKey)) {
      issues.push('❌ Reward wallet is not the withdraw authority');
    }
    
    if (rewardWalletBalance < 0.01 * LAMPORTS_PER_SOL) {
      issues.push('⚠️  Reward wallet has low SOL balance (< 0.01 SOL)');
    }
    
    const totalAvailable = totalWithheldInAccounts + (transferFeeConfig?.withheldAmount || 0n);
    if (totalAvailable === 0n) {
      issues.push('⚠️  No withheld tokens found (no tax collected yet)');
      issues.push('   NOTE: DEX swaps may NOT trigger Token-2022 transfer fees!');
      issues.push('   Transfer fees are only collected on direct transfer/transferChecked instructions.');
    }
    
    if (issues.length === 0) {
      console.log('✅ No critical issues found!');
    } else {
      issues.forEach(issue => console.log(`   ${issue}`));
    }

    // 8. Recommendations
    console.log('\n💡 8. RECOMMENDATIONS');
    console.log('─'.repeat(80));
    
    if (totalAvailable === 0n) {
      console.log('   1. Test with a DIRECT token transfer (not a DEX swap)');
      console.log('      Transfer fees are only collected on direct transfers');
      console.log('      DEX swaps use swap instructions that bypass transfer fees');
      console.log('');
      console.log('   2. To test tax collection:');
      console.log('      - Send NUKE tokens directly from one wallet to another');
      console.log('      - Use transferChecked instruction (required for Token-2022)');
      console.log('      - Check if withheld fees appear in token accounts');
    }
    
    if (!withdrawAuthority || !withdrawAuthority.equals(rewardWalletPublicKey)) {
      console.log('   3. Run setWithdrawAuthority.ts to set reward wallet as authority');
    }
    
    if (rewardWalletBalance < 0.01 * LAMPORTS_PER_SOL) {
      console.log('   4. Fund reward wallet with SOL for transaction fees');
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ Diagnostic Complete\n');
    
  } catch (error) {
    console.error('\n❌ Diagnostic failed:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

diagnoseRewardSystem()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

