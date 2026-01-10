import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { ThemeToggle } from './ThemeToggle';
import { SearchResults } from './SearchResults';
import { search } from '../services/searchService';
import type { SearchResult } from '../services/searchService';
import './TopNav.css';

interface NavItem {
  path: string;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Main' },
  { path: '/harvesting', label: 'Harvesting' },
  { path: '/distribution', label: 'Distribution' },
  { path: '/liquidity-pools', label: 'Liquidity Pools' },
  { path: '/holders', label: 'Treasury' },
  { path: '/system-status', label: 'System Status' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/docs', label: 'Docs' },
];

export function TopNav() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);

  const handleWalletClick = () => {
    if (connected) {
      disconnect();
    } else {
      setVisible(true);
    }
    setMobileMenuOpen(false);
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

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const isNavItemActive = (item: NavItem) => {
    if (item.path === '/holders') {
      return location.pathname === '/holders' || location.pathname === '/payouts';
    } else if (item.path === '/') {
      return location.pathname === '/';
    } else {
      return location.pathname.startsWith(item.path);
    }
  };

  return (
    <>
    <header className="top-nav">
      <div className="top-nav-container">
          {/* Left: Logo (always visible) */}
          <div className="top-nav-logo">
            <Link to="/" className="logo-link">
            <span className="logo-text">Nuke Rewards</span>
            </Link>
          </div>

          {/* Center: Search (desktop only) */}
          <div className="top-nav-search desktop-only">
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

          {/* Right: Desktop Actions */}
          <div className="top-nav-actions desktop-only">
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

          {/* Right: Mobile Burger Menu Button */}
          <button 
            className="mobile-menu-button mobile-tablet-only"
            onClick={toggleMobileMenu}
            aria-label="Toggle Menu"
            aria-expanded={mobileMenuOpen}
          >
            <div className={`burger-icon ${mobileMenuOpen ? 'open' : ''}`}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>
        </div>
      </header>

      {/* Mobile/Tablet Menu Overlay */}
      <div 
        className={`mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`}
        onClick={closeMobileMenu}
        aria-hidden={!mobileMenuOpen}
      />

      {/* Mobile/Tablet Menu Panel */}
      <div className={`mobile-menu-panel ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-menu-content">
          {/* Mobile Search */}
          <div className="mobile-search-section">
            <input
              type="text"
              className="search-input mobile-search-input"
              placeholder="Search wallet or transaction"
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
          </div>

          {/* Navigation Links */}
          <nav className="mobile-nav-links">
            <div className="mobile-nav-label">Navigation</div>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`mobile-nav-link ${isNavItemActive(item) ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Actions Section */}
          <div className="mobile-actions-section">
            
            <button 
              className={`mobile-action-button wallet-button ${connected ? 'connected' : ''}`}
              onClick={handleWalletClick}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
              <span>{getWalletButtonText()}</span>
            </button>

            <button 
              className="mobile-action-button"
              onClick={() => {
                window.location.reload();
                closeMobileMenu();
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>Refresh Page</span>
            </button>

            <div className="mobile-theme-toggle-wrapper">
              <span className="mobile-theme-label">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

