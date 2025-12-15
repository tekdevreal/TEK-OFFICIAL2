import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  TransactionInstruction,
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
const { createCreateMetadataAccountV3Instruction } = mplTokenMetadata;
import * as fs from 'fs';
import { CONFIG } from './config.js';

// Get connection based on config
const connection = new Connection(
  CONFIG.network[CONFIG.network.current],
  'confirmed'
);

// Load the admin wallet keypair
let adminWallet;
try {
  const keypairPath = CONFIG.wallet.keypairPath;
  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Keypair file not found at: ${keypairPath}`);
  }
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  adminWallet = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log('✅ Admin Wallet Address:', adminWallet.publicKey.toBase58());
} catch (error) {
  console.error('❌ Error loading wallet:', error.message);
  process.exit(1);
}

// Generate a new keypair for the mint authority
const mintAuthority = Keypair.generate();
const freezeAuthority = adminWallet.publicKey;

async function createToken() {
  try {
    console.log('\n🚀 Starting Token Creation...\n');
    console.log('📋 Configuration:');
    console.log(`   Network: ${CONFIG.network.current}`);
    console.log(`   Token Name: ${CONFIG.token.name}`);
    console.log(`   Symbol: ${CONFIG.token.symbol}`);
    console.log(`   Decimals: ${CONFIG.token.decimals}`);
    console.log(`   Initial Supply: ${CONFIG.token.initialMint.toString()}\n`);

    const payer = adminWallet.publicKey;
    const signer = adminWallet;

    // Step 1: Create a new mint with Token-2022
    console.log('📝 Step 1: Creating mint...');
    const mint = await createMint(
      connection,
      signer,
      mintAuthority.publicKey,
      freezeAuthority,
      CONFIG.token.decimals,
      undefined,
      {
        programId: TOKEN_2022_PROGRAM_ID,
      }
    );
    console.log('✅ Mint created successfully!');
    console.log(`   Mint Address: ${mint.toBase58()}\n`);

    // Step 2: Get or create Associated Token Account
    console.log('📝 Step 2: Setting up Associated Token Account...');
    const associatedTokenAccount = getAssociatedTokenAddressSync(
      mint,
      payer,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log(`   ATA Address: ${associatedTokenAccount.toBase58()}`);

    // Check if ATA exists
    const ataInfo = await connection.getAccountInfo(associatedTokenAccount);
    const transaction = new Transaction();

    if (!ataInfo) {
      console.log('   Creating new ATA...');
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
    } else {
      console.log('   ATA already exists, skipping creation.\n');
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
    console.log(`   Amount: ${CONFIG.token.initialMint.toString()} raw units\n`);

    // Step 4: Add metadata
    console.log('📝 Step 4: Adding token metadata...');
    const metadataPDA = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
    )[0];

    const metadataInstruction = createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPDA,
        mint,
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
    );
    transaction.add(metadataInstruction);
    console.log('✅ Metadata instruction added\n');

    // Step 5: Send transaction
    console.log('📝 Step 5: Sending transaction...');
    const blockhashInfo = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhashInfo.blockhash;
    transaction.feePayer = payer;

    // Sign with both wallets
    transaction.sign(signer, mintAuthority);

    // Simulate first
    console.log('   Simulating transaction...');
    const simulation = await connection.simulateTransaction(transaction);
    if (simulation.value.err) {
      console.error('❌ Simulation failed:', simulation.value.err);
      console.error('Logs:', simulation.value.logs);
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    console.log('✅ Simulation successful');
    console.log(`   Compute Units: ${simulation.value.unitsConsumed}\n`);

    // Send and confirm
    console.log('   Sending transaction...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer, mintAuthority],
      {
        commitment: 'confirmed',
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
      }
    );

    console.log('✅ Transaction confirmed!');
    console.log(`   Signature: ${signature}`);
    console.log(`   Solscan: https://solscan.io/tx/${signature}?cluster=${CONFIG.network.current}\n`);

    // Step 6: Verify balance
    console.log('📝 Step 6: Verifying token balance...');
    const balance = await connection.getTokenAccountBalance(associatedTokenAccount);
    console.log(`✅ Balance verified: ${balance.value.uiAmount} ${CONFIG.token.symbol}\n`);

    // Save important information
    const tokenInfo = {
      mint: mint.toBase58(),
      mintAuthority: mintAuthority.publicKey.toBase58(),
      mintAuthoritySecretKey: Array.from(mintAuthority.secretKey),
      freezeAuthority: freezeAuthority.toBase58(),
      associatedTokenAccount: associatedTokenAccount.toBase58(),
      decimals: CONFIG.token.decimals,
      initialSupply: CONFIG.token.initialMint.toString(),
      network: CONFIG.network.current,
      transactionSignature: signature,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      'token-info.json',
      JSON.stringify(tokenInfo, null, 2)
    );
    console.log('💾 Token information saved to: token-info.json');
    console.log('⚠️  IMPORTANT: Save the mintAuthority secret key securely!\n');

    console.log('🎉 Token creation completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   Mint Address: ${mint.toBase58()}`);
    console.log(`   Symbol: ${CONFIG.token.symbol}`);
    console.log(`   Decimals: ${CONFIG.token.decimals}`);
    console.log(`   Initial Supply: ${balance.value.uiAmount} ${CONFIG.token.symbol}`);
    console.log(`   Network: ${CONFIG.network.current}\n`);

    return {
      mint,
      mintAuthority,
      associatedTokenAccount,
      signature,
      tokenInfo,
    };
  } catch (error) {
    console.error('\n❌ Error creating token:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Execute
createToken()
  .then(() => {
    console.log('✅ Process completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Process failed:', error.message);
    process.exit(1);
  });

