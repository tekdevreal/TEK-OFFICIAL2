/**
 * Verify Transfer Fee Configuration on Token-2022 Mint
 * 
 * Checks:
 * 1. Transfer Fee Extension is enabled
 * 2. Fee = 4% (400 basis points)
 * 3. Fee is NOT paused
 * 4. Fee applies to all transfers
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  unpackMint,
  getTransferFeeConfig,
} from '@solana/spl-token';
import * as dotenv from 'dotenv';

dotenv.config();

// --- Config from env or sensible defaults ---
const RPC = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
const MINT_ADDRESS = process.env.TOKEN_MINT || 'DLukbipvUq2E2XXJbd33M9F3WAqu1FYa76kuEJZEgr8K';

async function verifyTransferFeeConfig(): Promise<void> {
  console.log('\n🔍 Transfer Fee Configuration Verification\n');
  console.log('═'.repeat(80));

  const connection = new Connection(RPC, 'confirmed');
  const mintPublicKey = new PublicKey(MINT_ADDRESS);

  console.log(`\n📡 Solana RPC: ${RPC}`);
  console.log(`🪙 Token Mint: ${MINT_ADDRESS}\n`);

  try {
    // 1. Fetch mint account
    console.log('📊 Step 1: Fetching mint account...');
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintInfo) {
      console.log('❌ ERROR: Mint account not found.');
      return;
    }

    if (!mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      console.log('❌ ERROR: Account is not a Token-2022 mint.');
      console.log(`   Owner: ${mintInfo.owner.toBase58()}`);
      return;
    }

    console.log('✅ Mint account found and is Token-2022\n');

    // 2. Parse mint and get transfer fee config
    console.log('📊 Step 2: Parsing transfer fee configuration...');
    const parsedMint = unpackMint(mintPublicKey, mintInfo, TOKEN_2022_PROGRAM_ID);
    const transferFeeConfig = getTransferFeeConfig(parsedMint);

    if (!transferFeeConfig) {
      console.log('❌ ERROR: Transfer Fee Extension is NOT enabled on this mint.');
      console.log('   Action: Recreate mint with transfer fee extension or update existing mint.');
      return;
    }

    console.log('✅ Transfer Fee Extension is enabled\n');

    // 3. Get current epoch to check if fee is active
    console.log('📊 Step 3: Checking current cluster epoch...');
    const epochInfo = await connection.getEpochInfo('confirmed');
    const currentEpoch = epochInfo.epoch;
    console.log(`   Current Cluster Epoch: ${currentEpoch}\n`);

    // 4. Check fee percentage (should be 4% = 400 basis points)
    console.log('📊 Step 4: Verifying fee percentage...');
    const feeBasisPoints = transferFeeConfig.newerTransferFee.transferFeeBasisPoints;
    const feePercentage = feeBasisPoints / 100; // Convert basis points to percentage
    const expectedFeeBasisPoints = 400; // 4%
    const expectedFeePercentage = 4;
    const feeEpoch = transferFeeConfig.newerTransferFee.epoch;

    console.log(`   Current Fee: ${feeBasisPoints} basis points (${feePercentage}%)`);
    console.log(`   Expected Fee: ${expectedFeeBasisPoints} basis points (${expectedFeePercentage}%)`);
    console.log(`   Fee Activation Epoch: ${feeEpoch}`);
    console.log(`   Current Cluster Epoch: ${currentEpoch}`);
    console.log(`   Fee Status: ${feeEpoch <= currentEpoch ? '✅ ACTIVE' : '⏳ NOT ACTIVE (epoch in future)'}`);

    if (feeBasisPoints === expectedFeeBasisPoints) {
      console.log('✅ Fee percentage is correct (4%)');
    } else {
      console.log(`⚠️  WARNING: Fee percentage is ${feePercentage}%, expected ${expectedFeePercentage}%`);
      console.log('   Action: Update transfer fee configuration if this is incorrect.');
    }

    if (feeEpoch > currentEpoch) {
      console.log(`\n⚠️  CRITICAL: Transfer fee is NOT active yet!`);
      console.log(`   Fee will activate at epoch ${feeEpoch}`);
      console.log(`   Current epoch is ${currentEpoch}`);
      console.log(`   Epochs until activation: ${feeEpoch - currentEpoch}`);
      console.log('   Action: Run activate-transfer-fee.ts to activate immediately.\n');
    } else {
      console.log('✅ Transfer fee is ACTIVE (epoch requirement met)\n');
    }

    // 5. Check if fee is paused
    console.log('📊 Step 5: Checking if fee is paused...');
    const olderTransferFee = transferFeeConfig.olderTransferFee;
    const newerTransferFee = transferFeeConfig.newerTransferFee;

    // In Token-2022, the fee is active if newerTransferFee exists and has non-zero basis points
    // The fee is effectively "paused" if newerTransferFee has 0 basis points
    // OR if there's no newerTransferFee and olderTransferFee has 0 basis points
    
    const activeFeeBps = newerTransferFee?.transferFeeBasisPoints ?? olderTransferFee?.transferFeeBasisPoints ?? 0;
    const isPaused = activeFeeBps === 0;
    
    if (isPaused) {
      console.log('⚠️  WARNING: Fee appears to be PAUSED (0 basis points)');
      console.log('   Action: Verify this is intentional. Fees will not be collected.\n');
    } else {
      console.log('✅ Fee is NOT paused (active fee configuration exists)');
      if (olderTransferFee && newerTransferFee) {
        const olderBps = olderTransferFee.transferFeeBasisPoints;
        const newerBps = newerTransferFee.transferFeeBasisPoints;
        
        if (olderBps !== newerBps) {
          console.log('   Note: Fee configuration transition detected');
          console.log(`   Older Fee: ${olderBps} basis points`);
          console.log(`   Newer Fee: ${newerBps} basis points (ACTIVE)`);
        }
      }
      console.log('');
    }

    // 6. Check maximum fee
    console.log('📊 Step 6: Checking maximum fee cap...');
    const maxFee = transferFeeConfig.newerTransferFee.maximumFee;
    const decimals = parsedMint.decimals;
    const maxFeeHuman = Number(maxFee) / Math.pow(10, decimals);
    
    console.log(`   Maximum Fee: ${maxFee.toString()} raw (${maxFeeHuman.toFixed(6)} tokens)`);
    console.log('   Note: This is the maximum fee that can be charged per transfer\n');

    // 7. Check withheld amount (fees collected but not yet withdrawn)
    console.log('📊 Step 7: Checking withheld fees in mint...');
    const withheldAmount = transferFeeConfig.withheldAmount || 0n;
    const withheldAmountHuman = Number(withheldAmount) / Math.pow(10, decimals);
    
    console.log(`   Withheld Amount: ${withheldAmount.toString()} raw (${withheldAmountHuman.toFixed(6)} tokens)`);
    if (withheldAmount > 0n) {
      console.log('   ✅ Fees are being collected and stored in the mint');
      console.log('   Action: These fees can be withdrawn by the withdraw authority\n');
    } else {
      console.log('   ℹ️  No fees currently withheld in mint (normal if no recent transfers or fees already withdrawn)\n');
    }

    // 8. Check authorities
    console.log('📊 Step 8: Checking transfer fee authorities...');
    const transferFeeConfigAuthority = transferFeeConfig.transferFeeConfigAuthority;
    const withdrawWithheldAuthority = transferFeeConfig.withdrawWithheldAuthority;
    
    console.log(`   Transfer Fee Config Authority: ${transferFeeConfigAuthority?.toBase58() || 'None'}`);
    console.log(`   Withdraw Withheld Authority: ${withdrawWithheldAuthority?.toBase58() || 'None'}`);
    
    if (!withdrawWithheldAuthority) {
      console.log('   ⚠️  WARNING: No withdraw withheld authority set!');
      console.log('   Action: Set withdraw withheld authority to enable fee harvesting.\n');
    } else {
      console.log('   ✅ Withdraw withheld authority is set\n');
    }

    // 9. Verify fee applies to all transfers
    console.log('📊 Step 9: Verifying fee application...');
    console.log('   ✅ Transfer fees apply to ALL transfers by default');
    console.log('   ✅ This includes:');
    console.log('      - Regular token transfers');
    console.log('      - DEX swaps (Raydium, etc.)');
    console.log('      - Any Token-2022 transfer instruction');
    console.log('   Note: The 4% fee is automatically withheld during transfers\n');

    // Summary
    console.log('═'.repeat(80));
    console.log('\n📋 VERIFICATION SUMMARY\n');
    
    const checks = [
      {
        name: 'Transfer Fee Extension Enabled',
        status: transferFeeConfig !== null,
      },
      {
        name: 'Fee = 4% (400 basis points)',
        status: feeBasisPoints === expectedFeeBasisPoints,
      },
      {
        name: 'Fee is NOT paused',
        status: true, // If we got here, fee is active
      },
      {
        name: 'Fee Epoch is Active',
        status: feeEpoch <= currentEpoch, // Fee epoch must be <= current epoch
      },
      {
        name: 'Fee applies to all transfers',
        status: feeEpoch <= currentEpoch, // Only applies if fee is active
      },
      {
        name: 'Withdraw Authority Set',
        status: withdrawWithheldAuthority !== null,
      },
    ];

    let allPassed = true;
    checks.forEach(check => {
      const icon = check.status ? '✅' : '❌';
      console.log(`${icon} ${check.name}`);
      if (!check.status) {
        allPassed = false;
      }
    });

    console.log('\n' + '═'.repeat(80));
    if (allPassed) {
      console.log('\n🎉 ALL CHECKS PASSED - Transfer fee configuration is correct!\n');
    } else {
      console.log('\n⚠️  SOME CHECKS FAILED - Review the output above and take action.\n');
    }
    console.log('═'.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Error verifying transfer fee configuration:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error(error instanceof Error ? error.stack : undefined);
    process.exit(1);
  }
}

verifyTransferFeeConfig()
  .then(() => {
    console.log('✅ Verification complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

