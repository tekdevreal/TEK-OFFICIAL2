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
import mplTokenMetadata from '@metaplex-foundation/mpl-token-metadata';
import * as fs from 'fs';
import { CONFIG } from './config.js';

async function createToken() {
  // Connection
  const connection = new Connection(CONFIG.network[CONFIG.network.current], 'confirmed');
  const umi = createUmi(CONFIG.network[CONFIG.network.current]);
  const {
    createMetadataAccountV3,
    createMetadataAccountV2,
    createMetadataAccount,
  } = mplTokenMetadata?.default ?? mplTokenMetadata;

  // Load admin wallet
  if (!process.env.ADMIN_WALLET_JSON) throw new Error('ADMIN_WALLET_JSON is required');
  const secretKey = Uint8Array.from(JSON.parse(process.env.ADMIN_WALLET_JSON));
  const adminWallet = Keypair.fromSecretKey(secretKey);
  console.log('✅ Admin Wallet Address:', adminWallet.publicKey.toBase58());

  const mintAuthority = Keypair.generate();
  const freezeAuthority = adminWallet.publicKey;

  console.log('\n🚀 Starting Token Creation...\n');
  const payer = adminWallet.publicKey;
  const signer = adminWallet;

  // Step 1: Create Mint
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
  }

  // Step 3: Mint initial supply
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

  // Step 4: Metadata
  const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METAPLEX_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METAPLEX_PROGRAM_ID
  );

  const creators =
    CONFIG.metadata.creators && CONFIG.metadata.creators.length > 0
      ? CONFIG.metadata.creators
      : [{ address: adminWallet.publicKey, verified: true, share: 100 }];

  // Step 5: Send transaction
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

  console.log('✅ Transaction confirmed:', signature);
  console.log(`Solscan: https://solscan.io/tx/${signature}?cluster=${CONFIG.network.current}`);

  // Step 6: Create metadata via Umi (handles version compatibility)
  console.log('📝 Creating metadata via Umi...');
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const umiSigner = createSignerFromKeypair(umi, umiKeypair);
  umi.use(keypairIdentity(umiSigner));

  const umiCreators = creators.map((c) => ({
    address: umiPublicKey(
      typeof c.address === 'string' ? c.address : c.address.toBase58()
    ),
    verified: !!c.verified,
    share: c.share ?? 100,
  }));

  const umiMint = umiPublicKey(mint.toBase58());

  const metadataBuilder =
    (createMetadataAccountV3 &&
      createMetadataAccountV3(umi, {
        mint: umiMint,
        mintAuthority: umiSigner,
        payer: umiSigner,
        updateAuthority: umiSigner,
        data: {
          name: CONFIG.metadata.name,
          symbol: CONFIG.metadata.symbol,
          uri: CONFIG.metadata.uri || CONFIG.metadata.image || '',
          sellerFeeBasisPoints: CONFIG.metadata.sellerFeeBasisPoints,
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
          name: CONFIG.metadata.name,
          symbol: CONFIG.metadata.symbol,
          uri: CONFIG.metadata.uri || CONFIG.metadata.image || '',
          sellerFeeBasisPoints: CONFIG.metadata.sellerFeeBasisPoints,
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
          name: CONFIG.metadata.name,
          symbol: CONFIG.metadata.symbol,
          uri: CONFIG.metadata.uri || CONFIG.metadata.image || '',
          sellerFeeBasisPoints: CONFIG.metadata.sellerFeeBasisPoints,
          creators: umiCreators,
          collection: none(),
          uses: none(),
        },
        isMutable: true,
      }));

  if (!metadataBuilder) {
    throw new Error('No compatible metadata builder found in mpl-token-metadata');
  }

  const metadataTx = await metadataBuilder.sendAndConfirm(umi);

  console.log('✅ Metadata transaction confirmed:', metadataTx);

  // Save token info
  const tokenInfo = {
    mint: mint.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    freezeAuthority: freezeAuthority.toBase58(),
    associatedTokenAccount: associatedTokenAccount.toBase58(),
    decimals: CONFIG.token.decimals,
    initialSupply: CONFIG.token.initialMint.toString(),
    network: CONFIG.network.current,
    transactionSignature: signature,
  };
  fs.writeFileSync('token-info.json', JSON.stringify(tokenInfo, null, 2));
  console.log('💾 Token info saved to token-info.json');
}

// Execute
createToken().catch((err) => {
  console.error('❌ Process failed:', err);
  process.exit(1);
});