/**
 * Diagnostic Script: SOL Distribution Analysis
 * 
 * This script checks:
 * 1. Current reward wallet SOL balance
 * 2. Last swap amounts and distributions
 * 3. Whether distributions match swap proceeds
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const REWARD_WALLET_ADDRESS = process.env.REWARD_WALLET_ADDRESS || '6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo';
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const STATE_FILE_PATH = path.join(process.cwd(), 'reward-state.json');

async function diagnose() {
  console.log('=== SOL Distribution Diagnostic ===\n');
  
  // 1. Check reward wallet balance
  console.log('1. Checking reward wallet balance...');
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const rewardWalletPubkey = new PublicKey(REWARD_WALLET_ADDRESS);
  const balance = await connection.getBalance(rewardWalletPubkey);
  const balanceSOL = balance / LAMPORTS_PER_SOL;
  
  console.log(`   Reward Wallet: ${REWARD_WALLET_ADDRESS}`);
  console.log(`   Current Balance: ${balanceSOL.toFixed(6)} SOL (${balance} lamports)`);
  console.log('');
  
  // 2. Load state file
  console.log('2. Checking state file...');
  if (!fs.existsSync(STATE_FILE_PATH)) {
    console.log(`   ❌ State file not found: ${STATE_FILE_PATH}`);
    console.log('   This is normal if the backend hasn\'t run yet.');
    return;
  }
  
  const stateData = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
  const state = JSON.parse(stateData);
  
  if (!state.taxState) {
    console.log('   ⚠️  No tax state found in state file.');
    return;
  }
  
  const taxState = state.taxState;
  
  // 3. Analyze tax state
  console.log('3. Tax State Analysis:');
  console.log(`   Total NUKE Harvested: ${taxState.totalNukeHarvested || '0'}`);
  console.log(`   Total NUKE Sold: ${taxState.totalNukeSold || '0'}`);
  console.log('');
  
  // Convert BigInt strings to SOL
  const totalSolDistributed = BigInt(taxState.totalSolDistributed || '0');
  const totalSolToTreasury = BigInt(taxState.totalSolToTreasury || '0');
  const totalSolDistributedHuman = Number(totalSolDistributed) / LAMPORTS_PER_SOL;
  const totalSolToTreasuryHuman = Number(totalSolToTreasury) / LAMPORTS_PER_SOL;
  const totalSolFromSwaps = totalSolDistributedHuman + totalSolToTreasuryHuman;
  
  console.log(`   Total SOL Distributed to Holders: ${totalSolDistributedHuman.toFixed(6)} SOL`);
  console.log(`   Total SOL to Treasury: ${totalSolToTreasuryHuman.toFixed(6)} SOL`);
  console.log(`   Total SOL from Swaps: ${totalSolFromSwaps.toFixed(6)} SOL`);
  console.log('');
  
  console.log(`   Last Swap Tx: ${taxState.lastSwapTx || 'N/A'}`);
  console.log(`   Last Distribution Tx: ${taxState.lastDistributionTx || 'N/A'}`);
  console.log(`   Last Distribution Time: ${taxState.lastDistributionTime ? new Date(taxState.lastDistributionTime).toISOString() : 'N/A'}`);
  console.log('');
  
  // 4. Recent distributions
  if (taxState.taxDistributions && taxState.taxDistributions.length > 0) {
    console.log('4. Recent Distributions (last 5):');
    const recent = taxState.taxDistributions.slice(-5);
    
    for (const dist of recent) {
      const rewardAmountLamports = BigInt(dist.rewardAmount || '0');
      const treasuryAmountLamports = BigInt(dist.treasuryAmount || '0');
      const rewardSOL = Number(rewardAmountLamports) / LAMPORTS_PER_SOL;
      const treasurySOL = Number(treasuryAmountLamports) / LAMPORTS_PER_SOL;
      const totalDistributed = rewardSOL + treasurySOL;
      
      console.log(`   - Time: ${new Date(dist.timestamp).toISOString()}`);
      console.log(`     SOL to Holders: ${rewardSOL.toFixed(6)} SOL`);
      console.log(`     SOL to Treasury: ${treasurySOL.toFixed(6)} SOL`);
      console.log(`     Total from Swap: ${totalDistributed.toFixed(6)} SOL`);
      console.log(`     Swap Tx: ${dist.rewardSignature || 'N/A'}`);
      console.log('');
    }
  } else {
    console.log('4. No distributions found yet.');
  }
  
  // 5. Analysis
  console.log('5. Analysis:');
  console.log(`   Current wallet balance: ${balanceSOL.toFixed(6)} SOL`);
  console.log(`   Total distributed historically: ${totalSolDistributedHuman.toFixed(6)} SOL`);
  console.log('');
  
  if (balanceSOL > 2) {
    console.log(`   ⚠️  WARNING: Wallet has ${balanceSOL.toFixed(6)} SOL`);
    console.log('   This is more than expected for operational costs (0.5-1 SOL).');
    console.log('   Possible reasons:');
    console.log('   1. Multiple swaps completed but distributions are below payout threshold');
    console.log('   2. Manual SOL deposits for operational costs');
    console.log('   3. SOL rollover from failed distributions');
  } else if (balanceSOL < 0.1) {
    console.log(`   ⚠️  WARNING: Wallet has only ${balanceSOL.toFixed(6)} SOL`);
    console.log('   This may not be enough for operational costs.');
    console.log('   Recommended: Add 0.5-1 SOL for transaction fees and ATA creation.');
  } else {
    console.log('   ✅ Wallet balance is within expected range for operational costs.');
  }
  console.log('');
  
  // 6. Check if distributions are matching swaps
  console.log('6. Distribution vs Swap Match:');
  if (taxState.taxDistributions && taxState.taxDistributions.length > 0) {
    const lastDist = taxState.taxDistributions[taxState.taxDistributions.length - 1];
    const rewardAmountLamports = BigInt(lastDist.rewardAmount || '0');
    const treasuryAmountLamports = BigInt(lastDist.treasuryAmount || '0');
    const totalDistributed = Number(rewardAmountLamports + treasuryAmountLamports) / LAMPORTS_PER_SOL;
    
    console.log(`   Last distribution: ${totalDistributed.toFixed(6)} SOL total`);
    console.log(`   This should equal 100% of the last NUKE→SOL swap.`);
    console.log('');
    
    // Check the 75/25 split
    const rewardSOL = Number(rewardAmountLamports) / LAMPORTS_PER_SOL;
    const treasurySOL = Number(treasuryAmountLamports) / LAMPORTS_PER_SOL;
    const rewardPercent = (rewardSOL / totalDistributed) * 100;
    const treasuryPercent = (treasurySOL / totalDistributed) * 100;
    
    console.log(`   Split: ${rewardPercent.toFixed(1)}% to holders, ${treasuryPercent.toFixed(1)}% to treasury`);
    if (Math.abs(rewardPercent - 75) < 1 && Math.abs(treasuryPercent - 25) < 1) {
      console.log('   ✅ Split ratio is correct (75/25).');
    } else {
      console.log('   ⚠️  Split ratio is incorrect. Expected 75/25.');
    }
  }
  
  console.log('\n=== Diagnostic Complete ===');
}

diagnose().catch(console.error);
