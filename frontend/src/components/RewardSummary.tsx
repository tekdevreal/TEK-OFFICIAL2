import { useState, useEffect } from 'react';
import { fetchRewards } from '../services/api';
import type { RewardsResponse } from '../types/api';
import './RewardSummary.css';

interface RewardSummaryProps {
  refreshInterval?: number;
}

export function RewardSummary({ refreshInterval = 300000 }: RewardSummaryProps) {
  const [data, setData] = useState<RewardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRewards = async () => {
    try {
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

  const tax = data.tax || {
    totalNukeHarvested: '0',
    totalNukeSold: '0',
    totalSolDistributed: '0',
    totalSolToTreasury: '0',
    lastTaxDistribution: null,
    lastSwapTx: null,
    lastDistributionTx: null,
    distributionCount: 0,
  };

  return (
    <div className="reward-summary-container">
      <div className="tax-section">
        <div className="tax-grid">
          <div className="tax-card highlight">
            <div className="tax-label">NUKE Harvested</div>
            <div className="tax-value">
              {(() => {
                // totalNukeHarvested is in raw token units (with 6 decimals)
                // Divide by 1e6 to get human-readable format
                const nuke = parseFloat(tax.totalNukeHarvested || '0') / 1e6;
                return nuke > 0 ? nuke.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0.000000';
              })()}
            </div>
            <div className="tax-subtext">Total Collected</div>
          </div>

          <div className="tax-card highlight">
            <div className="tax-label">SOL to Holders</div>
            <div className="tax-value stat-sol">
              {(() => {
                const sol = parseFloat(tax.totalSolDistributed || '0') / 1e9;
                return sol > 0 ? `${sol.toFixed(6)} SOL` : '0.000000 SOL';
              })()}
            </div>
            <div className="tax-subtext">75% Distribution</div>
          </div>
        </div>
      </div>
    </div>
  );
}
