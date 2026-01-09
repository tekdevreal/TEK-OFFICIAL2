import { useState, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { ThemeToggle } from './ThemeToggle';
import { SearchResults } from './SearchResults';
import { search } from '../services/searchService';
import type { SearchResult } from '../services/searchService';
import './TopNav.css';

export function TopNav() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);

  const handleWalletClick = () => {
    if (connected) {
      disconnect();
    } else {
      setVisible(true);
    }
  };

  const getWalletButtonText = () => {
    if (connected && publicKey) {
      // Show shortened address
      const address = publicKey.toString();
      return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }
    return 'Connect Wallet';
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setShowResults(false);
    setSearchResult(null);

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Only search if query is long enough (at least 8 characters)
    if (query.trim().length >= 8) {
      setIsSearching(true);
      searchTimeoutRef.current = window.setTimeout(async () => {
        try {
          const result = await search(query.trim());
          setSearchResult(result);
          setShowResults(true);
        } catch (error) {
          console.error('Search error:', error);
          setSearchResult(null);
          setShowResults(true);
        } finally {
          setIsSearching(false);
        }
      }, 500); // Debounce search by 500ms
    } else {
      setIsSearching(false);
    }
  };

  const handleSearchFocus = () => {
    if (searchResult && searchQuery.trim().length >= 8) {
      setShowResults(true);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowResults(false);
      searchInputRef.current?.blur();
    }
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <header className="top-nav">
      <div className="top-nav-container">
        {/* Left: Logo + Search */}
        <div className="top-nav-left">
          <div className="top-nav-logo">
            <span className="logo-text">Nuke Rewards</span>
          </div>
          <div className="top-nav-search">
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search wallet address or transaction hash"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
              onKeyDown={handleSearchKeyDown}
            />
            {isSearching && (
              <div className="search-loading">
                <div className="search-spinner"></div>
              </div>
            )}
            {showResults && (
              <SearchResults
                result={searchResult}
                query={searchQuery}
                onClose={() => setShowResults(false)}
              />
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="top-nav-actions">
          <button 
            className="icon-button" 
            aria-label="Refresh Page"
            onClick={() => window.location.reload()}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          
          <ThemeToggle />
          
          <button 
            className={`connect-wallet-button ${connected ? 'connected' : ''}`}
            onClick={handleWalletClick}
          >
            {getWalletButtonText()}
          </button>
        </div>
      </div>
    </header>
  );
}

