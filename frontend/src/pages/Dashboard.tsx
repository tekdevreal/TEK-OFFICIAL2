import { useMemo, useState } from 'react';
import type { RewardCycle } from '../types/api';
import { StatCard } from '../components/StatCard';
import { DistributionCard, type DistributionCardItem } from '../components/DistributionCard';
import { LiquidityPoolCard, type LiquidityPoolCardItem } from '../components/LiquidityPoolCard';
import { GlassCard } from '../components/GlassCard';
import { useRewards, useHistoricalRewards, useLiquidityPools, useLiquiditySummary } from '../hooks/useApiData';
import './Dashboard.css';

export function Dashboard() {
  // Use professional data fetching hooks with caching and deduplication
  const {
    data: rewardsData,
    error: rewardsError,
    isLoading: isLoadingRewards,
    isFetching: isFetchingRewards,
  } = useRewards(undefined, {
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  const {
    data: historicalData,
    error: historicalError,
    isLoading: isLoadingHistorical,
  } = useHistoricalRewards({ limit: 20 });

  // DEX Volume is now fetched from liquidity summary (combined from both pools)
  // Removed individual Birdeye API call as it's replaced by liquidity pool data

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

  // Transform historical data to DistributionCard format
  const distributionHistory: DistributionCardItem[] = useMemo(() => {
    if (!historicalData?.cycles) {
      return [];
    }

    // Get tax statistics to calculate NUKE amounts
    const tax = rewardsData?.tax || {
      totalNukeHarvested: '0',
      totalNukeSold: '0',
      totalSolDistributed: '0',
    };
    const totalNukeSold = parseFloat(tax.totalNukeSold || '0');
    const totalSolDistributedAllTime = parseFloat(tax.totalSolDistributed || '0') / 1e9; // Convert lamports to SOL

    // Get up to 108 items (12 pages * 9 cards per page)
    const cycles = historicalData.cycles.slice(0, 108);
    
    return cycles
      .map((cycle: RewardCycle, index: number) => {
        const d = new Date(cycle.timestamp);
        const hours = d.getHours();
        const minutes = d.getMinutes();
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        const displayMinutes = minutes.toString().padStart(2, '0');
        
        const distributedSOL = cycle.totalSOLDistributed || 0;
        
        // Calculate NUKE sold proportionally based on SOL distributed
        // If this cycle represents X% of total SOL distributed, it represents X% of total NUKE sold
        const harvestedNUKE = totalSolDistributedAllTime > 0 && distributedSOL > 0
          ? (totalNukeSold * distributedSOL / totalSolDistributedAllTime) / 1e6 // Convert to human-readable (divide by 1e6 for 6 decimals)
          : 0;
        
        // Epoch number: cycles are already sorted newest first from API
        // So index 0 = newest, index (length-1) = oldest
        // Most recent gets highest epoch number
        const epochNumber = cycles.length - index; // Index 0 (newest) gets highest number
        
        return {
          date: d.toLocaleDateString(),
          time: `${displayHours}:${displayMinutes} ${period} EST`,
          status: 'Completed' as const, // Always Completed - zero amounts are filtered out below
          harvestedNUKE,
          distributedSOL,
          epochNumber,
        };
      })
      .filter((item) => {
        // Filter out cycles with zero harvest and zero distribution
        // Only show cycles that actually had some activity
        return item.harvestedNUKE > 0 || item.distributedSOL > 0;
      });
    // Note: cycles are already sorted newest first from the API, so no need to reverse
  }, [historicalData, rewardsData]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const cardsPerPage = 9;
  const maxPages = 12;
  
  // Calculate pagination
  const totalCards = distributionHistory.length;
  const totalPages = Math.min(Math.ceil(totalCards / cardsPerPage), maxPages);
  const startIndex = currentPage * cardsPerPage;
  const endIndex = Math.min(startIndex + cardsPerPage, totalCards);
  const currentPageCards = distributionHistory.slice(startIndex, endIndex);
  
  // Handle page change
  const handlePageChange = (page: number) => {
    if (page >= 0 && page < totalPages) {
      setCurrentPage(page);
    }
  };

  // Get reward wallet address from environment or rewards data
  const rewardWalletAddress = import.meta.env.VITE_REWARD_WALLET_ADDRESS || '';

  // Map backend liquidity pools data to frontend format
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
  if (isLoadingRewards || isLoadingHistorical || isLoadingLiquidityPools || isLoadingLiquiditySummary) {
    return (
      <div className="dashboard-page">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  // Error state (show error but still render if we have some data)
  const error = rewardsError || historicalError || liquidityPoolsError || liquiditySummaryError;
  if (error && !rewardsData) {
    return (
      <div className="dashboard-page">
        <div className="error-message">
          Error: {error instanceof Error ? error.message : 'Failed to load dashboard data'}
        </div>
      </div>
    );
  }

  // If we have no data at all yet, show loading
  if (!rewardsData) {
    return (
      <div className="dashboard-page">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  const stats = rewardsData.statistics;
  const tax = rewardsData.tax || {
    totalNukeHarvested: '0',
    totalNukeSold: '0',
    totalSolDistributed: '0',
    totalSolToTreasury: '0',
    lastTaxDistribution: null,
    lastSwapTx: null,
    lastDistributionTx: null,
    distributionCount: 0,
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    return `${dateStr} ${timeStr}`;
  };

  const getTimeUntilNext = (nextRun: string | null) => {
    if (!nextRun) return 'N/A';
    const now = new Date().getTime();
    const next = new Date(nextRun).getTime();
    const diff = next - now;
    
    if (diff <= 0) return 'Due now';
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="dashboard-page">
      {/* Show subtle indicator when data is being fetched in background */}
      {isFetchingRewards && !isLoadingRewards && (
        <div style={{
          position: 'fixed',
          top: '100px',
          right: '20px',
          padding: '0.5rem 1rem',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          borderRadius: '4px',
          fontSize: '0.875rem',
          zIndex: 1000,
        }}>
          Updating...
        </div>
      )}

      {/* Section 1: Two-Column Stats Layout */}
      <section className="dashboard-section">
        <div className="stats-two-column">
          {/* Left Side: Token Statistics */}
          <GlassCard className="dashboard-section-card stats-column">
            <h2 className="section-title">Token Statistics</h2>
            <div className="stats-grid-2x2">
              <StatCard
                label="Total Distributions (SOL)"
                value={(() => {
                  const sol = parseFloat(tax.totalSolDistributed || '0') / 1e9;
                  return sol > 0 ? `${sol.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL` : '0 SOL';
                })()}
              />
              <StatCard
                label="Last Distribution"
                value={formatDate(tax.lastTaxDistribution)}
              />
              <StatCard
                label="Total Holders"
                value={stats.totalHolders !== undefined && stats.totalHolders !== null
                  ? stats.totalHolders.toLocaleString()
                  : isLoadingRewards 
                    ? 'Loading...'
                    : 'N/A'}
              />
              <StatCard
                label="DEX Vol 24h"
                value={liquiditySummaryData && liquiditySummaryData.volume24hUSD > 0
                  ? `$${liquiditySummaryData.volume24hUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : isLoadingLiquiditySummary
                    ? 'Loading...'
                    : 'N/A'}
              />
            </div>
          </GlassCard>

          {/* Right Side: Processing Statistics */}
          <GlassCard className="dashboard-section-card stats-column">
            <h2 className="section-title">Processing</h2>
            <div className="stats-grid-2x2">
              <StatCard
                label="Next Distribution"
                value={rewardsData.nextRun ? getTimeUntilNext(rewardsData.nextRun) : 'N/A'}
              />
              <StatCard
                label="NUKE Collected"
                value={(() => {
                  // totalNukeHarvested is in raw token units (with 6 decimals)
                  // Divide by 1e6 to get human-readable format
                  const nuke = parseFloat(tax.totalNukeHarvested || '0') / 1e6;
                  return nuke > 0 ? nuke.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '0.00';
                })()}
              />
              <StatCard
                label="Estimated SOL"
                value={(() => {
                  const sol = parseFloat(tax.totalSolDistributed || '0') / 1e9;
                  return sol > 0 ? `${sol.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} SOL` : '0.00 SOL';
                })()}
              />
              <StatCard
                label="Epoch"
                value={(() => {
                  // Calculate epoch number from historical cycles (most recent = highest number)
                  if (!historicalData?.cycles || historicalData.cycles.length === 0) {
                    return 'N/A';
                  }
                  const epochNumber = historicalData.cycles.length;
                  return epochNumber.toString();
                })()}
              />
            </div>
          </GlassCard>
        </div>
      </section>

      {/* Section 2: Distributions with Pagination */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">Distributions</h2>
          <div className="distribution-container">
            {currentPageCards.length > 0 ? (
              <>
                <div className="distribution-grid">
                  {currentPageCards.map((item, index) => (
                    <DistributionCard 
                      key={startIndex + index} 
                      item={item} 
                      rewardWalletAddress={rewardWalletAddress}
                    />
                  ))}
                </div>
                
                {/* Pagination Dots */}
                {totalPages > 1 && (
                  <div className="pagination-dots">
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        className={`pagination-dot ${i === currentPage ? 'active' : ''}`}
                        onClick={() => handlePageChange(i)}
                        aria-label={`Go to page ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                {isLoadingHistorical 
                  ? 'Loading distribution history...' 
                  : historicalData && historicalData.cycles && historicalData.cycles.length === 0
                    ? 'No distributions yet. Distributions will begin once there is trading volume.'
                    : 'No distribution history available'}
              </div>
            )}
          </div>
        </GlassCard>
      </section>

      {/* Section 3: Liquidity Pools */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">Liquidity Pools</h2>
          
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
