import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import './Header.css';

interface NavItem {
  path: string;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/harvesting', label: 'Harvesting & Distribution' },
  { path: '/holders', label: 'Treasury' },
  { path: '/payouts', label: 'Payouts' },
];

export function Header() {
  const location = useLocation();

  return (
    <header className="main-header">
      <div className="header-container">
        {/* Logo */}
        <div className="header-logo">
          <span className="logo-text">Nuke Rewards</span>
        </div>

        {/* Navigation */}
        <nav className="header-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

