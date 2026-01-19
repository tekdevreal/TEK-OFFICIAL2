import { useEffect, useRef } from 'react';
import type { SearchResult, WalletSearchResult, TransactionSearchResult } from '../services/searchService';
import './SearchResults.css';

interface SearchResultsProps {
  result: SearchResult | null;
  query: string;
  onClose: () => void;
}

export function SearchResults({ result, query, onClose }: SearchResultsProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  if (!result) {
    return (
      <div className="search-results" ref={ref}>
        <div className="search-results-empty">
          <p>No results found for "{query}"</p>
          <span className="search-hint">Try a wallet address or transaction hash</span>
        </div>
      </div>
    );
  }

  if (result.type === 'wallet') {
    const wallet = result.data as WalletSearchResult;
    return (
      <div className="search-results" ref={ref}>
        <div className="search-results-header">
          <h3>Wallet Address</h3>
          <button className="search-results-close" onClick={onClose}>×</button>
        </div>
        <div className="search-results-content">
          <div className="search-result-item">
            <span className="search-result-label">Address:</span>
            <span className="search-result-value address">{wallet.pubkey}</span>
          </div>
          
          {wallet.balance && (
            <div className="search-result-item">
              <span className="search-result-label">Balance:</span>
              <span className="search-result-value">
                {parseFloat(wallet.balance).toLocaleString()} TEK
              </span>
            </div>
          )}
          
          {wallet.usdValue !== undefined && (
            <div className="search-result-item">
              <span className="search-result-label">USD Value:</span>
              <span className="search-result-value">
                ${wallet.usdValue.toFixed(2)}
              </span>
            </div>
          )}
          
          {wallet.eligibilityStatus && (
            <div className="search-result-item">
              <span className="search-result-label">Status:</span>
              <span className={`search-result-value status status-${wallet.eligibilityStatus}`}>
                {wallet.eligibilityStatus}
              </span>
            </div>
          )}
          
          {wallet.pendingPayouts !== undefined && wallet.pendingPayouts > 0 && (
            <div className="search-result-item">
              <span className="search-result-label">Pending Payouts:</span>
              <span className="search-result-value">{wallet.pendingPayouts}</span>
            </div>
          )}
          
          {wallet.lastReward && (
            <div className="search-result-item">
              <span className="search-result-label">Last Reward:</span>
              <span className="search-result-value">
                {new Date(wallet.lastReward).toLocaleString()}
              </span>
            </div>
          )}

          {wallet.recentPayouts && wallet.recentPayouts.length > 0 && (
            <div className="search-result-section">
              <h4>Recent Payouts</h4>
              <div className="search-result-payouts">
                {wallet.recentPayouts.map((payout: { rewardSOL: number; status: string; timestamp: string; transactionSignature?: string | null }, index: number) => (
                  <div key={index} className="search-result-payout">
                    <div className="payout-amount">
                      {payout.rewardSOL.toFixed(6)} SOL
                    </div>
                    <div className="payout-details">
                      <span className={`payout-status status-${payout.status}`}>
                        {payout.status}
                      </span>
                      <span className="payout-date">
                        {new Date(payout.timestamp).toLocaleString()}
                      </span>
                      {payout.transactionSignature && (
                        <a
                          href={`https://solscan.io/tx/${payout.transactionSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="payout-link"
                        >
                          View on Solscan
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Transaction result
  const transaction = result.data as TransactionSearchResult;
  return (
    <div className="search-results" ref={ref}>
      <div className="search-results-header">
        <h3>Transaction</h3>
        <button className="search-results-close" onClick={onClose}>×</button>
      </div>
      <div className="search-results-content">
        <div className="search-result-item">
          <span className="search-result-label">Signature:</span>
          <span className="search-result-value address">{transaction.signature}</span>
        </div>
        
        <div className="search-result-item">
          <span className="search-result-label">Wallet:</span>
          <span className="search-result-value address">{transaction.pubkey}</span>
        </div>
        
        <div className="search-result-item">
          <span className="search-result-label">Amount:</span>
          <span className="search-result-value">
            {transaction.rewardSOL.toFixed(6)} SOL
          </span>
        </div>
        
        <div className="search-result-item">
          <span className="search-result-label">Status:</span>
          <span className={`search-result-value status status-${transaction.status}`}>
            {transaction.status}
          </span>
        </div>
        
        <div className="search-result-item">
          <span className="search-result-label">Timestamp:</span>
          <span className="search-result-value">
            {new Date(transaction.timestamp).toLocaleString()}
          </span>
        </div>
        
        {transaction.executedAt && (
          <div className="search-result-item">
            <span className="search-result-label">Executed:</span>
            <span className="search-result-value">
              {new Date(transaction.executedAt).toLocaleString()}
            </span>
          </div>
        )}

        <div className="search-result-actions">
          <a
            href={`https://solscan.io/tx/${transaction.signature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="search-result-button"
          >
            View on Solscan
          </a>
        </div>
      </div>
    </div>
  );
}

