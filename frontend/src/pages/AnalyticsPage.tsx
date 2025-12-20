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
import './AnalyticsPage.css';

export interface LiquidityPoolPerformance {
  poolPair: string;
  totalFeesGenerated: string;
  average24HVolume: string;
}

export function AnalyticsPage() {
  // Stats data
  const totalSOLDistributed = '125,450.75';
  const averageSOLPerEpoch = '1,045.42';
  const totalRewardEpochs = '120';
  const totalTreasuryDeployed = '$45,200';

  // Placeholder data for Rewards Over Time chart
  const rewardsOverTimeData = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return {
        epoch: `Epoch ${120 - (29 - i)}`,
        date: date.toISOString().split('T')[0],
        solDistributed: Math.floor(Math.random() * 2000) + 500,
      };
    });
  }, []);

  // Placeholder data for Volume vs Rewards Correlation chart
  const volumeVsRewardsData = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return {
        date: date.toISOString().split('T')[0],
        volume24h: Math.floor(Math.random() * 500000) + 100000,
        solDistributed: Math.floor(Math.random() * 2000) + 500,
      };
    });
  }, []);

  // Placeholder data for Treasury Balance Over Time chart
  const treasuryBalanceData = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return {
        date: date.toISOString().split('T')[0],
        treasuryBalance: Math.floor(Math.random() * 10000) + 20000,
        deployed: Math.floor(Math.random() * 5000) + 10000,
        available: Math.floor(Math.random() * 5000) + 5000,
      };
    });
  }, []);

  // Liquidity Pool Performance table data
  const liquidityPoolData: LiquidityPoolPerformance[] = useMemo(() => {
    return [
      {
        poolPair: 'NUKE / SOL',
        totalFeesGenerated: '$12,450',
        average24HVolume: '$125,800',
      },
      {
        poolPair: 'NUKE / USDC',
        totalFeesGenerated: '$8,920',
        average24HVolume: '$95,200',
      },
    ];
  }, []);

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

          {/* Section 2: Rewards Over Time */}
          <div className="analytics-chart-section">
            <h3 className="chart-section-title">Rewards Over Time</h3>
            <p className="chart-section-description">Visualize reward consistency and historical distribution activity</p>
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
            <p className="chart-section-description">Show relationship between trading activity and rewards</p>
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
            <p className="chart-section-description">Show treasury growth and usage over time</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={treasuryBalanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                  name="Deployed"
                  dot={{ fill: '#f59e0b' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="available" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Available"
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
                loading={false}
              />
            </div>
          </div>

          {/* Section 6: Distribution Reliability Metrics */}
          <div className="analytics-metrics-section">
            <h3 className="chart-section-title">Distribution Reliability Metrics</h3>
            <p className="chart-section-description">Show system reliability and operational performance</p>
            <div className="reliability-metrics-grid">
              <div className="metric-item">
                <span className="metric-label">Successful Reward Epochs:</span>
                <span className="metric-value">98.5%</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Failed Reward Epochs:</span>
                <span className="metric-value">1.5%</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Average Distribution Processing Time:</span>
                <span className="metric-value">2.3 seconds</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Average Harvest to Distribution Delay:</span>
                <span className="metric-value">15 minutes</span>
              </div>
            </div>
          </div>

          {/* Section 7: Data Access & Transparency */}
          <div className="analytics-data-access-section">
            <h3 className="chart-section-title">Data Access & Transparency</h3>
            <div className="data-access-buttons">
              <button className="data-access-button" disabled>
                View Raw Data (Spreadsheet)
              </button>
              <button className="data-access-button" disabled>
                Export Data (CSV)
              </button>
              <button className="data-access-button" disabled>
                View On-Chain References
              </button>
            </div>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
