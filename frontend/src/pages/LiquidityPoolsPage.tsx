import { useMemo } from 'react';
import { StatCard } from '../components/StatCard';
import { LiquidityPoolCard, type LiquidityPoolCardItem } from '../components/LiquidityPoolCard';
import { GlassCard } from '../components/GlassCard';
import { useLiquidityPools, useLiquiditySummary } from '../hooks/useApiData';
import './LiquidityPoolsPage.css';

export function LiquidityPoolsPage() {
  const {
    data: liquidityPoolsData,
    error: liquidityPoolsError,
    isLoading: isLoadingLiquidityPools,
  } = useLiquidityPools({
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  const {
    data: liquiditySummaryData,
    error: liquiditySummaryError,
    isLoading: isLoadingLiquiditySummary,
  } = useLiquiditySummary({
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  // Transform liquidity pools data
  const liquidityPools: LiquidityPoolCardItem[] = useMemo(() => {
    // Image paths - these should be in public/Image/ folder for Vite to serve them
    const nukeLogo = '/Image/nukelogo.png';
    const solLogo = '/Image/sollogo.png';
    const usdcLogo = '/Image/usdclogo.png';
    const raydiumLogo = '/Image/raydiumlogo.png';

    if (!liquidityPoolsData?.pools || liquidityPoolsData.pools.length === 0) {
      // Return empty array if no data
      return [];
    }

    return liquidityPoolsData.pools.map((pool) => {
      // Determine token logos based on pair name
      const pairUpper = pool.pair.toUpperCase();
      let token1Logo = nukeLogo; // Default to NUKE
      let token2Logo = solLogo; // Default to SOL

      if (pairUpper.includes('USDC')) {
        token2Logo = usdcLogo;
      } else if (pairUpper.includes('SOL')) {
        token2Logo = solLogo;
      }

      return {
        pairName: pool.pair,
        token1Logo,
        token2Logo,
        dexLogo: raydiumLogo,
        totalLiquidityUSD: pool.liquidityUSD || 0,
        volume24h: pool.volume24hUSD || 0,
      };
    });
  }, [liquidityPoolsData]);

  // Loading state
  if (isLoadingLiquidityPools || isLoadingLiquiditySummary) {
    return (
      <div className="liquidity-pools-page">
        <div className="loading">Loading liquidity pools...</div>
      </div>
    );
  }

  // Error state (show error but still render if we have some data)
  const error = liquidityPoolsError || liquiditySummaryError;
  if (error && !liquidityPoolsData) {
    return (
      <div className="liquidity-pools-page">
        <div className="error-message">
          Error: {error instanceof Error ? error.message : 'Failed to load liquidity pools data'}
        </div>
      </div>
    );
  }

  return (
    <div className="liquidity-pools-page">
      <section className="liquidity-pools-section">
        <GlassCard className="liquidity-pools-section-card">
          <h2 className="section-title">Liquidity Pools</h2>
          <p className="section-subtitle">DEX liquidity pools powering swaps and rewards.</p>
          
          {/* Global LP Summary */}
          <div className="lp-summary-stats">
            <StatCard
              label="Total Liquidity"
              value={liquiditySummaryData && liquiditySummaryData.totalLiquidityUSD > 0
                ? liquiditySummaryData.totalLiquidityUSD >= 1000000
                  ? `$${(liquiditySummaryData.totalLiquidityUSD / 1000000).toFixed(1)}M`
                  : `$${(liquiditySummaryData.totalLiquidityUSD / 1000).toFixed(1)}K`
                : isLoadingLiquiditySummary ? 'Loading...' : 'N/A'}
            />
            <StatCard
              label="24H Volume"
              value={liquiditySummaryData && liquiditySummaryData.volume24hUSD > 0
                ? liquiditySummaryData.volume24hUSD >= 1000000
                  ? `$${(liquiditySummaryData.volume24hUSD / 1000000).toFixed(1)}M`
                  : `$${(liquiditySummaryData.volume24hUSD / 1000).toFixed(1)}K`
                : isLoadingLiquiditySummary ? 'Loading...' : 'N/A'}
            />
            <StatCard
              label="Active Pools"
              value={liquiditySummaryData 
                ? liquiditySummaryData.activePools.toLocaleString()
                : isLoadingLiquiditySummary ? 'Loading...' : '0'}
            />
            <StatCard
              label="Treasury Pools"
              value={liquiditySummaryData 
                ? liquiditySummaryData.treasuryPools.toLocaleString()
                : isLoadingLiquiditySummary ? 'Loading...' : '0'}
            />
          </div>

          {/* Liquidity Pool Cards */}
          <div className="liquidity-pools-container">
            {liquidityPools.length > 0 ? (
              <div className="liquidity-pools-grid">
                {liquidityPools.map((pool, index) => (
                  <LiquidityPoolCard
                    key={index}
                    item={pool}
                  />
                ))}
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                {isLoadingLiquidityPools ? 'Loading liquidity pools...' : 'No liquidity pools data available'}
              </div>
            )}
          </div>
        </GlassCard>
      </section>
    </div>
  );
}

