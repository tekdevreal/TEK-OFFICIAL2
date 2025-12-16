import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fetchPayouts } from '../services/api';
import type { PayoutsResponse } from '../types/api';
import './Charts.css';

export function PayoutStatusChart() {
  const [data, setData] = useState<PayoutsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchPayouts({ limit: 1000 });
        setData(response);
      } catch (error) {
        console.error('Error loading payout chart data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !data || !data.summary) {
    return <div className="chart-loading">Loading chart data...</div>;
  }

  const chartData = [
    {
      name: 'Status',
      Pending: data.summary.pending || 0,
      Failed: data.summary.failed || 0,
    },
  ];

  if ((data.summary.pending || 0) === 0 && (data.summary.failed || 0) === 0) {
    return (
      <div className="chart-container">
        <h3>Payout Status</h3>
        <div className="chart-no-data">No payout data available</div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3>Payout Status</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip formatter={(value: number) => value.toLocaleString()} />
          <Legend />
          <Bar dataKey="Pending" fill="#ffc107" />
          <Bar dataKey="Failed" fill="#dc3545" />
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-summary">
        <div className="summary-item">
          <span className="summary-label">Total SOL:</span>
          <span className="summary-value">
            {data.summary?.totalSOL?.toFixed(6) || '0.000000'} SOL
          </span>
        </div>
      </div>
    </div>
  );
}

