#!/bin/bash

# Epoch Counting Complete Fix Deployment
# Date: January 11, 2026
# Fixes: lastDistributionEpochNumber calculation in Telegram notifications

set -e

echo "========================================"
echo "Deploying Epoch Counting Complete Fix"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to project root
cd /home/van/reward-project

echo -e "${YELLOW}Step 1: Building backend...${NC}"
cd backend
npm run build

echo ""
echo -e "${YELLOW}Step 2: Restarting backend service...${NC}"
pm2 restart nuke-backend

echo ""
echo -e "${YELLOW}Step 3: Restarting Telegram bot...${NC}"
pm2 restart nuke-telegram-bot

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""

# Wait a moment for services to start
sleep 2

echo "========================================"
echo "Verification"
echo "========================================"
echo ""

echo -e "${YELLOW}Testing API endpoints...${NC}"
echo ""

echo "1. Current epoch:"
curl -s http://localhost:3001/dashboard/cycles/current | jq '{epoch: .epoch, epochNumber: .epochNumber, cycleNumber: .cycleNumber}'

echo ""
echo "2. Last distribution epoch:"
curl -s http://localhost:3001/dashboard/rewards | jq '{lastDistributionEpoch: .tax.lastDistributionEpoch, lastDistributionEpochNumber: .tax.lastDistributionEpochNumber}'

echo ""
echo ""
echo -e "${GREEN}✓ Fix deployed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Test Telegram bot with /rewards command"
echo "2. Wait for next distribution to verify notification shows correct epoch"
echo "3. Monitor logs: pm2 logs nuke-telegram-bot"
echo ""
