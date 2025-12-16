import { useState, useEffect } from 'react';
import { fetchRewards } from '../services/api';
import type { RewardsResponse } from '../types/api';
import './RewardSummary.css';

interface RewardSummaryProps {
  refreshInterval?: number;
}

export function RewardSummary({ refreshInterval = 60000 }: RewardSummaryProps) {
  const [data, setData] = useState<RewardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRewards = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchRewards();
      setData(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch rewards';
      setError(errorMessage);
      console.error('Error loading rewards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRewards();
  }, []);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadRewards();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getTimeUntilNext = (nextRun: string | null) => {
    if (!nextRun) return 'N/A';
    const now = new Date().getTime();
    const next = new Date(nextRun).getTime();
    const diff = next - now;
    
    if (diff <= 0) return 'Due now';
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <div className="reward-summary-container">
        <div className="loading">Loading reward summary...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reward-summary-container">
        <div className="error-message">Error: {error}</div>
      </div>
    );
  }

  if (!data || !data.statistics) {
    return (
      <div className="reward-summary-container">
        <div className="loading">Loading reward summary...</div>
      </div>
    );
  }

  // Ensure tokenPrice exists
  if (!data.tokenPrice) {
    data.tokenPrice = { sol: null, usd: null, source: null };
  }

  const stats = data.statistics;

  return (
    <div className="reward-summary-container">
      <h2>Reward Summary</h2>
      
      <div className="summary-grid">
        <div className="summary-card">
          <div className="card-label">Scheduler Status</div>
          <div className="card-value">
            <span className={data.isRunning ? 'status-running' : 'status-idle'}>
              {data.isRunning ? 'Running' : 'Idle'}
            </span>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">Last Run</div>
          <div className="card-value">{formatDate(data.lastRun)}</div>
        </div>

        <div className="summary-card">
          <div className="card-label">Next Run</div>
          <div className="card-value">
            {formatDate(data.nextRun)}
            <div className="time-until">({getTimeUntilNext(data.nextRun)})</div>
          </div>
        </div>

        <div className="summary-card highlight">
          <div className="card-label">NUKE Price</div>
          <div className="card-value">
            {data.tokenPrice?.sol !== null && data.tokenPrice?.sol !== undefined && data.tokenPrice.sol > 0
              ? `${data.tokenPrice.sol.toFixed(8)} SOL`
              : 'N/A (Raydium)'}
          </div>
        </div>
      </div>

      <div className="statistics-grid">
        <div className="stat-card">
          <div className="stat-label">Total Holders</div>
          <div className="stat-value">{(stats.totalHolders || 0).toLocaleString()}</div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-label">Eligible Holders</div>
          <div className="stat-value stat-eligible">
            {(stats.eligibleHolders || 0).toLocaleString()}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Excluded Holders</div>
          <div className="stat-value">{(stats.excludedHolders || 0).toLocaleString()}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Blacklisted</div>
          <div className="stat-value">{(stats.blacklistedHolders || 0).toLocaleString()}</div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-label">Pending Payouts</div>
          <div className="stat-value stat-pending">
            {(stats.pendingPayouts || 0).toLocaleString()}
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-label">Total SOL Distributed</div>
          <div className="stat-value stat-sol">
            {(stats.totalSOLDistributed || 0).toFixed(6)} SOL
          </div>
        </div>
      </div>
    </div>
  );
}

