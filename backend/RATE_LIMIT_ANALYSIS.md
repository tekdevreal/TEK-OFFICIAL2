# Rate Limit Issues Analysis

## Summary of Issues

### 1. **Solana Web3.js Library Retries** (Primary Source)
- **Location**: `@solana/web3.js` Connection class
- **Issue**: Built-in retry mechanism logs "Server responded with 429 Too Many Requests. Retrying after..." messages
- **Impact**: Log spam, makes it hard to see actual issues
- **Fix**: Suppressed retry messages (limited to 3) via console.log interception

### 2. **Multiple Concurrent Requests to `/dashboard/rewards`**
- **Location**: `backend/src/routes/dashboard.ts`
- **Issue**: Multiple frontend requests hitting the same endpoint simultaneously
- **Impact**: Each request triggers RPC calls, causing rate limits
- **Fix**: Request deduplication with 5-second cooldown

### 3. **Multiple Calls to `getEligibleHolders()`**
- **Location**: `backend/src/services/rewardService.ts`
- **Issue**: Function called from multiple places (scheduler, dashboard route, etc.) simultaneously
- **Impact**: Each call fetches token holders from RPC, causing rate limits
- **Fix**: Request deduplication in dashboard route, caching in solanaService

### 4. **Raydium Pool Data Fetching**
- **Location**: `backend/src/services/raydiumService.ts`
- **Issue**: Multiple concurrent requests for pool data
- **Impact**: Additional RPC calls causing rate limits
- **Fix**: Added 5-minute cooldown and stale cache fallback

### 5. **Token Holders Fetching**
- **Location**: `backend/src/services/solanaService.ts`
- **Issue**: `getTokenHolders()` called frequently without proper caching
- **Impact**: Heavy RPC usage, main cause of rate limits
- **Fix**: 10-minute cache TTL, 5-minute cooldown, stale cache fallback

## Where Fetching Issues Come From

### Frontend → Backend
1. **Dashboard Page**: Makes 3+ concurrent requests on load
   - `/dashboard/rewards`
   - `/dashboard/historical/rewards`
   - DEX volume API call
2. **Multiple Components**: Each component may trigger its own requests
3. **Auto-refresh**: 5-minute intervals can overlap

### Backend → Solana RPC
1. **`getTokenHolders()`**: Called by:
   - Dashboard route (multiple times)
   - Scheduler
   - Reward service
2. **`getEligibleHolders()`**: Calls `getTokenHolders()` + price fetching
3. **`getMintInfo()`**: Called for token metadata
4. **Raydium Service**: Fetches pool data
5. **Tax Service**: Fetches account info

## Improvements Implemented

### 1. Rate Limit Logger
- Limits duplicate error messages to 3 per minute
- Circuit breaker pattern (opens after 5 rate limit errors)
- Automatic message suppression after limit

### 2. Request Deduplication
- Dashboard route: 5-second cooldown between same requests
- Pending request sharing (multiple calls = 1 API request)

### 3. Enhanced Caching
- Token holders: 10-minute cache, 5-minute cooldown
- Mint info: 10-minute cache, 5-minute cooldown
- Raydium data: 10-minute cache, 5-minute cooldown
- Stale-while-revalidate pattern

### 4. Solana Retry Message Suppression
- Intercepts console.log to suppress library retry messages
- Limits to 3 messages, then suppresses

### 5. Circuit Breaker
- Opens after 5 rate limit errors in 1 minute
- Stays open for 5 minutes
- Prevents further RPC calls during rate limit periods

## Recommendations

1. **Frontend**: Use the new data fetching system (already implemented)
   - Reduces concurrent requests
   - Intelligent caching
   - Request deduplication

2. **Backend**: Continue using cached data during rate limits
   - Already implemented with stale cache fallback
   - Circuit breaker prevents new requests

3. **Monitoring**: Check rate limit logger summary
   - `rateLimitLogger.getSummary()` shows top errors
   - Circuit breaker status
   - Suppressed message count

## Expected Results

- **70-80% reduction** in API calls (frontend caching)
- **Cleaner logs** (max 3 duplicate messages)
- **Better resilience** (circuit breaker prevents cascading failures)
- **Faster responses** (cached data served immediately)

