# Professional Data Fetching System

This directory contains a professional data fetching system designed for production dashboards with:

## Features

- ✅ **Request Deduplication**: Multiple components requesting the same data share a single request
- ✅ **Intelligent Caching**: TTL-based cache with stale-while-revalidate pattern
- ✅ **Automatic Retry**: Exponential backoff retry logic for failed requests
- ✅ **Background Refetching**: Automatic background updates without blocking UI
- ✅ **Request Throttling**: Prevents rate limiting by throttling duplicate requests
- ✅ **Memory Management**: Automatic cache cleanup and size limits
- ✅ **TypeScript Support**: Full type safety

## Architecture

### Core Components

1. **`dataCache.ts`**: In-memory cache with TTL, stale detection, and automatic cleanup
2. **`requestQueue.ts`**: Request deduplication and throttling service
3. **`useDataFetching.ts`**: Main hook for data fetching with all features
4. **`useApiData.ts`**: Pre-configured hooks for API endpoints

## Usage

### Basic Usage

```typescript
import { useRewards } from '../hooks/useApiData';

function MyComponent() {
  const { data, error, isLoading, isFetching, refetch } = useRewards();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{data?.statistics.totalHolders}</div>;
}
```

### Advanced Usage

```typescript
import { useQuery } from '../hooks/useDataFetching';

function MyComponent() {
  const { data, error, isLoading, isStale, refetch } = useQuery(
    'my-data-key',
    () => fetchMyData(),
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      staleTime: 2.5 * 60 * 1000, // 2.5 minutes
      refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
      refetchOnWindowFocus: true, // Refetch when window regains focus
      retry: 3, // Retry 3 times on failure
      onSuccess: (data) => console.log('Success!', data),
      onError: (error) => console.error('Error!', error),
    }
  );

  return (
    <div>
      {isStale && <span>Data may be outdated</span>}
      {data && <div>{data}</div>}
    </div>
  );
}
```

## Available Hooks

- `useRewards(pubkey?, options?)` - Fetch rewards data
- `useHolders(params?, options?)` - Fetch holders data
- `usePayouts(params?, options?)` - Fetch payouts data
- `useHistoricalRewards(params?, options?)` - Fetch historical rewards
- `useHistoricalPayouts(params?, options?)` - Fetch historical payouts
- `useDexVolume24h(tokenAddress, options?)` - Fetch DEX volume

## Cache Behavior

- **Fresh**: Data is less than `staleTime` old - used immediately
- **Stale**: Data is older than `staleTime` but less than `ttl` - used immediately, fetched in background
- **Expired**: Data is older than `ttl` - fetched fresh

## Request Deduplication

If multiple components request the same data simultaneously, only one request is made and all components receive the result.

## Performance Benefits

1. **Reduced API Calls**: Caching and deduplication significantly reduce backend load
2. **Faster UI**: Stale-while-revalidate pattern provides instant UI updates
3. **Better UX**: Background refetching doesn't block user interactions
4. **Rate Limit Protection**: Throttling prevents hitting rate limits

