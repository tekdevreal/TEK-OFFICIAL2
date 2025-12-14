#!/bin/bash

# Production Deployment Verification Script
# Tests all components of the deployed system

echo "═══════════════════════════════════════════════════════════"
echo "  🔍 PRODUCTION DEPLOYMENT VERIFICATION"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_URL="http://nukerewards.imgprotocol.com"
BACKEND_URL="https://nukerewards-backend.onrender.com"
TELEGRAM_BOT_URL="${BACKEND_URL}"

# Track results
PASSED=0
FAILED=0
WARNINGS=0

# Test function
test_endpoint() {
    local name=$1
    local url=$2
    local expected_code=${3:-200}
    
    echo -n "Testing $name... "
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>&1)
    
    if [ "$response" = "$expected_code" ]; then
        echo -e "${GREEN}✅ PASS${NC} (HTTP $response)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $response, expected $expected_code)"
        ((FAILED++))
        return 1
    fi
}

# Test function with JSON validation
test_json_endpoint() {
    local name=$1
    local url=$2
    local expected_code=${3:-200}
    
    echo -n "Testing $name... "
    response_code=$(curl -s -o /tmp/response.json -w "%{http_code}" "$url" 2>&1)
    
    if [ "$response_code" = "$expected_code" ]; then
        if command -v jq &> /dev/null; then
            if jq empty /tmp/response.json 2>/dev/null; then
                echo -e "${GREEN}✅ PASS${NC} (HTTP $response_code, valid JSON)"
                ((PASSED++))
                return 0
            else
                echo -e "${YELLOW}⚠️  WARN${NC} (HTTP $response_code, invalid JSON)"
                ((WARNINGS++))
                return 1
            fi
        else
            echo -e "${GREEN}✅ PASS${NC} (HTTP $response_code)"
            ((PASSED++))
            return 0
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $response_code, expected $expected_code)"
        ((FAILED++))
        return 1
    fi
}

echo "📋 CONFIGURATION:"
echo "───────────────────────────────────────────────────────────"
echo "  Frontend: $FRONTEND_URL"
echo "  Backend:  $BACKEND_URL"
echo ""

echo "🔍 BACKEND API TESTS:"
echo "───────────────────────────────────────────────────────────"

# Test backend health
test_endpoint "Backend Health" "$BACKEND_URL/health" 200

# Test root endpoint
test_endpoint "Backend Root" "$BACKEND_URL/" 200

# Test dashboard endpoints
test_json_endpoint "Dashboard Rewards" "$BACKEND_URL/dashboard/rewards" 200
test_json_endpoint "Dashboard Payouts" "$BACKEND_URL/dashboard/payouts" 200
test_json_endpoint "Dashboard Holders" "$BACKEND_URL/dashboard/holders" 200

# Test audit endpoints
test_json_endpoint "Audit Summary" "$BACKEND_URL/audit/summary" 200
test_endpoint "Audit Latest" "$BACKEND_URL/audit/latest" 200

# Test historical endpoints
test_json_endpoint "Historical Rewards" "$BACKEND_URL/dashboard/historical/rewards" 200
test_json_endpoint "Historical Payouts" "$BACKEND_URL/dashboard/historical/payouts" 200

echo ""
echo "🌐 FRONTEND TESTS:"
echo "───────────────────────────────────────────────────────────"

# Test frontend accessibility
echo -n "Testing Frontend Accessibility... "
frontend_code=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>&1)
if [ "$frontend_code" = "200" ]; then
    echo -e "${GREEN}✅ PASS${NC} (HTTP $frontend_code)"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL${NC} (HTTP $frontend_code)"
    ((FAILED++))
fi

# Test frontend SPA routing (should return index.html)
echo -n "Testing SPA Routing (/analytics)... "
spa_code=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/analytics" 2>&1)
if [ "$spa_code" = "200" ]; then
    echo -e "${GREEN}✅ PASS${NC} (HTTP $spa_code)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARN${NC} (HTTP $spa_code, may need .htaccess)"
    ((WARNINGS++))
fi

echo ""
echo "📱 TELEGRAM BOT TESTS:"
echo "───────────────────────────────────────────────────────────"

# Check if bot is configured (can't test actual Telegram API without token)
echo -n "Checking Bot Configuration... "
if [ -f "telegram-bot/.env.example" ]; then
    echo -e "${GREEN}✅ PASS${NC} (Configuration files exist)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARN${NC} (.env.example not found)"
    ((WARNINGS++))
fi

# Check bot logs directory
echo -n "Checking Bot Logs Directory... "
if [ -d "telegram-bot/logs" ] || [ -d "telegram-bot/data" ]; then
    echo -e "${GREEN}✅ PASS${NC} (Logs/data directories exist)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARN${NC} (Logs directory not found locally)"
    ((WARNINGS++))
fi

echo ""
echo "📁 FILE STRUCTURE VERIFICATION:"
echo "───────────────────────────────────────────────────────────"

# Check frontend build
echo -n "Checking Frontend Build... "
if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    echo -e "${GREEN}✅ PASS${NC} (dist/ folder exists)"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL${NC} (dist/ folder missing)"
    ((FAILED++))
fi

# Check .htaccess
echo -n "Checking .htaccess... "
if [ -f "frontend/dist/.htaccess" ]; then
    echo -e "${GREEN}✅ PASS${NC} (.htaccess exists)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARN${NC} (.htaccess missing)"
    ((WARNINGS++))
fi

# Check backend build
echo -n "Checking Backend Build... "
if [ -d "backend/dist" ] || [ -f "backend/package.json" ]; then
    echo -e "${GREEN}✅ PASS${NC} (Backend configured)"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL${NC} (Backend not configured)"
    ((FAILED++))
fi

# Check bot build
echo -n "Checking Bot Build... "
if [ -d "telegram-bot/dist" ] || [ -f "telegram-bot/package.json" ]; then
    echo -e "${GREEN}✅ PASS${NC} (Bot configured)"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL${NC} (Bot not configured)"
    ((FAILED++))
fi

echo ""
echo "🔐 ENVIRONMENT VARIABLES CHECK:"
echo "───────────────────────────────────────────────────────────"

# Check for .env.example files
for dir in backend telegram-bot; do
    if [ -f "$dir/.env.example" ]; then
        echo -e "  ${GREEN}✅${NC} $dir/.env.example exists"
    else
        echo -e "  ${YELLOW}⚠️${NC}  $dir/.env.example missing"
        ((WARNINGS++))
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  📊 VERIFICATION SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "  ${GREEN}✅ Passed:${NC} $PASSED"
echo -e "  ${RED}❌ Failed:${NC} $FAILED"
echo -e "  ${YELLOW}⚠️  Warnings:${NC} $WARNINGS"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All critical tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review above.${NC}"
    exit 1
fi

