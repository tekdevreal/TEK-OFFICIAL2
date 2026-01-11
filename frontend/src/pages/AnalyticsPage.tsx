import { useMemo, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { GlassCard } from '../components/GlassCard';
import { Table, type TableColumn } from '../components/Table';
import {
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { useRewards, useHistoricalRewards, useLiquiditySummary, useTreasuryBalance } from '../hooks/useApiData';
import './AnalyticsPage.css';

export interface LiquidityPoolPerformance {
  poolPair: string;
  totalFeesGenerated: string;
  average24HVolume: string;
}

export function AnalyticsPage() {
  // Time filter state: '24H' | 'Week' | 'Month' | 'All Time'
  const [timeFilter, setTimeFilter] = useState<'24H' | 'Week' | 'Month' | 'All Time'>('24H');
  
  // Treasury wallet address
  const treasuryWalletAddress = import.meta.env.VITE_TREASURY_WALLET_ADDRESS || 'DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo';

  // Fetch real data from API
  const { data: rewardsData, isLoading: isLoadingRewards } = useRewards(undefined, {
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  const { data: historicalData, isLoading: isLoadingHistorical } = useHistoricalRewards({ limit: 100 });

  const { data: liquiditySummaryData } = useLiquiditySummary({
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  const { data: treasuryBalanceData } = useTreasuryBalance(treasuryWalletAddress, {
    refetchInterval: 2 * 60 * 1000, // 2 minutes
  });

  // Helper function to get time range in milliseconds based on filter
  const getTimeRange = (filter: typeof timeFilter): number => {
    const now = Date.now();
    switch (filter) {
      case '24H':
        return now - (24 * 60 * 60 * 1000); // 24 hours
      case 'Week':
        return now - (7 * 24 * 60 * 60 * 1000); // 7 days
      case 'Month':
        return now - (30 * 24 * 60 * 60 * 1000); // 30 days
      case 'All Time':
        return 0; // No filter
      default:
        return now - (24 * 60 * 60 * 1000);
    }
  };

  // Get grouping size based on time filter (for X-axis labels)
  const getGroupingInfo = (filter: typeof timeFilter): { cyclesPerGroup: number; maxGroups: number; label: string } => {
    switch (filter) {
      case '24H':
        return { cyclesPerGroup: 24, maxGroups: 12, label: 'Cycles' }; // 2-hour groups, 12 groups = 24 hours
      case 'Week':
        return { cyclesPerGroup: 288, maxGroups: 7, label: 'Day' }; // Daily groups, 7 groups = 1 week
      case 'Month':
        return { cyclesPerGroup: 288, maxGroups: 30, label: 'Day' }; // Daily groups, 30 groups = 1 month
      case 'All Time':
        return { cyclesPerGroup: 288 * 7, maxGroups: 52, label: 'Week' }; // Weekly groups, up to 1 year
      default:
        return { cyclesPerGroup: 24, maxGroups: 12, label: 'Cycles' };
    }
  };

  // Calculate stats from real data
  const totalSOLDistributed = useMemo(() => {
    const sol = parseFloat(rewardsData?.tax?.totalSolDistributed || '0') / 1e9;
    return sol.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }, [rewardsData]);

  const averageSOLPerEpoch = useMemo(() => {
    if (!historicalData?.cycles || historicalData.cycles.length === 0) return '0.00';
    const totalSOL = historicalData.cycles.reduce((sum, cycle) => sum + (cycle.totalSOLDistributed || 0), 0);
    const avg = totalSOL / historicalData.cycles.length;
    return avg.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }, [historicalData]);

  const totalRewardEpochs = useMemo(() => {
    return (rewardsData?.tax?.distributionCount || 0).toString();
  }, [rewardsData]);

  const totalTreasuryDeployed = useMemo(() => {
    const sol = parseFloat(rewardsData?.tax?.totalSolToTreasury || '0') / 1e9;
    return `${sol.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL`;
  }, [rewardsData]);

  // Real data for Rewards Over Time chart - Filtered by selected time range
  const rewardsOverTimeData = useMemo(() => {
    if (!historicalData?.cycles || historicalData.cycles.length === 0) return [];
    
    const timeRangeStart = getTimeRange(timeFilter);
    const { cyclesPerGroup, maxGroups, label } = getGroupingInfo(timeFilter);
    
    // Filter cycles by time range
    const filteredCycles = historicalData.cycles
      .filter(cycle => {
        const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
        return timestamp >= timeRangeStart;
      })
      .sort((a, b) => {
        const timeA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
        const timeB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
        return timeA - timeB; // Oldest first
      });
    
    if (filteredCycles.length === 0) return [];
    
    // Group cycles based on the time filter
    const groupedData: Array<{ epoch: string; solDistributed: number; count: number }> = [];
    
    for (let i = 0; i < filteredCycles.length; i += cyclesPerGroup) {
      const group = filteredCycles.slice(i, i + cyclesPerGroup);
      const totalSOL = group.reduce((sum, cycle) => sum + (cycle.totalSOLDistributed || 0), 0);
      const avgSOL = group.length > 0 ? totalSOL / group.length : 0;
      
      // Create label based on grouping type
      let groupLabel = '';
      const firstCycleTime = typeof group[0].timestamp === 'string' ? new Date(group[0].timestamp) : new Date(group[0].timestamp);
      
      if (timeFilter === '24H') {
        // For 24H: show cycle ranges
        const startOfDay = new Date(firstCycleTime);
        startOfDay.setHours(0, 0, 0, 0);
        const minutesSinceStart = Math.floor((firstCycleTime.getTime() - startOfDay.getTime()) / (1000 * 60));
        const cycleNumber = Math.floor(minutesSinceStart / 5) + 1;
        const groupStart = Math.floor((cycleNumber - 1) / cyclesPerGroup) * cyclesPerGroup + 1;
        const groupEnd = Math.min(groupStart + cyclesPerGroup - 1, 288);
        groupLabel = `${label} ${groupStart}-${groupEnd}`;
      } else {
        // For Week, Month, All Time: show date
        groupLabel = firstCycleTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      
      groupedData.push({
        epoch: groupLabel,
        solDistributed: parseFloat(avgSOL.toFixed(4)),
        count: group.length
      });
    }
    
    return groupedData.slice(0, maxGroups);
  }, [historicalData, timeFilter]);

  // Real data for Volume vs Rewards Correlation chart - Filtered by selected time range
  const volumeVsRewardsData = useMemo(() => {
    if (!historicalData?.cycles) return [];
    
    const timeRangeStart = getTimeRange(timeFilter);
    const { maxGroups } = getGroupingInfo(timeFilter);
    
    // Filter cycles by time range
    const filteredCycles = historicalData.cycles
      .filter(cycle => {
        const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
        return timestamp >= timeRangeStart;
      })
      .reverse(); // Oldest first
    
    // Use liquidity data for volume (approximate)
    const volume24h = liquiditySummaryData?.volume24hUSD || 0;
    
    // Determine grouping period based on time filter
    let groupingHours = 4; // Default for 24H
    if (timeFilter === 'Week') groupingHours = 24; // Daily for week
    if (timeFilter === 'Month') groupingHours = 24; // Daily for month
    if (timeFilter === 'All Time') groupingHours = 24 * 7; // Weekly for all time
    
    // Group by time blocks
    const groupedData: { [key: string]: { solDistributed: number; count: number } } = {};
    
    filteredCycles.forEach((cycle) => {
      const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
      const date = new Date(timestamp);
      
      let dateKey = '';
      if (groupingHours < 24) {
        // For sub-daily grouping
        const hourBlock = Math.floor(date.getUTCHours() / groupingHours) * groupingHours;
        dateKey = `${date.toISOString().split('T')[0]} ${hourBlock}:00`;
      } else if (groupingHours === 24) {
        // Daily grouping
        dateKey = date.toISOString().split('T')[0];
      } else {
        // Weekly grouping
        const weekNumber = Math.floor(date.getTime() / (1000 * 60 * 60 * 24 * 7));
        dateKey = `Week ${weekNumber}`;
      }
      
      if (!groupedData[dateKey]) {
        groupedData[dateKey] = { solDistributed: 0, count: 0 };
      }
      
      groupedData[dateKey].solDistributed += cycle.totalSOLDistributed || 0;
      groupedData[dateKey].count += 1;
    });
    
    // Calculate volume per period (approximate)
    const periodsPerDay = 24 / groupingHours;
    const volumePerPeriod = volume24h / periodsPerDay;
    
    return Object.entries(groupedData)
      .map(([date, data]) => ({
        date,
        volume24h: parseFloat(volumePerPeriod.toFixed(4)),
        solDistributed: parseFloat(data.solDistributed.toFixed(4)),
      }))
      .slice(0, maxGroups);
  }, [historicalData, liquiditySummaryData, timeFilter]);

  // Real data for Treasury Balance Over Time chart - Filtered by selected time range
  const treasuryBalanceChartData = useMemo(() => {
    if (!historicalData?.cycles || !treasuryBalanceData) return [];
    
    const timeRangeStart = getTimeRange(timeFilter);
    const { maxGroups } = getGroupingInfo(timeFilter);
    
    // Filter cycles by time range
    const filteredCycles = historicalData.cycles
      .filter(cycle => {
        const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
        return timestamp >= timeRangeStart;
      })
      .reverse(); // Oldest first
    
    // Calculate cumulative received for the period
    let cumulativeReceived = 0;
    
    // Get current treasury balance from API
    const currentBalance = treasuryBalanceData.balanceSOL || 0;
    
    // Pending allocation (placeholder - would need API endpoint)
    const pendingAllocation = 0; // TODO: Get from API when available
    
    // Determine grouping period based on time filter
    let groupingHours = 4; // Default for 24H
    if (timeFilter === 'Week') groupingHours = 24; // Daily for week
    if (timeFilter === 'Month') groupingHours = 24; // Daily for month
    if (timeFilter === 'All Time') groupingHours = 24 * 7; // Weekly for all time
    
    // Group by time periods
    const groupedData: { [key: string]: number } = {};
    
    filteredCycles.forEach((cycle) => {
      const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
      const date = new Date(timestamp);
      
      let dateKey = '';
      if (groupingHours < 24) {
        const hourBlock = Math.floor(date.getUTCHours() / groupingHours) * groupingHours;
        dateKey = `${date.toISOString().split('T')[0]} ${hourBlock}:00`;
      } else if (groupingHours === 24) {
        dateKey = date.toISOString().split('T')[0];
      } else {
        const weekNumber = Math.floor(date.getTime() / (1000 * 60 * 60 * 24 * 7));
        dateKey = `Week ${weekNumber}`;
      }
      
      // 25% of distributed SOL goes to treasury
      const treasuryAmount = (cycle.totalSOLDistributed || 0) * 0.25;
      cumulativeReceived += treasuryAmount;
      
      groupedData[dateKey] = cumulativeReceived;
    });
    
    return Object.entries(groupedData).map(([date, receivedInPeriod]) => ({
      date,
      treasuryBalance: parseFloat(currentBalance.toFixed(4)),
      deployed: parseFloat(pendingAllocation.toFixed(4)),
      receivedIn2Days: parseFloat(receivedInPeriod.toFixed(4)), // Keep same key for compatibility
    })).slice(0, maxGroups);
  }, [historicalData, treasuryBalanceData, timeFilter]);

  // Real Liquidity Pool Performance table data
  const liquidityPoolData: LiquidityPoolPerformance[] = useMemo(() => {
    if (!liquiditySummaryData) {
      return [{
        poolPair: 'NUKE / SOL',
        totalFeesGenerated: 'Loading...',
        average24HVolume: 'Loading...',
      }];
    }
    
    return [{
      poolPair: 'NUKE / SOL',
      totalFeesGenerated: `$${(liquiditySummaryData.volume24hUSD ? liquiditySummaryData.volume24hUSD * 0.003 : 0).toLocaleString()}`, // 0.3% fee
      average24HVolume: `$${liquiditySummaryData.volume24hUSD?.toLocaleString() || '0'}`,
    }];
  }, [liquiditySummaryData]);

  // Table columns for Liquidity Pool Performance
  const liquidityPoolColumns: TableColumn<LiquidityPoolPerformance>[] = useMemo(() => [
    {
      key: 'poolPair',
      header: 'POOL PAIR',
      accessor: (row) => row.poolPair,
      sortable: true,
      sortFn: (a, b) => a.poolPair.localeCompare(b.poolPair),
    },
    {
      key: 'totalFeesGenerated',
      header: 'TOTAL FEES GENERATED',
      accessor: (row) => row.totalFeesGenerated,
      sortable: true,
      sortFn: (a, b) => {
        const aNum = parseFloat(a.totalFeesGenerated.replace(/[^0-9.]/g, ''));
        const bNum = parseFloat(b.totalFeesGenerated.replace(/[^0-9.]/g, ''));
        return aNum - bNum;
      },
    },
    {
      key: 'average24HVolume',
      header: 'AVERAGE 24H VOLUME',
      accessor: (row) => row.average24HVolume,
      sortable: true,
      sortFn: (a, b) => {
        const aNum = parseFloat(a.average24HVolume.replace(/[^0-9.]/g, ''));
        const bNum = parseFloat(b.average24HVolume.replace(/[^0-9.]/g, ''));
        return aNum - bNum;
      },
    },
  ], []);

  // Loading state
  if (isLoadingRewards || isLoadingHistorical) {
    return (
      <div className="analytics-page">
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading analytics data...
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      {/* Analytics Section */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">Analytics</h2>
          <p className="section-subtitle">Historical performance metrics and protocol activity trends.</p>
          
          {/* Stats Summary */}
          <div className="analytics-stats">
            <StatCard
              label="Total SOL Distributed (All Time)"
              value={totalSOLDistributed}
            />
            <StatCard
              label="Average SOL per Epoch"
              value={averageSOLPerEpoch}
            />
            <StatCard
              label="Total Reward Epochs"
              value={totalRewardEpochs}
            />
            <StatCard
              label="Total Treasury Deployed"
              value={totalTreasuryDeployed}
            />
          </div>

          {/* Time Filter Controls */}
          <div className="analytics-filters-row">
            <div className="filter-group">
              {(['24H', 'Week', 'Month', 'All Time'] as const).map((filter) => (
                <button
                  key={filter}
                  className={`filter-button ${timeFilter === filter ? 'active' : ''}`}
                  onClick={() => setTimeFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Rewards Over Time */}
          <div className="analytics-chart-section">
            <h3 className="chart-section-title">Rewards Over Time</h3>
            <p className="chart-section-description">Average rewards per cycle range</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rewardsOverTimeData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis 
                  dataKey="epoch" 
                  stroke="var(--text-secondary)"
                  tick={{ fill: 'var(--text-secondary)' }}
                />
                <YAxis 
                  stroke="var(--text-secondary)"
                  tick={{ fill: 'var(--text-secondary)' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(0, 0, 0, 0.95)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    padding: '10px 12px'
                  }}
                  labelStyle={{ color: '#ffffff' }}
                  itemStyle={{ color: '#ffffff' }}
                  cursor={{ stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 1 }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="solDistributed" 
                  stroke="#6366f1" 
                  strokeWidth={2}
                  name="SOL Distributed"
                  dot={{ fill: '#6366f1' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Section 3: Volume vs Rewards Correlation */}
          <div className="analytics-chart-section">
            <h3 className="chart-section-title">Volume vs Rewards Correlation</h3>
            <p className="chart-section-description">Trading volume and rewards per period</p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={volumeVsRewardsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--text-secondary)"
                  tick={{ fill: 'var(--text-secondary)' }}
                />
                <YAxis 
                  yAxisId="left"
                  stroke="var(--text-secondary)"
                  tick={{ fill: 'var(--text-secondary)' }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right"
                  stroke="var(--text-secondary)"
                  tick={{ fill: 'var(--text-secondary)' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(0, 0, 0, 0.95)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    padding: '10px 12px'
                  }}
                  labelStyle={{ color: '#ffffff' }}
                  itemStyle={{ color: '#ffffff' }}
                  cursor={{ stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 1 }}
                />
                <Legend />
                <Bar 
                  yAxisId="left"
                  dataKey="volume24h" 
                  fill="#8b5cf6" 
                  name="24H Trading Volume"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="solDistributed" 
                  stroke="#6366f1" 
                  strokeWidth={2}
                  name="SOL Distributed"
                  dot={{ fill: '#6366f1' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Section 4: Treasury Balance Over Time */}
          <div className="analytics-chart-section">
            <h3 className="chart-section-title">Treasury Balance Over Time</h3>
            <p className="chart-section-description">Treasury accumulation over time</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={treasuryBalanceChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--text-secondary)"
                  tick={{ fill: 'var(--text-secondary)' }}
                />
                <YAxis 
                  stroke="var(--text-secondary)"
                  tick={{ fill: 'var(--text-secondary)' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(0, 0, 0, 0.95)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    padding: '10px 12px'
                  }}
                  labelStyle={{ color: '#ffffff' }}
                  itemStyle={{ color: '#ffffff' }}
                  cursor={{ stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 1 }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="receivedIn2Days" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Treasury Received (SOL)"
                  dot={{ fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Section 5: Liquidity Pool Performance */}
          <div className="analytics-table-section">
            <h3 className="chart-section-title">Liquidity Pool Performance</h3>
            <p className="chart-section-description">Show which pools contribute most to protocol activity</p>
            <div className="analytics-table-container">
              <Table
                data={liquidityPoolData}
                columns={liquidityPoolColumns}
                searchable={false}
                pagination={false}
                exportable={false}
                loading={!liquiditySummaryData}
              />
            </div>
          </div>

          {/* Section 6: Distribution Reliability Metrics */}
          <div className="analytics-metrics-section">
            <h3 className="chart-section-title">Distribution Reliability Metrics</h3>
            <p className="chart-section-description">Show system reliability and operational performance</p>
            <div className="reliability-metrics-grid">
              <div className="metric-item">
                <span className="metric-label">Total Distributions:</span>
                <span className="metric-value">{rewardsData?.tax?.distributionCount || 0}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Total NUKE Harvested:</span>
                <span className="metric-value">
                  {(parseFloat(rewardsData?.tax?.totalNukeHarvested || '0') / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Total SOL to Holders:</span>
                <span className="metric-value">
                  {(parseFloat(rewardsData?.tax?.totalSolDistributed || '0') / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Total SOL to Treasury:</span>
                <span className="metric-value">
                  {(parseFloat(rewardsData?.tax?.totalSolToTreasury || '0') / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL
                </span>
              </div>
            </div>
          </div>

        </GlassCard>
      </section>
    </div>
  );
}
