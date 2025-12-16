import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { fetchHistoricalRewards } from '../services/api';
import type { RewardCycle } from '../types/api';
import { showNotification } from '../components/Notifications';
import './HistoricalRewardsPage.css';

type TimeRange = '7d' | '30d' | '90d' | 'all';
type ChartType = 'line' | 'area';

export function HistoricalRewardsPage() {
  const [data, setData] = useState<RewardCycle[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [chartType, setChartType] = useState<ChartType>('area');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Calculate date range
        let startDate: string | undefined;
        if (timeRange !== 'all') {
          const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
          const date = new Date();
          date.setDate(date.getDate() - days);
          startDate = date.toISOString();
        }

        const response = await fetchHistoricalRewards({
          startDate,
          limit: 1000, // Get up to 1000 cycles
        });

        // Sort by timestamp (oldest first for chart)
        const sortedCycles = [...response.cycles].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        setData(sortedCycles);
      } catch (err) {
        console.error('Error loading historical rewards:', err);
        setError(err instanceof Error ? err.message : 'Failed to load historical data');
        showNotification('Failed to load historical rewards', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [timeRange]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const ChartComponent = chartType === 'area' ? AreaChart : LineChart;
  const DataComponent = chartType === 'area' ? Area : Line;

  if (loading && data.length === 0) {
    return (
      <div className="historical-rewards-page">
        <div className="page-header">
          <h2>Historical Reward Cycles</h2>
          <p className="page-subtitle">Reward distribution trends over time</p>
        </div>
        <div className="chart-loading">Loading historical data...</div>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="historical-rewards-page">
        <div className="page-header">
          <h2>Historical Reward Cycles</h2>
          <p className="page-subtitle">Reward distribution trends over time</p>
        </div>
        <div className="chart-error">{error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="historical-rewards-page">
        <div className="page-header">
          <h2>Historical Reward Cycles</h2>
          <p className="page-subtitle">Reward distribution trends over time</p>
        </div>
        <div className="chart-no-data">
          No historical data available yet. Data will appear after reward cycles run.
        </div>
      </div>
    );
  }

  return (
    <div className="historical-rewards-page">
      <div className="page-header">
        <h2>Historical Reward Cycles</h2>
        <p className="page-subtitle">Reward distribution trends over time</p>
      </div>

      <div className="chart-controls">
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          className="time-range-select"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="all">All Time</option>
        </select>
        <div className="chart-type-toggle">
          <button
            onClick={() => setChartType('area')}
            className={chartType === 'area' ? 'active' : ''}
          >
            Area
          </button>
          <button
            onClick={() => setChartType('line')}
            className={chartType === 'line' ? 'active' : ''}
          >
            Line
          </button>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={400}>
          <ChartComponent data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSOL" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4a90e2" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#4a90e2" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorHolders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#28a745" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#28a745" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatDate}
              angle={-45}
              textAnchor="end"
              height={80}
              interval="preserveStartEnd"
            />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'Total SOL Distributed') {
                  return [`${(value || 0).toFixed(6)} SOL`, name];
                }
                return [(value || 0).toLocaleString(), name];
              }}
              labelFormatter={(label) => `Date: ${formatDate(label)}`}
            />
            <Legend />
            <DataComponent
              yAxisId="right"
              type="monotone"
              dataKey="totalSOLDistributed"
              stroke="#4a90e2"
              fill={chartType === 'area' ? 'url(#colorSOL)' : undefined}
              name="Total SOL Distributed"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <DataComponent
              yAxisId="left"
              type="monotone"
              dataKey="eligibleHoldersCount"
              stroke="#28a745"
              fill={chartType === 'area' ? 'url(#colorHolders)' : undefined}
              name="Eligible Holders"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </ChartComponent>
        </ResponsiveContainer>
      </div>

      <div className="chart-summary">
        <div className="summary-item">
          <span className="summary-label">Data Points:</span>
          <span className="summary-value">{data.length}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Latest SOL:</span>
          <span className="summary-value">
            {(data[data.length - 1]?.totalSOLDistributed || 0).toFixed(6)} SOL
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Latest Eligible:</span>
          <span className="summary-value">
            {data[data.length - 1]?.eligibleHoldersCount.toLocaleString()}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Total SOL (Period):</span>
          <span className="summary-value">
            {data.reduce((sum, cycle) => sum + (cycle.totalSOLDistributed || 0), 0).toFixed(6)} SOL
          </span>
        </div>
      </div>
    </div>
  );
}

