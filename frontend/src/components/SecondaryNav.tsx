import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './SecondaryNav.css';

const SecondaryNav: React.FC = () => {
  const location = useLocation();

  const links = [
    { path: '/', label: 'Main' },
    { path: '/harvesting', label: 'Harvesting' },
    { path: '/distribution', label: 'Distribution' },
    { path: '/liquidity-pools', label: 'Liquidity Pools' },
    { path: '/holders', label: 'Treasury' },
    { path: '/system-status', label: 'System Status' },
    { path: '/analytics', label: 'Analytics' },
    { path: '/docs', label: 'Doc' },
  ];

  return (
    <nav className="secondary-nav">
      <div className="secondary-nav-container">
        {links.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`secondary-nav-link ${location.pathname === link.path ? 'active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default SecondaryNav;
