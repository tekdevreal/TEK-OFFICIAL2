// create-token.js

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { createUmi, defaultBundle } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, createSignerFromKeypair, publicKey as umiPublicKey, none } from '@metaplex-foundation/umi';
import { createMetadataAccountV3 } from '@metaplex-foundation/mpl-token-metadata';
import * as fs from 'fs';
import { CONFIG } from './config.js';

async function createToken() {
  // Connection
  const connection = new Connection(CONFIG.network[CONFIG.network.current], 'confirmed');
  const umi = createUmi(CONFIG.network[CONFIG.network.current], defaultBundle());

  // Load admin wallet
  if (!process.env.ADMIN_WALLET_JSON) throw new Error('ADMIN_WALLET_JSON is required');
  const secretKey = Uint8Array.from(JSON.parse(process.env.ADMIN_WALLET_JSON));
  const adminWallet = Keypair.fromSecretKey(secretKey);
  console.log('✅ Admin Wallet Address:', adminWallet.publicKey.toBase58());

  const mintAuthority = Keypair.generate();
  const freezeAuthority = adminWallet.publicKey;
  const payer = adminWallet.publicKey;

  console.log('\n🚀 Starting Token Creation...\n');

  // Step 1: Create Mint
  const mint = await createMint(
    connection,
    adminWallet,
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

  // Step 4: Send transaction for mint + ATA + initial mint
  const blockhashInfo = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhashInfo.blockhash;
  transaction.feePayer = payer;
  transaction.sign(adminWallet, mintAuthority);

  const signature = await sendAndConfirmTransaction(connection, transaction, [adminWallet, mintAuthority], {
    commitment: 'confirmed',
    skipPreflight: false,
    maxRetries: 5,
    preflightCommitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
  console.log('✅ Transaction confirmed:', signature);
  console.log(`Solscan: https://solscan.io/tx/${signature}?cluster=${CONFIG.network.current}`);

  // Step 5: Create metadata via UMI
  console.log('📝 Creating metadata via UMI...');
  const umiSigner = createSignerFromKeypair(umi, adminWallet);
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

  const metadataTx = await createMetadataAccountV3(umi, {
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
  }).sendAndConfirm(umi);

  console.log('✅ Metadata transaction confirmed:', metadataTx);

  // Step 6: Save token info
  const tokenInfo = {
    mint: mint.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    freezeAuthority: freezeAuthority.toBase58(),
    associatedTokenAccount: associatedTokenAccount.toBase58(),
    decimals: CONFIG.token.decimals,
    initialSupply: CONFIG.token.initialMint.toString(),
    network: CONFIG.network.current,
    transactionSignature: signature,
    metadataTx,
  };
  fs.writeFileSync('token-info.json', JSON.stringify(tokenInfo, null, 2));
  console.log('💾 Token info saved to token-info.json');
}

// Execute
createToken().catch((err) => {
  console.error('❌ Process failed:', err);
  process.exit(1);
});
