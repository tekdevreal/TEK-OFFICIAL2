import { Link, useLocation } from 'react-router-dom';
import './SecondaryNav.css';

interface NavItem {
  path: string;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Main' },
  { path: '/harvesting', label: 'Harvesting' },
  { path: '/distribution', label: 'Distribution' },
  { path: '/holders', label: 'Treasury' },
  { path: '/system-status', label: 'System Status' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/docs', label: 'Docs' },
];

export function SecondaryNav() {
  const location = useLocation();

  return (
    <nav className="secondary-nav">
      <div className="secondary-nav-container">
        {navItems.map((item) => {
          // Special handling for "Holders & Payouts" - active on both /holders and /payouts
          let isActive = false;
          if (item.path === '/holders') {
            isActive = location.pathname === '/holders' || location.pathname === '/payouts';
          } else if (item.path === '/harvesting') {
            isActive = location.pathname === '/harvesting';
          } else if (item.path === '/distribution') {
            isActive = location.pathname === '/distribution';
          } else {
            isActive = location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path));
          }
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`secondary-nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

