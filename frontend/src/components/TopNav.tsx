import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { ThemeToggle } from './ThemeToggle';
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
];

export function TopNav() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
          {/* Left: Logo */}
          <div className="top-nav-logo">
            <Link to="/" className="logo-link">
              <span className="logo-text">NUKE</span>
            </Link>
          </div>

          {/* Center: Desktop Navigation Menu */}
          <nav className="desktop-nav-menu desktop-only">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-menu-link ${isNavItemActive(item) ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right: Desktop Icon Actions */}
          <div className="top-nav-icons desktop-only">
            {/* Docs Icon */}
            <Link to="/docs" className="icon-button" aria-label="Documentation">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </Link>

            {/* Refresh Icon */}
            <button 
              className="icon-button" 
              aria-label="Refresh Page"
              onClick={() => window.location.reload()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
            
            {/* Theme Toggle Icon */}
            <ThemeToggle />
            
            {/* Connect Wallet Button */}
            <button 
              className={`wallet-button ${connected ? 'connected' : ''}`}
              onClick={handleWalletClick}
              aria-label="Connect Wallet"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
              <span className="wallet-text">{getWalletButtonText()}</span>
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
          {/* Mobile Search - Hidden on mobile/tablet */}
          {/* Keeping code for potential future use, but hidden via CSS */}
          
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
            {/* Add Docs to mobile menu */}
            <Link
              to="/docs"
              className={`mobile-nav-link ${location.pathname === '/docs' ? 'active' : ''}`}
              onClick={closeMobileMenu}
            >
              Docs
            </Link>
          </nav>

          {/* Actions Section - Icon Buttons Only */}
          <div className="mobile-actions-section">
            <div className="mobile-icon-actions">
              {/* Wallet Icon */}
              <button 
                className={`mobile-icon-button ${connected ? 'connected' : ''}`}
                onClick={handleWalletClick}
                aria-label="Connect Wallet"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                  <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                  <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                </svg>
              </button>

              {/* Refresh Icon */}
              <button 
                className="mobile-icon-button"
                onClick={() => {
                  window.location.reload();
                  closeMobileMenu();
                }}
                aria-label="Refresh Page"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>

              {/* Theme Toggle Icon */}
              <div className="mobile-icon-button theme-wrapper">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

