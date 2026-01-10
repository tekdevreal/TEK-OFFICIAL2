import { useMemo, useState } from 'react';
import type { RewardCycle } from '../types/api';
import { StatCard } from '../components/StatCard';
import { DistributionCard, type DistributionCardItem } from '../components/DistributionCard';
import { GlassCard } from '../components/GlassCard';
import { RewardSystem } from '../components/RewardSystem';
import { useRewards, useHistoricalRewards, useCurrentCycleInfo, useLiquiditySummary } from '../hooks/useApiData';
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
  } = useHistoricalRewards({ limit: 300 }); // Increased to get full day (288 cycles)


  const {
    data: currentCycleInfo,
  } = useCurrentCycleInfo({
    refetchInterval: 1 * 60 * 1000, // 1 minute
  });

  const {
    data: liquiditySummaryData,
    isLoading: isLoadingLiquiditySummary,
  } = useLiquiditySummary({
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  // Transform historical data to DistributionCard format
  const distributionHistory: DistributionCardItem[] = useMemo(() => {
    if (!historicalData?.cycles) {
      return [];
    }

    // Get current epoch date (YYYY-MM-DD format)
    const currentEpochDate = currentCycleInfo?.epoch || null;
    
    // Get tax statistics to calculate NUKE amounts
    const tax = rewardsData?.tax || {
      totalNukeHarvested: '0',
      totalNukeSold: '0',
      totalSolDistributed: '0',
    };
    const totalNukeSold = parseFloat(tax.totalNukeSold || '0');
    const totalSolDistributedAllTime = parseFloat(tax.totalSolDistributed || '0') / 1e9; // Convert lamports to SOL

    // Filter cycles to only include those from the current epoch
    const currentEpochCycles = currentEpochDate
      ? historicalData.cycles.filter((cycle: RewardCycle) => {
          const cycleDate = new Date(cycle.timestamp);
          const cycleDateStr = `${cycleDate.getUTCFullYear()}-${String(cycleDate.getUTCMonth() + 1).padStart(2, '0')}-${String(cycleDate.getUTCDate()).padStart(2, '0')}`;
          return cycleDateStr === currentEpochDate;
        })
      : historicalData.cycles;

    // Get up to 108 items (12 pages * 9 cards per page) from current epoch only
    const cycles = currentEpochCycles.slice(0, 108);
    
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
        
        // Calculate actual cycle number (1-288) based on timestamp
        // Each cycle is 5 minutes, cycles reset at 00:00 UTC
        const startOfDay = new Date(d);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const minutesSinceStartOfDay = Math.floor((d.getTime() - startOfDay.getTime()) / (1000 * 60));
        const cycleNumber = Math.floor(minutesSinceStartOfDay / 5) + 1; // 1-based (1-288)
        
        return {
          date: d.toLocaleDateString(),
          time: `${displayHours}:${displayMinutes} ${period} EST`,
          status: 'Completed' as const, // Always Completed - zero amounts are filtered out below
          harvestedNUKE,
          distributedSOL,
          epochNumber: cycleNumber, // This is actually the cycle number (1-288)
        };
      })
      .filter((item) => {
        // Filter out cycles with zero harvest and zero distribution
        // Only show cycles that actually had some activity
        return item.harvestedNUKE > 0 || item.distributedSOL > 0;
      });
    // Note: cycles are already sorted newest first from the API, so no need to reverse
  }, [historicalData, rewardsData, currentCycleInfo]);

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

  // Loading state
  if (isLoadingRewards || isLoadingHistorical) {
    return (
      <div className="dashboard-page">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  // Error state (show error but still render if we have some data)
  const error = rewardsError || historicalError;
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
                label="Epoch"
                value={(() => {
                  // Epoch = 1 calendar day (UTC-based), starts at 00:00 UTC
                  // After Cycle #288, Epoch closes and next cycle starts Epoch +1, Cycle #1
                  // Use epochNumber from API which counts all epochs since the system started
                  if (currentCycleInfo?.epochNumber) {
                    return currentCycleInfo.epochNumber.toString();
                  }
                  return 'N/A';
                })()}
              />
              <StatCard
                label="Cycle"
                value={(() => {
                  // Show last completed cycle (current cycle - 1)
                  // Cycle counter resets to #1 at epoch start (00:00 UTC)
                  // Cycles increment every 5 minutes (288 cycles per epoch)
                  if (currentCycleInfo?.cycleNumber) {
                    const lastCycle = currentCycleInfo.cycleNumber - 1;
                    // If current is cycle 1, show 288 (last cycle of previous epoch)
                    const displayCycle = lastCycle < 1 ? 288 : lastCycle;
                    return `${displayCycle} / 288`;
                  }
                  return 'N/A';
                })()}
              />
            </div>
          </GlassCard>
        </div>
      </section>

      {/* Section 2: Reward System Visualization */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <RewardSystem />
        </GlassCard>
      </section>

      {/* Section 3: Distributions with Pagination */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">
            Distributions Epoch: {(() => {
              // Use epochNumber from API which correctly counts all epochs
              if (currentCycleInfo?.epochNumber) {
                return currentCycleInfo.epochNumber;
              }
              return 'N/A';
            })()}
          </h2>
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

    </div>
  );
}
