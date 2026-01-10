import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './SecondaryNav.css';

const SecondaryNav: React.FC = () => {
  const location = useLocation();

  // Don't show on landing page
  if (location.pathname === '/') {
    return null;
  }

  const links = [
    { path: '/dashboard', label: 'Main' },
    { path: '/harvesting', label: 'Harvesting Data' },
    { path: '/distribution', label: 'Distribution Data' },
    { path: '/liquidity', label: 'Liquidity Pools' },
    { path: '/documentation', label: 'Documentation' },
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
