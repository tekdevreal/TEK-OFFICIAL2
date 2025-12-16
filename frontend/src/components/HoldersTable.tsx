import { useState, useEffect } from 'react';
import { fetchHolders } from '../services/api';
import type { Holder } from '../types/api';
import './HoldersTable.css';

interface HoldersTableProps {
  refreshInterval?: number;
}

export function HoldersTable({ refreshInterval = 60000 }: HoldersTableProps) {
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  
  // Pagination
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  
  // Filters
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [searchPubkey, setSearchPubkey] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<'all' | 'eligible' | 'excluded' | 'blacklisted'>('all');

  const loadHolders = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetchHolders({
        eligibleOnly: eligibleOnly || undefined,
        limit,
        offset,
      });
      
      setHolders(response.holders);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch holders';
      setError(errorMessage);
      console.error('Error loading holders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHolders();
  }, [offset, eligibleOnly]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadHolders();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [refreshInterval, offset, eligibleOnly]);

  // Filter holders by eligibility status and search
  const filteredHolders = holders.filter(holder => {
    if (eligibilityFilter !== 'all' && holder.eligibilityStatus !== eligibilityFilter) {
      return false;
    }
    if (searchPubkey && !holder.pubkey.toLowerCase().includes(searchPubkey.toLowerCase())) {
      return false;
    }
    return true;
  });

  const formatPubkey = (pubkey: string) => {
    return `${pubkey.substring(0, 8)}...${pubkey.substring(pubkey.length - 8)}`;
  };

  const formatBalance = (balance: string) => {
    const num = BigInt(balance);
    return (Number(num) / 1e9).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'eligible':
        return 'badge-eligible';
      case 'excluded':
        return 'badge-excluded';
      case 'blacklisted':
        return 'badge-blacklisted';
      default:
        return '';
    }
  };

  return (
    <div className="holders-table-container">
      <div className="table-header">
        <h2>Token Holders</h2>
        <div className="table-controls">
          <input
            type="text"
            placeholder="Search by pubkey..."
            value={searchPubkey}
            onChange={(e) => setSearchPubkey(e.target.value)}
            className="search-input"
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={eligibleOnly}
              onChange={(e) => setEligibleOnly(e.target.checked)}
            />
            Eligible Only
          </label>
          <select
            value={eligibilityFilter}
            onChange={(e) => setEligibilityFilter(e.target.value as any)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="eligible">Eligible</option>
            <option value="excluded">Excluded</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading holders...</div>
      ) : (
        <>
          <div className="table-info">
            Showing {filteredHolders.length} of {total} holders
          </div>
          <div className="table-wrapper">
            <table className="holders-table">
              <thead>
                <tr>
                  <th>Pubkey</th>
                  <th>Balance</th>
                  <th>USD Value</th>
                  <th>Status</th>
                  <th>Last Reward</th>
                  <th>Retry Count</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="no-data">No holders found</td>
                  </tr>
                ) : (
                  filteredHolders.map((holder) => (
                    <tr key={holder.pubkey}>
                      <td className="pubkey-cell" title={holder.pubkey}>
                        {formatPubkey(holder.pubkey)}
                      </td>
                      <td>{formatBalance(holder.balance)}</td>
                      <td>${(() => {
                        const usd = holder.usdValue;
                        if (usd === null || usd === undefined || isNaN(usd)) {
                          return '0.00';
                        }
                        return Number(usd).toFixed(2);
                      })()}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(holder.eligibilityStatus)}`}>
                          {holder.eligibilityStatus}
                        </span>
                      </td>
                      <td>
                        {holder.lastReward
                          ? new Date(holder.lastReward).toLocaleString()
                          : 'Never'}
                      </td>
                      <td>{holder.retryCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="pagination">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
            >
              Previous
            </button>
            <span>
              Page {Math.floor(offset / limit) + 1} (offset: {offset})
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={!hasMore}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

