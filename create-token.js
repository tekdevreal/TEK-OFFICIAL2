// create-token.js
// Token-2022 mint + ATA + Metaplex metadata using Umi (Railway-ready, ESM)

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
import { createUmi } from '@metaplex-foundation/umi';
import {
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
  // ---------------------------------------------------------------------------
  // 1. Setup connections (web3 + Umi) and load admin wallet
  // ---------------------------------------------------------------------------
  const rpcUrl = CONFIG.network[CONFIG.network.current];
  const connection = new Connection(rpcUrl, 'confirmed');

  const umi = createUmi(rpcUrl).use(mplTokenMetadata());

  if (!process.env.ADMIN_WALLET_JSON) {
    throw new Error('ADMIN_WALLET_JSON environment variable is required');
  }

  const secretKey = Uint8Array.from(JSON.parse(process.env.ADMIN_WALLET_JSON));
  const adminWallet = Keypair.fromSecretKey(secretKey);
  console.log('✅ Admin Wallet Address:', adminWallet.publicKey.toBase58());

  const mintAuthority = Keypair.generate();
  const freezeAuthority = adminWallet.publicKey;

  console.log('\n🚀 Starting Token Creation...\n');
  console.log('📋 Configuration:');
  console.log(`   Network: ${CONFIG.network.current}`);
  console.log(`   Token Name: ${CONFIG.token.name}`);
  console.log(`   Symbol: ${CONFIG.token.symbol}`);
  console.log(`   Decimals: ${CONFIG.token.decimals}`);
  console.log(`   Initial Supply: ${CONFIG.token.initialMint.toString()}\n`);

  const payer = adminWallet.publicKey;
  const signer = adminWallet;

  // ---------------------------------------------------------------------------
  // 2. Create Token-2022 mint
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 3. Get or create Associated Token Account (ATA)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 4. Mint initial supply
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 5. Send token transaction (mint + ATA)
  // ---------------------------------------------------------------------------
  console.log('📝 Step 4: Sending token transaction (mint + ATA)...');
  const blockhashInfo = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhashInfo.blockhash;
  transaction.feePayer = payer;
  transaction.sign(signer, mintAuthority);

  const tokenTxSig = await sendAndConfirmTransaction(connection, transaction, [signer, mintAuthority], {
    commitment: 'confirmed',
    skipPreflight: false,
    maxRetries: 5,
    preflightCommitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });

  console.log('✅ Token transaction confirmed:', tokenTxSig);
  console.log(`🔗 Token Tx (Solscan): https://solscan.io/tx/${tokenTxSig}?cluster=${CONFIG.network.current}`);

  // ---------------------------------------------------------------------------
  // 6. Create metadata via Umi (v3 → v2 → legacy fallback)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 7. Save token info
  // ---------------------------------------------------------------------------
  console.log('📝 Step 6: Saving token info to token-info.json...');
  const tokenInfo = {
    mint: mint.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    freezeAuthority: freezeAuthority.toBase58(),
    associatedTokenAccount: associatedTokenAccount.toBase58(),
    decimals: CONFIG.token.decimals,
    initialSupply: CONFIG.token.initialMint.toString(),
    network: CONFIG.network.current,
    tokenTransactionSignature: tokenTxSig,
    metadataTransactionSignature: metadataTxSig,
  };
  fs.writeFileSync('token-info.json', JSON.stringify(tokenInfo, null, 2));
  console.log('💾 Token info saved to token-info.json');

  console.log('\n🎉 Token-2022 mint + metadata creation completed successfully!');
}

// Execute
createToken().catch((err) => {
  console.error('❌ Process failed:', err);
  process.exit(1);
});