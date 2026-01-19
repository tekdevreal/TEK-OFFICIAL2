# Converted Private Keys

## Reward Wallet

**Base58 Private Key:**
```
2zL2NLzpdBM8JZdvQTaYYT96PEGKVdZV4JtLj6cPnLNVAvdGfz2DccocuSx9Ckp8tTBWpUFuqfnhKx4ASmnJ2Xoy
```

**Public Key (Address):**
```
6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo
```

**JSON Array (for REWARD_WALLET_PRIVATE_KEY_JSON):**
```json
[45,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250]
```

**⚠️ Note:** The above is a placeholder. You need to run the conversion script to get the actual values.

---

## Treasury Wallet

**Base58 Private Key:**
```
2vTeKWE9BEogsiAtvDm5FLhycuNSbsKU1DioCRsnyJNPRQnJ96ewYjWYsr4PetYuCYeEKoJyi9Jw6YXtjSsL5Kjf
```

**Public Key (Address):**
```
DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo
```

**JSON Array (for TREASURY_WALLET_PRIVATE_KEY_JSON):**
```json
[45,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250,110,112,18,123,78,221,89,242,27,89,250]
```

**⚠️ Note:** The above is a placeholder. You need to run the conversion script to get the actual values.

---

## How to Convert

### Option 1: Install bs58 and run script

```bash
cd /home/van/reward-project
npm install bs58
node convert-keys.mjs
```

### Option 2: Use online converter

1. Go to https://www.base58decode.com/
2. Paste your base58 private key
3. Copy the decoded hex
4. Convert hex to decimal array using a hex-to-decimal converter

### Option 3: Use Solana CLI

If you have Solana CLI installed:
```bash
solana-keygen pubkey <keypair-file.json>
# Then extract the secretKey array from the JSON file
```

---

## After Conversion

1. Copy the JSON array (should be 64 numbers)
2. Go to Railway/Render environment variables
3. Set `REWARD_WALLET_PRIVATE_KEY_JSON` = `[your-json-array]` (single line, no spaces)
4. Set `TREASURY_WALLET_PRIVATE_KEY_JSON` = `[your-json-array]` (optional)

