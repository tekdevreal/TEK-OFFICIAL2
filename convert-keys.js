// Convert base58 private keys to JSON arrays
// Run: node convert-keys.js

const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Your base58 private keys
const rewardWalletBase58 = '2zL2NLzpdBM8JZdvQTaYYT96PEGKVdZV4JtLj6cPnLNVAvdGfz2DccocuSx9Ckp8tTBWpUFuqfnhKx4ASmnJ2Xoy';
const treasuryWalletBase58 = '2vTeKWE9BEogsiAtvDm5FLhycuNSbsKU1DioCRsnyJNPRQnJ96ewYjWYsr4PetYuCYeEKoJyi9Jw6YXtjSsL5Kjf';

console.log('='.repeat(80));
console.log('Converting Base58 Private Keys to JSON Arrays');
console.log('='.repeat(80));
console.log('');

// Convert Reward Wallet
try {
  const rewardSecretKey = bs58.decode(rewardWalletBase58);
  const rewardJsonArray = Array.from(rewardSecretKey);
  
  // Verify by creating keypair
  const rewardKeypair = Keypair.fromSecretKey(rewardSecretKey);
  
  console.log('✅ Reward Wallet:');
  console.log(`   Expected Address: 6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo`);
  console.log(`   Derived Address:  ${rewardKeypair.publicKey.toBase58()}`);
  console.log(`   Match: ${rewardKeypair.publicKey.toBase58() === '6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo' ? '✅ YES' : '❌ NO'}`);
  console.log(`   Length: ${rewardSecretKey.length} bytes`);
  console.log('');
  console.log('   REWARD_WALLET_PRIVATE_KEY_JSON=');
  console.log(JSON.stringify(rewardJsonArray));
  console.log('');
} catch (error) {
  console.error('❌ Error converting reward wallet:', error.message);
}

console.log('');

// Convert Treasury Wallet
try {
  const treasurySecretKey = bs58.decode(treasuryWalletBase58);
  const treasuryJsonArray = Array.from(treasurySecretKey);
  
  // Verify by creating keypair
  const treasuryKeypair = Keypair.fromSecretKey(treasurySecretKey);
  
  console.log('✅ Treasury Wallet:');
  console.log(`   Expected Address: DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo`);
  console.log(`   Derived Address:  ${treasuryKeypair.publicKey.toBase58()}`);
  console.log(`   Match: ${treasuryKeypair.publicKey.toBase58() === 'DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo' ? '✅ YES' : '❌ NO'}`);
  console.log(`   Length: ${treasurySecretKey.length} bytes`);
  console.log('');
  console.log('   TREASURY_WALLET_PRIVATE_KEY_JSON=');
  console.log(JSON.stringify(treasuryJsonArray));
  console.log('');
} catch (error) {
  console.error('❌ Error converting treasury wallet:', error.message);
}

console.log('='.repeat(80));
console.log('📋 Copy the JSON arrays above and set them in Railway/Render');
console.log('='.repeat(80));
