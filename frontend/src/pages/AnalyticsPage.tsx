import { useMemo } from 'react';
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

  // Real data for Rewards Over Time chart - Last 2 days, grouped by cycle ranges (24 cycles per group)
  const rewardsOverTimeData = useMemo(() => {
    if (!historicalData?.cycles) return [];
    
    // Filter cycles from last 2 days
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
    const recentCycles = historicalData.cycles
      .filter(cycle => {
        const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
        return timestamp >= twoDaysAgo;
      })
      .reverse(); // Oldest first
    
    // Group by 24 cycles (2 hours of cycles, since 1 cycle = 5 min, 24 cycles = 120 min = 2 hours)
    const groupedData: { [key: string]: { solDistributed: number; count: number; minCycle: number; maxCycle: number } } = {};
    
    recentCycles.forEach((cycle) => {
      const cycleNum = cycle.id ? parseInt(cycle.id.split('T')[1]?.split(':')[0] || '0') : 0;
      
      // Group by cycle ranges (e.g., 1-24, 25-48, 49-72, etc.)
      const groupStart = Math.floor((cycleNum - 1) / 24) * 24 + 1;
      const groupEnd = groupStart + 23;
      const groupKey = `Cycles ${groupStart}-${groupEnd}`;
      
      if (!groupedData[groupKey]) {
        groupedData[groupKey] = { solDistributed: 0, count: 0, minCycle: groupStart, maxCycle: groupEnd };
      }
      
      groupedData[groupKey].solDistributed += cycle.totalSOLDistributed || 0;
      groupedData[groupKey].count += 1;
    });
    
    // Convert to array and calculate averages
    return Object.entries(groupedData)
      .map(([epoch, data]) => ({
        epoch,
        date: epoch,
        solDistributed: data.count > 0 ? parseFloat((data.solDistributed / data.count).toFixed(4)) : 0, // Average per cycle in group (4 decimals)
      }))
      .slice(0, 12); // Show max 12 groups (24 hours worth)
  }, [historicalData]);

  // Real data for Volume vs Rewards Correlation chart - Last 2 days, grouped by 4 hours (12 bars for 48 hours)
  const volumeVsRewardsData = useMemo(() => {
    if (!historicalData?.cycles) return [];
    
    // Filter cycles from last 2 days
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
    const recentCycles = historicalData.cycles
      .filter(cycle => {
        const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
        return timestamp >= twoDaysAgo;
      })
      .reverse(); // Oldest first
    
    // Use liquidity data for volume (approximate)
    const volume24h = liquiditySummaryData?.volume24hUSD || 0;
    
    // Group by 4-hour blocks for better visualization (48 hours / 4 = 12 bars)
    const groupedData: { [key: string]: { solDistributed: number; count: number } } = {};
    
    recentCycles.forEach((cycle) => {
      const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
      const date = new Date(timestamp);
      const hourBlock = Math.floor(date.getUTCHours() / 4) * 4; // 0, 4, 8, 12, 16, 20
      const dateKey = `${date.toISOString().split('T')[0]} ${hourBlock}:00`;
      
      if (!groupedData[dateKey]) {
        groupedData[dateKey] = { solDistributed: 0, count: 0 };
      }
      
      groupedData[dateKey].solDistributed += cycle.totalSOLDistributed || 0;
      groupedData[dateKey].count += 1;
    });
    
    return Object.entries(groupedData)
      .map(([date, data]) => ({
        date,
        volume24h: parseFloat((volume24h / 6).toFixed(4)), // Approximate volume per 4-hour period (4 decimals)
        solDistributed: parseFloat(data.solDistributed.toFixed(4)), // Total for the 4-hour period (4 decimals)
      }))
      .slice(0, 12); // Max 12 bars (2 days in 4-hour blocks)
  }, [historicalData, liquiditySummaryData]);

  // Real data for Treasury Balance Over Time chart - Last 2 days
  const treasuryBalanceChartData = useMemo(() => {
    if (!historicalData?.cycles || !treasuryBalanceData) return [];
    
    // Filter cycles from last 2 days
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
    const recentCycles = historicalData.cycles
      .filter(cycle => {
        const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
        return timestamp >= twoDaysAgo;
      })
      .reverse(); // Oldest first
    
    // Calculate cumulative received for the 2-day period
    let cumulativeReceived = 0;
    
    // Get current treasury balance from API
    const currentBalance = treasuryBalanceData.balanceSOL || 0;
    
    // Pending allocation (placeholder - would need API endpoint)
    const pendingAllocation = 0; // TODO: Get from API when available
    
    // Group by 4-hour periods for better visualization
    const groupedData: { [key: string]: number } = {};
    
    recentCycles.forEach((cycle) => {
      const timestamp = typeof cycle.timestamp === 'string' ? new Date(cycle.timestamp).getTime() : cycle.timestamp;
      const date = new Date(timestamp);
      const hourBlock = Math.floor(date.getUTCHours() / 4) * 4;
      const dateKey = `${date.toISOString().split('T')[0]} ${hourBlock}:00`;
      
      // 25% of distributed SOL goes to treasury
      const treasuryAmount = (cycle.totalSOLDistributed || 0) * 0.25;
      cumulativeReceived += treasuryAmount;
      
      groupedData[dateKey] = cumulativeReceived;
    });
    
    return Object.entries(groupedData).map(([date, receivedIn2Days]) => ({
      date,
      treasuryBalance: parseFloat(currentBalance.toFixed(4)), // Current balance from wallet (4 decimals)
      deployed: parseFloat(pendingAllocation.toFixed(4)), // Pending allocation (4 decimals)
      receivedIn2Days: parseFloat(receivedIn2Days.toFixed(4)), // Total received in last 2 days (4 decimals)
    }));
  }, [historicalData, treasuryBalanceData]);

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
          <p className="section-subtitle">Historical performance metrics and protocol activity trends from the last two days.</p>
          
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

          {/* Section 2: Rewards Over Time */}
          <div className="analytics-chart-section">
            <h3 className="chart-section-title">Rewards Over Time</h3>
            <p className="chart-section-description">Average rewards per cycle range from the last two days</p>
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
                    backgroundColor: 'var(--bg-card)', 
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
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
            <p className="chart-section-description">Trading volume and rewards per 4-hour period from the last two days</p>
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
                    backgroundColor: 'var(--bg-card)', 
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
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
            <p className="chart-section-description">Treasury accumulation and data</p>
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
                    backgroundColor: 'var(--bg-card)', 
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="treasuryBalance" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  name="Treasury Balance"
                  dot={{ fill: '#22c55e' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="deployed" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  name="Pending Allocation"
                  dot={{ fill: '#f59e0b' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="receivedIn2Days" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Received in 2 Days"
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
