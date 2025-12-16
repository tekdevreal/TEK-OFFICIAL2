import { useState, useEffect } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fetchHolders } from '../services/api';
import type { Holder } from '../types/api';
import './Charts.css';

export function HoldersValueChart() {
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchHolders({ limit: 20, offset: 0 });
        // Sort by USD value descending and take top 20
        const holders = response.holders || [];
        const sorted = holders.sort((a, b) => {
          const aVal = (a.usdValue !== null && a.usdValue !== undefined && !isNaN(a.usdValue)) ? Number(a.usdValue) : 0;
          const bVal = (b.usdValue !== null && b.usdValue !== undefined && !isNaN(b.usdValue)) ? Number(b.usdValue) : 0;
          return bVal - aVal;
        });
        setHolders(sorted.slice(0, 20));
      } catch (error) {
        console.error('Error loading holders chart data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="chart-loading">Loading chart data...</div>;
  }

  if (holders.length === 0) {
    return (
      <div className="chart-container">
        <h3>Top Holders by USD Value</h3>
        <div className="chart-no-data">No holder data available</div>
      </div>
    );
  }

  const chartData = holders.map((holder, index) => ({
    name: `Holder ${index + 1}`,
    pubkey: holder.pubkey.substring(0, 8) + '...',
    value: (() => {
      const usd = holder.usdValue;
      if (usd === null || usd === undefined || isNaN(usd)) {
        return 0;
      }
      return parseFloat(Number(usd).toFixed(2));
    })(),
    status: holder.eligibilityStatus,
  }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'eligible':
        return '#28a745';
      case 'excluded':
        return '#ffc107';
      case 'blacklisted':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  return (
    <div className="chart-container">
      <h3>Top 20 Holders by USD Value</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="pubkey"
            angle={-45}
            textAnchor="end"
            height={100}
            interval={0}
            fontSize={10}
          />
          <YAxis />
          <Tooltip
            formatter={(value: number) => `$${(value || 0).toFixed(2)}`}
            labelFormatter={(label, payload) => {
              if (payload && payload[0]) {
                return `Pubkey: ${payload[0].payload.pubkey}`;
              }
              return label;
            }}
          />
          <Legend />
          <Bar
            dataKey="value"
            name="USD Value"
            radius={[4, 4, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getStatusColor(entry.status)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-summary">
        <div className="summary-item">
          <span className="summary-label">Total Value:</span>
          <span className="summary-value">
            ${chartData.reduce((sum, item) => sum + item.value, 0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

