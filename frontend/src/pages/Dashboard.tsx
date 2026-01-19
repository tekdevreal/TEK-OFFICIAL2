import { useMemo, useState, useEffect } from 'react';
import type { RewardCycle } from '../types/api';
import { StatCard } from '../components/StatCard';
import { DistributionCard, type DistributionCardItem } from '../components/DistributionCard';
import { GlassCard } from '../components/GlassCard';
import { RewardSystem } from '../components/RewardSystem';
import { useRewards, useHistoricalRewards, useCurrentCycleInfo, useLiquiditySummary, useEpochCycles, useEpochs } from '../hooks/useApiData';
import './Dashboard.css';

// Helper to get current epoch date
function getCurrentEpoch(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function Dashboard() {
  // Track selected epoch for filtering distributions
  const [selectedEpoch, setSelectedEpoch] = useState<string>(getCurrentEpoch());
  
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

  // Fetch epoch data to get actual harvested TEK amounts for the selected epoch
  const { data: selectedEpochData } = useEpochCycles(selectedEpoch, {
    refetchInterval: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch all epochs to calculate epoch numbers
  const { data: epochsData } = useEpochs(365, {}); // Get up to a year of epochs
  
  // Calculate the epoch number for the selected epoch
  const selectedEpochNumber = useMemo(() => {
    if (!epochsData?.epochs || !selectedEpoch) return null;
    // Epochs are sorted oldest-first, so find the index + 1
    const epochIndex = epochsData.epochs.findIndex(e => e.epoch === selectedEpoch);
    return epochIndex >= 0 ? epochIndex + 1 : null;
  }, [epochsData, selectedEpoch]);

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

    // Filter cycles to only include those from the selected epoch
    const selectedEpochCycles = historicalData.cycles.filter((cycle: RewardCycle) => {
      const cycleDate = new Date(cycle.timestamp);
      const cycleDateStr = `${cycleDate.getUTCFullYear()}-${String(cycleDate.getUTCMonth() + 1).padStart(2, '0')}-${String(cycleDate.getUTCDate()).padStart(2, '0')}`;
      return cycleDateStr === selectedEpoch;
    });

    // Get up to 108 items (12 pages * 9 cards per page) from selected epoch only
    const cycles = selectedEpochCycles.slice(0, 108);
    
    // Create a map of cycle numbers to actual harvested TEK from epoch data
    const cycleTekMap = new Map<number, number>();
    if (selectedEpochData?.cycles) {
      selectedEpochData.cycles.forEach(cycle => {
        if (cycle.taxResult?.harvested) {
          cycleTekMap.set(cycle.cycleNumber, parseFloat(cycle.taxResult.harvested) / 1e6);
        }
      });
    }
    
    return cycles
      .map((cycle: RewardCycle) => {
        const d = new Date(cycle.timestamp);
        const hours = d.getHours();
        const minutes = d.getMinutes();
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        const displayMinutes = minutes.toString().padStart(2, '0');
        
        // Calculate actual cycle number (1-288) based on timestamp
        const startOfDay = new Date(d);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const minutesSinceStartOfDay = Math.floor((d.getTime() - startOfDay.getTime()) / (1000 * 60));
        const cycleNumber = Math.floor(minutesSinceStartOfDay / 5) + 1;
        
        // Use actual harvested TEK from epoch data if available, otherwise 0
        const harvestedTEK = cycleTekMap.get(cycleNumber) || 0;
        // Use SOL from historical API (already in SOL, not lamports)
        const distributedSOL = cycle.totalSOLDistributed || 0;
        
        return {
          date: d.toLocaleDateString(),
          time: `${displayHours}:${displayMinutes} ${period} EST`,
          status: 'Completed' as const,
          harvestedTEK,
          distributedSOL,
          epochNumber: cycleNumber,
        };
      })
      .filter((item) => {
        return item.harvestedTEK > 0 || item.distributedSOL > 0;
      });
  }, [historicalData, selectedEpoch, selectedEpochData]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const cardsPerPage = 9;
  const maxPages = 12;
  
  // Reset pagination when epoch changes
  useEffect(() => {
    setCurrentPage(0);
  }, [selectedEpoch]);
  
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
                  // Use statistics.totalSOLDistributed which is already in SOL (converted from lamports)
                  const sol = stats.totalSOLDistributed || 0;
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
                label="TEK Collected"
                value={(() => {
                  // totalNukeHarvested is in raw token units (with 6 decimals)
                  // Divide by 1e6 to get human-readable format
                  const tek = parseFloat(tax.totalNukeHarvested || '0') / 1e6;
                  return tek > 0 ? tek.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '0.00';
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
          <RewardSystem 
            selectedEpoch={selectedEpoch}
            onEpochChange={setSelectedEpoch}
          />
        </GlassCard>
      </section>

      {/* Section 3: Distributions with Pagination */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">
            Distributions Epoch: {(() => {
              // Use calculated epoch number
              if (selectedEpochNumber !== null) {
                return selectedEpochNumber;
              }
              // Fallback: show formatted date if no epoch number
              if (selectedEpoch) {
                const date = new Date(selectedEpoch + 'T00:00:00Z');
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
