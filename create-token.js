// create-token.js

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  createUmi,
  createSignerFromKeypair,
  keypairIdentity,
  publicKey as umiPublicKey,
  none,
} from '@metaplex-foundation/umi';
import {
  mplTokenMetadata,
  createMetadataAccountV3,
  createMetadataAccountV2,
  createMetadataAccount,
} from '@metaplex-foundation/mpl-token-metadata';
import * as fs from 'fs';
import { CONFIG } from './config.js';

async function createToken() {
  // Connection (devnet URL should be in CONFIG.network.devnet or equivalent)
  const rpcUrl = CONFIG.network[CONFIG.network.current];
  const connection = new Connection(rpcUrl, 'confirmed');

  // Umi instance with metadata plugin
  const umi = createUmi(rpcUrl).use(mplTokenMetadata());

  // Load admin wallet from env
  if (!process.env.ADMIN_WALLET_JSON) {
    throw new Error('ADMIN_WALLET_JSON is required');
  }
  const secretKey = Uint8Array.from(JSON.parse(process.env.ADMIN_WALLET_JSON));
  const adminWallet = Keypair.fromSecretKey(secretKey);
  console.log('✅ Admin Wallet Address:', adminWallet.publicKey.toBase58());

  const mintAuthority = Keypair.generate();
  const freezeAuthority = adminWallet.publicKey;

  console.log('\n🚀 Starting Token Creation...\n');
  const payer = adminWallet.publicKey;
  const signer = adminWallet;

  console.log('📋 Configuration:');
  console.log(`   Network: ${CONFIG.network.current}`);
  console.log(`   Token Name: ${CONFIG.token.name}`);
  console.log(`   Symbol: ${CONFIG.token.symbol}`);
  console.log(`   Decimals: ${CONFIG.token.decimals}`);
  console.log(`   Initial Supply: ${CONFIG.token.initialMint.toString()}\n`);

  // Step 1: Create Mint (Token-2022)
  console.log('📝 Step 1: Creating Token-2022 mint...');
  const mint = await createMint(
    connection,
    signer,
    mintAuthority.publicKey,
    freezeAuthority,
    CONFIG.token.decimals,
    undefined,
    { programId: TOKEN_2022_PROGRAM_ID }
  );
  console.log('✅ Mint created:', mint.toBase58());

  // Step 2: Get or create ATA
  console.log('📝 Step 2: Setting up Associated Token Account (ATA)...');
  const associatedTokenAccount = getAssociatedTokenAddressSync(
    mint,
    payer,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const ataInfo = await connection.getAccountInfo(associatedTokenAccount);
  const transaction = new Transaction();

  if (!ataInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        payer,
        associatedTokenAccount,
        payer,
        mint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    console.log('✅ ATA created:', associatedTokenAccount.toBase58());
  } else {
    console.log('ℹ️ ATA already exists:', associatedTokenAccount.toBase58());
  }

  // Step 3: Mint initial supply
  console.log('📝 Step 3: Minting initial supply...');
  transaction.add(
    createMintToInstruction(
      mint,
      associatedTokenAccount,
      mintAuthority.publicKey,
      CONFIG.token.initialMint,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  // Step 4: (Legacy) on-chain actions done via web3.js – send token transaction
  console.log('📝 Step 4: Sending token transaction (mint + ATA)...');
  const blockhashInfo = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhashInfo.blockhash;
  transaction.feePayer = payer;
  transaction.sign(signer, mintAuthority);

  const signature = await sendAndConfirmTransaction(connection, transaction, [signer, mintAuthority], {
    commitment: 'confirmed',
    skipPreflight: false,
    maxRetries: 5,
    preflightCommitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });

  console.log('✅ Token transaction confirmed:', signature);
  console.log(`🔗 Solscan: https://solscan.io/tx/${signature}?cluster=${CONFIG.network.current}`);

  // Step 5: Create metadata via Umi (v3 → v2 → legacy fallback)
  console.log('📝 Step 5: Creating metadata via Umi...');

  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const umiSigner = createSignerFromKeypair(umi, umiKeypair);
  umi.use(keypairIdentity(umiSigner));

  const creators =
    CONFIG.metadata.creators && CONFIG.metadata.creators.length > 0
      ? CONFIG.metadata.creators
      : [{ address: adminWallet.publicKey, verified: true, share: 100 }];

  const umiCreators = creators.map((c) => ({
    address: umiPublicKey(typeof c.address === 'string' ? c.address : c.address.toBase58()),
    verified: !!c.verified,
    share: c.share ?? 100,
  }));

  const umiMint = umiPublicKey(mint.toBase58());

  const metadataName = CONFIG.metadata.name;
  const metadataSymbol = CONFIG.metadata.symbol;
  const metadataUri = CONFIG.metadata.uri || CONFIG.metadata.image || '';
  const sellerFeeBasisPoints = CONFIG.metadata.sellerFeeBasisPoints;

  const builder =
    (createMetadataAccountV3 &&
      createMetadataAccountV3(umi, {
        mint: umiMint,
        mintAuthority: umiSigner,
        payer: umiSigner,
        updateAuthority: umiSigner,
        data: {
          name: metadataName,
          symbol: metadataSymbol,
          uri: metadataUri,
          sellerFeeBasisPoints,
          creators: umiCreators,
          collection: none(),
          uses: none(),
          collectionDetails: none(),
        },
        isMutable: true,
      })) ||
    (createMetadataAccountV2 &&
      createMetadataAccountV2(umi, {
        mint: umiMint,
        mintAuthority: umiSigner,
        payer: umiSigner,
        updateAuthority: umiSigner,
        data: {
          name: metadataName,
          symbol: metadataSymbol,
          uri: metadataUri,
          sellerFeeBasisPoints,
          creators: umiCreators,
          collection: none(),
          uses: none(),
        },
        isMutable: true,
      })) ||
    (createMetadataAccount &&
      createMetadataAccount(umi, {
        mint: umiMint,
        mintAuthority: umiSigner,
        payer: umiSigner,
        updateAuthority: umiSigner,
        data: {
          name: metadataName,
          symbol: metadataSymbol,
          uri: metadataUri,
          sellerFeeBasisPoints,
          creators: umiCreators,
          collection: none(),
          uses: none(),
        },
        isMutable: true,
      }));

  if (!builder) {
    throw new Error('No compatible metadata builder found in @metaplex-foundation/mpl-token-metadata');
  }

  const metadataTxSig = await builder.sendAndConfirm(umi);
  console.log('✅ Metadata transaction confirmed:', metadataTxSig);

  // Step 6: Save token info
  console.log('📝 Step 6: Saving token info...');
  const tokenInfo = {
    mint: mint.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    freezeAuthority: freezeAuthority.toBase58(),
    associatedTokenAccount: associatedTokenAccount.toBase58(),
    decimals: CONFIG.token.decimals,
    initialSupply: CONFIG.token.initialMint.toString(),
    network: CONFIG.network.current,
    tokenTransactionSignature: signature,
    metadataTransactionSignature: metadataTxSig,
  };
  fs.writeFileSync('token-info.json', JSON.stringify(tokenInfo, null, 2));
  console.log('💾 Token info saved to token-info.json');

  console.log('\n🎉 Token creation + metadata completed successfully!');
}

// Execute
createToken().catch((err) => {
  console.error('❌ Process failed:', err);
  process.exit(1);
});