# Raydium CPMM Swap Fix - InstructionFallbackNotFound Error

## Problem

The swap was failing with `InstructionFallbackNotFound (Custom 101)` error because:

1. **Incorrect Program ID**: Code was using hardcoded standard Raydium AMM v4 program ID (`675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`) instead of the pool-specific CPMM program ID from API (`DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb`)

2. **Wrong Instruction Function**: The code used a generic `createRaydiumSwapInstruction()` that assumed Standard AMM v4 format

3. **Missing Account Pre-creation**: WSOL destination account creation wasn't properly handled

## Solution

### 1. Created CPMM-Specific Swap Instruction Function

**New Function**: `createRaydiumCpmmSwapInstruction()`

**Key Changes**:
- Uses pool's program ID from API response (not hardcoded)
- Explicitly designed for CPMM pools
- Proper account order for CPMM swap instruction
- Uses `TOKEN_2022_PROGRAM_ID` for Token-2022 source (NUKE)

```typescript
function createRaydiumCpmmSwapInstruction(
  poolId: PublicKey,
  poolProgramId: PublicKey, // CRITICAL: From API response
  userSourceTokenAccount: PublicKey, // NUKE (Token-2022)
  userDestinationTokenAccount: PublicKey, // WSOL (SPL Token)
  poolSourceTokenAccount: PublicKey, // Pool NUKE vault (Token-2022)
  poolDestinationTokenAccount: PublicKey, // Pool WSOL vault (SPL Token)
  poolCoinMint: PublicKey, // NUKE mint (Token-2022)
  poolPcMint: PublicKey, // WSOL mint (SPL Token)
  amountIn: bigint, // Amount BEFORE transfer fee
  minimumAmountOut: bigint,
  userWallet: PublicKey
): TransactionInstruction
```

### 2. Updated Pool Info Fetching

**Function**: `fetchPoolInfoFromAPI()`

**Changes**:
- Always uses `programId` from API response
- No hardcoded fallbacks for program ID
- Throws error if program ID is missing from API

### 3. Improved WSOL Account Creation

**Before**: Account creation was checked but not properly handled  
**After**: 
- Explicitly checks for WSOL account existence
- Creates account in transaction if needed
- Uses `TOKEN_PROGRAM_ID` for WSOL (SPL Token, not Token-2022)
- Account creation happens BEFORE swap instruction

### 4. Transfer Fee Handling

**NUKE Transfer Fee**: 4%

**How it works**:
- `amountIn` is the amount BEFORE transfer fee
- Transfer fee (4%) is automatically deducted during Token-2022 transfer
- Pool receives `amountIn * 0.96`
- Swap calculation accounts for this in `nukeAfterTransferFee`

### 5. Account Order for CPMM Swap

**Correct Account Order** (10 accounts):
```
0. poolId (writable)
1. userSourceTokenAccount (writable) - NUKE (Token-2022)
2. userDestinationTokenAccount (writable) - WSOL (SPL Token)
3. poolSourceTokenAccount (writable) - Pool NUKE vault (Token-2022)
4. poolDestinationTokenAccount (writable) - Pool WSOL vault (SPL Token)
5. poolCoinMint - NUKE mint (Token-2022)
6. poolPcMint - WSOL mint (SPL Token)
7. userWallet (signer, writable)
8. tokenProgramId - TOKEN_2022_PROGRAM_ID
9. systemProgram
```

### 6. Instruction Data Format

```typescript
// CPMM Swap Instruction
const instructionData = Buffer.alloc(17);
instructionData.writeUInt8(9, 0); // Swap discriminator
instructionData.writeBigUInt64LE(amountIn, 1); // Amount before fee
instructionData.writeBigUInt64LE(minimumAmountOut, 9); // Min output
```

## Pool Configuration

**Pool ID**: `GFPwg4JVyRbsmNSvPGd8Wi3vvR3WVyChkjY56U7FKrc9`  
**Pool Type**: `Cpmm` (Constant Product Market Maker)  
**Pool Program ID**: `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb` (from API)

**Vaults**:
- Vault A (SOL): `3FAzsES6Vxx91ETtacAPhseg3quHTSKeVXMWks1ivJVR` (SPL Token)
- Vault B (NUKE): `9T4RoNGUZdEgRojUU9gsh8Ffk6J3smpkY4EiF4a5w4HD` (Token-2022)

**Tokens**:
- NUKE: `CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq` (Token-2022, 6 decimals, 4% transfer fee)
- SOL: `So11111111111111111111111111111111111111112` (SPL Token, 9 decimals)

## Key Improvements

1. ✅ **Uses Pool Program ID from API**: No more hardcoded program IDs
2. ✅ **CPMM-Specific Instruction**: Correct format for CPMM pools
3. ✅ **Proper Token Program Handling**: `TOKEN_2022_PROGRAM_ID` for NUKE source
4. ✅ **Account Pre-creation**: WSOL account created if needed
5. ✅ **Transfer Fee Accounting**: 4% fee correctly handled
6. ✅ **Better Error Messages**: Clear logging for debugging
7. ✅ **Liquidity Verification**: Checks reserves before swap

## Testing Checklist

- [ ] Verify pool program ID is fetched from API
- [ ] Verify WSOL account is created if missing
- [ ] Verify swap instruction uses correct program ID
- [ ] Verify transfer fee is accounted for in calculations
- [ ] Verify simulation passes before actual swap
- [ ] Verify swap executes successfully on devnet

## Error Prevention

**Before**: `InstructionFallbackNotFound (Custom 101)` due to wrong program ID  
**After**: Uses correct pool program ID from API, swap should succeed

## Notes

- CPMM pools require pool-specific program IDs (not the standard AMM v4 ID)
- Token-2022 to SPL Token swaps use `TOKEN_2022_PROGRAM_ID` because source is Token-2022
- Transfer fees are deducted automatically during Token-2022 transfers
- Always fetch fresh pool info from API to get correct program ID and vault addresses

