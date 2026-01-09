#!/bin/bash

# Check Backend Deployment Status
# Verifies if the latest fix is deployed and running

echo "=== Backend Deployment Check ==="
echo ""

# Step 1: Check git status
echo "Step 1: Checking git status..."
cd /home/van/reward-project || exit 1

echo "Current branch:"
git branch --show-current

echo ""
echo "Last 5 commits:"
git log --oneline -5

echo ""
echo "Looking for critical fix commit..."
if git log --oneline -20 | grep -q "only distribute SOL from NUKE swaps"; then
    echo "✅ Fix commit found in recent history"
    COMMIT_HASH=$(git log --oneline -20 | grep "only distribute SOL from NUKE swaps" | head -1 | awk '{print $1}')
    echo "   Commit: $COMMIT_HASH"
else
    echo "⚠️  Fix commit not found in recent history"
    echo "   This may indicate the fix hasn't been committed yet"
fi

# Step 2: Check state file
echo ""
echo "Step 2: Checking reward-state.json..."
if [ -f "backend/reward-state.json" ]; then
    echo "State file exists"
    echo ""
    echo "Checking for taxState..."
    if grep -q "taxState" backend/reward-state.json; then
        echo "✅ taxState found in state file"
        echo ""
        echo "Tax State Summary:"
        cat backend/reward-state.json | jq '.taxState | {
          totalSolDistributed,
          totalSolToTreasury,
          lastSwapTx,
          lastDistributionTime,
          distributionCount: (.taxDistributions | length)
        }' 2>/dev/null || echo "   (jq not available, showing raw data)"
        
        if ! command -v jq &> /dev/null; then
            echo ""
            echo "Raw taxState:"
            grep -A 20 "taxState" backend/reward-state.json | head -20
        fi
    else
        echo "❌ taxState NOT found in state file"
        echo ""
        echo "This means either:"
        echo "  1. Backend is not running the new code"
        echo "  2. Backend hasn't processed any tax yet"
        echo "  3. Tax is below threshold and hasn't been harvested"
        echo ""
        echo "Current state file contents:"
        cat backend/reward-state.json
    fi
else
    echo "❌ State file not found: backend/reward-state.json"
    echo "   Backend may not have run yet"
fi

# Step 3: Check if backend is running
echo ""
echo "Step 3: Checking if backend is running..."
BACKEND_RUNNING=$(ps aux | grep -E "node.*backend|npm.*backend" | grep -v grep | wc -l)
if [ "$BACKEND_RUNNING" -gt 0 ]; then
    echo "✅ Backend process(es) running locally:"
    ps aux | grep -E "node.*backend|npm.*backend" | grep -v grep
else
    echo "ℹ️  No backend processes running locally"
    echo "   Backend may be running on Render or another server"
fi

# Step 4: Check reward wallet balance
echo ""
echo "Step 4: Checking reward wallet balance..."
REWARD_WALLET="6PpZCPj72mdzBfrSJCJab9y535v2greCBe6YVW7XeXpo"
echo "Reward Wallet: $REWARD_WALLET"
echo "Network: Devnet"
echo ""
echo "To check balance, visit:"
echo "https://solscan.io/account/$REWARD_WALLET?cluster=devnet"
echo ""
echo "Expected balance: 0.5-1 SOL (for operational costs)"
echo "If balance is much higher, may indicate SOL accumulation from swaps"

# Step 5: Check critical files
echo ""
echo "Step 5: Checking critical files..."
FILES=(
    "backend/src/services/solDistributionService.ts"
    "backend/src/services/taxService.ts"
    "telegram-bot/src/index.ts"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file NOT FOUND"
    fi
done

# Step 6: Check for the specific fix in solDistributionService.ts
echo ""
echo "Step 6: Verifying fix is in code..."
if grep -q "Only SOL from NUKE swap distributed" backend/src/services/solDistributionService.ts; then
    echo "✅ Fix comment found in solDistributionService.ts"
    echo "   Line: $(grep -n "Only SOL from NUKE swap distributed" backend/src/services/solDistributionService.ts | head -1)"
else
    echo "❌ Fix comment NOT found in solDistributionService.ts"
    echo "   This indicates the fix may not be applied"
fi

if grep -q "currentRewardLamports,  // ← ONLY swap proceeds" backend/src/services/solDistributionService.ts; then
    echo "✅ Fix code found in solDistributionService.ts"
else
    echo "⚠️  Fix code pattern not found (may use different formatting)"
fi

# Step 7: Summary
echo ""
echo "=== Summary ==="
echo ""
echo "To verify the fix is working:"
echo "  1. Check Render logs for 'Tax distribution complete'"
echo "  2. Look for 'Only SOL from NUKE swap distributed' in logs"
echo "  3. Verify reward wallet balance stays around 0.5-1 SOL"
echo "  4. Check that taxState appears in reward-state.json after next cycle"
echo ""
echo "If backend is on Render:"
echo "  1. Log into Render dashboard"
echo "  2. Check backend service logs"
echo "  3. Verify latest commit is deployed"
echo "  4. Check for any errors in logs"
