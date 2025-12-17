import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fetchRewards } from '../services/api';
import type { RewardsResponse } from '../types/api';
import './Charts.css';

interface TrendDataPoint {
  timestamp: string;
  eligibleHolders: number;
  pendingPayouts: number;
  totalSOL: number;
}

export function RewardTrendsChart() {
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [currentData, setCurrentData] = useState<RewardsResponse | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchRewards();
        setCurrentData(response);

        // Add current data point to trend
        if (response && response.statistics) {
          const now = new Date().toLocaleTimeString();
          const newPoint: TrendDataPoint = {
            timestamp: now,
            eligibleHolders: response.statistics.eligibleHolders || 0,
            pendingPayouts: response.statistics.pendingPayouts || 0,
            totalSOL: response.statistics.totalSOLDistributed || 0,
          };

          setTrendData(prev => {
            const updated = [...prev, newPoint];
            // Keep only last 20 data points
            return updated.slice(-20);
          });
        }

      } catch (error) {
        console.error('Error loading trend data:', error);
      }
    };

    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (trendData.length === 0) {
    return (
      <div className="chart-container">
        <h3>Reward Trends</h3>
        <div className="chart-no-data">Collecting trend data...</div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3>Reward Trends (Last 20 Updates)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            angle={-45}
            textAnchor="end"
            height={80}
            fontSize={10}
          />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="eligibleHolders"
            stroke="#28a745"
            name="Eligible Holders"
            strokeWidth={2}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="pendingPayouts"
            stroke="#ffc107"
            name="Pending Payouts"
            strokeWidth={2}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="totalSOL"
            stroke="#4a90e2"
            name="Total SOL"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
      {currentData && currentData.statistics && (
        <div className="chart-summary">
          <div className="summary-item">
            <span className="summary-label">Current Eligible:</span>
            <span className="summary-value">{currentData.statistics?.eligibleHolders || 0}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Current SOL:</span>
            <span className="summary-value">
              {currentData.statistics.totalSOLDistributed?.toFixed(6) || '0.000000'} SOL
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

