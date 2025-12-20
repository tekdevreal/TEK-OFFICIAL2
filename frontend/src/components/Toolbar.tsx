import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import './Toolbar.css';

interface NavItem {
  path: string;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/holders', label: 'Treasury' },
  { path: '/payouts', label: 'Payouts' },
  { path: '/harvest', label: 'Harvest' },
  { path: '/distribution', label: 'Distribution' },
  { path: '/historical-rewards', label: 'Historical Rewards' },
  { path: '/payout-history', label: 'Payout History' },
];

export function Toolbar() {
  const location = useLocation();

  return (
    <nav className="toolbar">
      <div className="toolbar-container">
        <div className="toolbar-brand">
          <h1>NUKE</h1>
        </div>
        <ul className="toolbar-nav">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`toolbar-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="toolbar-actions">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

