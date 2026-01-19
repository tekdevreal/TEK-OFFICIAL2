#!/bin/bash

# Check Reward Wallet Balance
# Verifies the wallet balance hasn't been drained

echo "=== Checking Reward Wallet Balance ==="
echo ""

REWARD_WALLET="6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo"
NETWORK="devnet"

echo "Reward Wallet: $REWARD_WALLET"
echo "Network: $NETWORK"
echo ""

# Try to get balance using solana CLI (if installed)
if command -v solana &> /dev/null; then
    echo "Fetching balance via Solana CLI..."
    BALANCE=$(solana balance $REWARD_WALLET --url devnet 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "Current Balance: $BALANCE"
    else
        echo "Failed to fetch balance via CLI"
    fi
else
    echo "Solana CLI not installed"
fi

echo ""
echo "Manual check:"
echo "Visit: https://solscan.io/account/$REWARD_WALLET?cluster=devnet"
echo ""
echo "Expected balance:"
echo "  - Operational balance: ~1-2 SOL (for tx fees and ATA creation)"
echo "  - This should NOT have decreased significantly"
echo ""
echo "What to look for:"
echo "  1. Check current balance"
echo "  2. Review recent transactions"
echo "  3. Verify distributions came from swap proceeds (not operational balance)"
echo ""
echo "Recent distribution from logs:"
echo "  - Swapped 42,229 NUKE → 5.097 SOL"
echo "  - Distributed 3.822 SOL to holders (from swap)"
echo "  - Sent 1.274 SOL to treasury (from swap)"
echo "  - Total from swap: 5.096 SOL ✓"
echo ""
echo "Transaction fees (approximate):"
echo "  - 9 payouts × 0.000005 SOL = 0.000045 SOL"
echo "  - 1 treasury tx × 0.000005 SOL = 0.000005 SOL"
echo "  - Total fees: ~0.00005 SOL"
echo ""
echo "Expected outcome:"
echo "  - Operational balance should be nearly unchanged"
echo "  - Only tiny amount used for transaction fees"
echo "  - All distributions came from NUKE swap proceeds"
