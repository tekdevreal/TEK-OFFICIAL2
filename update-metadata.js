// update-metadata.js
// Update on-chain metadata for an existing mint using Umi + mpl-token-metadata.
// Uses ADMIN_WALLET_JSON as the update authority and TOKEN_MINT as the target mint.
//
// Required env vars:
// - HELIUS_RPC_URL     : RPC endpoint (devnet/mainnet)
// - ADMIN_WALLET_JSON  : JSON array of the admin wallet secret key
// - TOKEN_MINT         : Mint public key to update
//
// Example:
// HELIUS_RPC_URL="https://devnet.helius-rpc.com/?api-key=..." \
// ADMIN_WALLET_JSON='[ ... ]' \
// TOKEN_MINT="8LF2FBaX47nmaZ1sBqs4Kg88t6VDbgDzjK3MQM7uPZZx" \
// node update-metadata.js

import dotenv from 'dotenv';
import { Keypair } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplTokenMetadata,
  updateMetadataAccountV2,
  createV1,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  createSignerFromKeypair,
  keypairIdentity,
  publicKey as umiPublicKey,
  some,
  none,
} from '@metaplex-foundation/umi';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

async function main() {
  const rpcUrl = requireEnv('HELIUS_RPC_URL');
  const adminWalletJson = requireEnv('ADMIN_WALLET_JSON');
  const mintAddress = requireEnv('TOKEN_MINT');

  const secretKey = Uint8Array.from(JSON.parse(adminWalletJson));

  const umi = createUmi(rpcUrl).use(mplTokenMetadata());

  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(keypairIdentity(signer));

  const mint = umiPublicKey(mintAddress);

  // Desired metadata values
  const name = 'Nuke Rewards'; // <=32 chars
  const symbol = 'NUKE'; // <=10 chars
  const uri =
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Radiation_warning_symbol.svg/1024px-Radiation_warning_symbol.svg.png';

  console.log('🔧 Updating metadata for mint:', mintAddress);

  // Try update first
  try {
    const updateIx = updateMetadataAccountV2(umi, {
      mint,
      authority: signer,
      data: some({
        name,
        symbol,
        uri,
        sellerFeeBasisPoints: 0,
        creators: none(),
        collection: none(),
        uses: none(),
      }),
      primarySaleHappened: null,
      isMutable: null,
      updateAuthority: null,
    });
    const sig = await updateIx.sendAndConfirm(umi);
    console.log('✅ Metadata update confirmed:', sig);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Account does not exist') && !msg.includes('Data type mismatch')) {
      throw err;
    }
    console.log('ℹ️ Metadata account missing; creating new metadata account...');
  }

  // Create metadata using createV1 to set tokenStandard + decimals for fungible Token-2022
  const createIx = createV1(umi, {
    mint,
    authority: signer,
    payer: signer,
    updateAuthority: signer,
    splTokenProgram: umiPublicKey(TOKEN_2022_PROGRAM_ID),
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: 0,
    creators: none(),
    primarySaleHappened: false,
    isMutable: true,
    tokenStandard: TokenStandard.Fungible,
    collection: none(),
    uses: none(),
    collectionDetails: none(),
    ruleSet: none(),
    decimals: some(6),
    printSupply: none(),
  });

  const createSig = await createIx.sendAndConfirm(umi);
  console.log('✅ Metadata created:', createSig);
}

main().catch((err) => {
  console.error('❌ Failed to update metadata:', err);
  process.exit(1);
});


