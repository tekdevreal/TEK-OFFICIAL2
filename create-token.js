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
import mplTokenMetadata from '@metaplex-foundation/mpl-token-metadata';
import * as fs from 'fs';
import { CONFIG } from './config.js';

async function createToken() {
  const {
    createCreateMetadataAccountV3Instruction,
    createCreateMetadataAccountV2Instruction,
    createCreateMetadataAccountInstruction,
  } = mplTokenMetadata?.default ?? mplTokenMetadata;

  const createMetadataInstruction =
    createCreateMetadataAccountV3Instruction ||
    createCreateMetadataAccountV2Instruction ||
    createCreateMetadataAccountInstruction;

  if (!createMetadataInstruction) {
    throw new Error('Cannot find a metadata creation instruction (v3/v2/legacy) in mpl-token-metadata');
  }

  // Connection
  const connection = new Connection(CONFIG.network[CONFIG.network.current], 'confirmed');

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

  const data = {
    name: CONFIG.metadata.name,
    symbol: CONFIG.metadata.symbol,
    uri: CONFIG.metadata.uri || CONFIG.metadata.image || '',
    sellerFeeBasisPoints: CONFIG.metadata.sellerFeeBasisPoints,
    creators,
    collection: null,
    uses: null,
  };

  const isV3 = createMetadataInstruction === createCreateMetadataAccountV3Instruction;
  const isV2 = createMetadataInstruction === createCreateMetadataAccountV2Instruction;

  const metadataIx = isV3
    ? createMetadataInstruction(
        {
          metadata: metadataPDA,
          mint,
          mintAuthority: mintAuthority.publicKey,
          payer: adminWallet.publicKey,
          updateAuthority: adminWallet.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data,
            isMutable: true,
            collectionDetails: null,
          },
        }
      )
    : isV2
    ? createMetadataInstruction(
        {
          metadata: metadataPDA,
          mint,
          mintAuthority: mintAuthority.publicKey,
          payer: adminWallet.publicKey,
          updateAuthority: adminWallet.publicKey,
        },
        {
          createMetadataAccountArgsV2: {
            data,
            isMutable: true,
          },
        }
      )
    : createMetadataInstruction(
        {
          metadata: metadataPDA,
          mint,
          mintAuthority: mintAuthority.publicKey,
          payer: adminWallet.publicKey,
          updateAuthority: adminWallet.publicKey,
        },
        {
          createMetadataAccountArgs: {
            data,
            isMutable: true,
          },
        }
      );

  transaction.add(metadataIx);
  console.log('✅ Metadata instruction added');

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
