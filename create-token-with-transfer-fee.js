import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  getTransferFeeAmount,
  unpackMint,
} from '@solana/spl-token';
import {
  createInitializeTransferFeeConfigInstruction,
  getTransferFeeConfig,
  harvestWithheldTokensToMint,
  transferCheckedWithFee,
  withdrawWithheldTokensFromAccounts,
} from '@solana/spl-token';
// mpl-token-metadata is CommonJS; import default then destructure
import mplTokenMetadata from '@metaplex-foundation/mpl-token-metadata';
const { createCreateMetadataAccountV3Instruction } = mplTokenMetadata;
import { CONFIG } from './config.js';

// Get connection
const connection = new Connection(
  CONFIG.network[CONFIG.network.current],
  'confirmed'
);

// Load wallet from environment
if (!process.env.ADMIN_WALLET_JSON) {
  throw new Error('ADMIN_WALLET_JSON environment variable is required');
}

let adminWallet;
try {
  const secretKey = Uint8Array.from(JSON.parse(process.env.ADMIN_WALLET_JSON));
  adminWallet = Keypair.fromSecretKey(secretKey);
  console.log('✅ Admin Wallet Address:', adminWallet.publicKey.toBase58());
} catch (error) {
  console.error('❌ Error loading wallet from ADMIN_WALLET_JSON:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}

// Use admin wallet as mint authority so we retain control and can update metadata later
const mintAuthority = adminWallet;
const freezeAuthority = adminWallet.publicKey;
const transferFeeConfigAuthority = adminWallet.publicKey;
const withdrawWithheldAuthority = adminWallet.publicKey;

async function createTokenWithTransferFee() {
  try {
    console.log('\n🚀 Creating Token with Transfer Fee...\n');
    console.log('📋 Configuration:');
    console.log(`   Network: ${CONFIG.network.current}`);
    console.log(`   Token Name: ${CONFIG.token.name}`);
    console.log(`   Symbol: ${CONFIG.token.symbol}`);
    console.log(`   Decimals: ${CONFIG.token.decimals}`);
    console.log(`   Transfer Fee: ${CONFIG.transferFee.feeBasisPoints / 100}%`);
    console.log(`   Max Fee: ${CONFIG.transferFee.maxFee.toString()}\n`);

    if (!CONFIG.transferFee.enabled) {
      console.log('⚠️  Transfer fee is disabled in config. Enabling for this creation...\n');
    }

    const payer = adminWallet.publicKey;
    const signer = adminWallet;

    // Calculate required space for mint with transfer fee extension
    const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    // Step 1: Create mint account with transfer fee extension
    console.log('📝 Step 1: Creating mint with transfer fee extension...');
    const mint = Keypair.generate();
    
    const transaction = new Transaction();
    
    // Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      })
    );

    // Initialize mint with transfer fee config
    const transferFeeConfig = {
      transferFeeConfigAuthority: transferFeeConfigAuthority,
      withdrawWithheldAuthority: withdrawWithheldAuthority,
      withholdAuthority: null, // No withhold authority
      olderTransferFee: {
        epoch: 0,
        maximumFee: CONFIG.transferFee.maxFee,
        transferFeeBasisPoints: CONFIG.transferFee.feeBasisPoints,
      },
      newerTransferFee: {
        epoch: 0,
        maximumFee: CONFIG.transferFee.maxFee,
        transferFeeBasisPoints: CONFIG.transferFee.feeBasisPoints,
      },
    };

    transaction.add(
      createInitializeTransferFeeConfigInstruction(
        mint.publicKey,
        transferFeeConfigAuthority,
        withdrawWithheldAuthority,
        transferFeeConfig.transferFeeBasisPoints,
        transferFeeConfig.maximumFee,
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Initialize mint
    const { createInitializeMint2Instruction } = await import('@solana/spl-token');
    transaction.add(
      createInitializeMint2Instruction(
        mint.publicKey,
        CONFIG.token.decimals,
        mintAuthority.publicKey,
        freezeAuthority,
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Send and confirm
    const blockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.feePayer = payer;
    transaction.sign(signer, mint);

    console.log('   Sending transaction...');
    const initSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer, mint],
      { commitment: 'confirmed' }
    );
    console.log('✅ Mint created with transfer fee!');
    console.log(`   Mint Address: ${mint.publicKey.toBase58()}`);
    console.log(`   Signature: ${initSignature}\n`);

    // Step 2: Create ATA and mint tokens
    console.log('📝 Step 2: Creating ATA and minting tokens...');
    const associatedTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      payer,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const mintTransaction = new Transaction();
    const ataInfo = await connection.getAccountInfo(associatedTokenAccount);
    
    if (!ataInfo) {
      mintTransaction.add(
        createAssociatedTokenAccountInstruction(
          payer,
          associatedTokenAccount,
          payer,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    mintTransaction.add(
      createMintToInstruction(
        mint.publicKey,
        associatedTokenAccount,
        mintAuthority.publicKey,
        CONFIG.token.initialMint,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const mintBlockhash = await connection.getLatestBlockhash('confirmed');
    mintTransaction.recentBlockhash = mintBlockhash.blockhash;
    mintTransaction.feePayer = payer;
  // Sign with both the payer and the mint authority, since mintAuthority is required for minting
  mintTransaction.sign(signer, mintAuthority);

    const mintSignature = await sendAndConfirmTransaction(
      connection,
      mintTransaction,
      [signer, mintAuthority],
      { commitment: 'confirmed' }
    );
    console.log('✅ Tokens minted!');
    console.log(`   Signature: ${mintSignature}\n`);

    // Step 3: Add metadata
    console.log('📝 Step 3: Adding metadata...');
    const metadataPDA = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        mint.publicKey.toBuffer(),
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
    )[0];

    const metadataTransaction = new Transaction();
    metadataTransaction.add(
      createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataPDA,
          mint: mint.publicKey,
          mintAuthority: mintAuthority.publicKey,
          payer: adminWallet.publicKey,
          updateAuthority: adminWallet.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: CONFIG.metadata.name,
              symbol: CONFIG.metadata.symbol,
              uri: CONFIG.metadata.image || '',
              sellerFeeBasisPoints: CONFIG.metadata.sellerFeeBasisPoints,
              creators: CONFIG.metadata.creators,
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          },
        }
      )
    );

    const metaBlockhash = await connection.getLatestBlockhash('confirmed');
    metadataTransaction.recentBlockhash = metaBlockhash.blockhash;
    metadataTransaction.feePayer = payer;
    metadataTransaction.sign(signer, mintAuthority);

    const metaSignature = await sendAndConfirmTransaction(
      connection,
      metadataTransaction,
      [signer, mintAuthority],
      { commitment: 'confirmed' }
    );
    console.log('✅ Metadata added!');
    console.log(`   Signature: ${metaSignature}\n`);

    // Verify transfer fee config
    console.log('📝 Step 4: Verifying transfer fee configuration...');
    const mintInfo = await connection.getAccountInfo(mint.publicKey);
    const parsed = unpackMint(mint.publicKey, mintInfo, TOKEN_2022_PROGRAM_ID);
    const transferFeeConfigData = getTransferFeeConfig(parsed);
    
    if (transferFeeConfigData) {
      console.log('✅ Transfer fee verified!');
      console.log(`   Fee Basis Points: ${transferFeeConfigData.newerTransferFee.transferFeeBasisPoints}`);
      console.log(`   Max Fee: ${transferFeeConfigData.newerTransferFee.maximumFee.toString()}\n`);
    }

    // Verify balance
    const balance = await connection.getTokenAccountBalance(associatedTokenAccount);
    console.log(`✅ Token Balance: ${balance.value.uiAmount} ${CONFIG.token.symbol}\n`);

    // Save token info
    const tokenInfo = {
      mint: mint.publicKey.toBase58(),
      mintAuthority: mintAuthority.publicKey.toBase58(),
      mintAuthoritySecretKey: Array.from(mintAuthority.secretKey),
      freezeAuthority: freezeAuthority.toBase58(),
      transferFeeConfigAuthority: transferFeeConfigAuthority.toBase58(),
      withdrawWithheldAuthority: withdrawWithheldAuthority.toBase58(),
      associatedTokenAccount: associatedTokenAccount.toBase58(),
      decimals: CONFIG.token.decimals,
      initialSupply: CONFIG.token.initialMint.toString(),
      transferFee: {
        enabled: true,
        feeBasisPoints: CONFIG.transferFee.feeBasisPoints,
        maxFee: CONFIG.transferFee.maxFee.toString(),
      },
      network: CONFIG.network.current,
      transactionSignatures: {
        initialization: initSignature,
        minting: mintSignature,
        metadata: metaSignature,
      },
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync('token-info.json', JSON.stringify(tokenInfo, null, 2));
    console.log('💾 Token information saved to: token-info.json\n');

    console.log('🎉 Token with transfer fee created successfully!\n');
    console.log('📊 Summary:');
    console.log(`   Mint Address: ${mint.publicKey.toBase58()}`);
    console.log(`   Symbol: ${CONFIG.token.symbol}`);
    console.log(`   Transfer Fee: ${CONFIG.transferFee.feeBasisPoints / 100}%`);
    console.log(`   Initial Supply: ${balance.value.uiAmount} ${CONFIG.token.symbol}`);
    console.log(`   Network: ${CONFIG.network.current}\n`);

    return { mint: mint.publicKey, mintAuthority, tokenInfo };
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  }
}

createTokenWithTransferFee()
  .then(() => {
    console.log('✅ Process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Process failed:', error.message);
    process.exit(1);
  });

