# Complete CSS Files - Professional Mobile Navigation

Copy and paste these complete files to replace your existing CSS files.

---

## File 1: TopNav.css

**Location**: `frontend/src/components/TopNav.css`

**Instructions**: Copy everything below and replace the entire contents of TopNav.css

```css
.top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  width: 100%;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(10px);
}

.top-nav-container {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  height: 5rem;
}

.top-nav-logo {
  flex-shrink: 0;
}

.logo-link {
  text-decoration: none;
  color: inherit;
}

.logo-text {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.05em;
}

.top-nav-search {
  flex: 1;
  max-width: 32rem;
  position: relative;
  margin: 0 2rem;
}

.search-input {
  width: 100%;
  padding: 0.75rem 1.25rem;
  padding-right: 3rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  font-size: 1rem;
  transition: all var(--transition-fast);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}

.search-loading {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
}

.search-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: var(--text-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.top-nav-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.icon-button:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.connect-wallet-button {
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  background: var(--text-primary);
  color: var(--bg-primary);
  border: none;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.connect-wallet-button:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.connect-wallet-button.connected {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* ===================================================================
   PROFESSIONAL BURGER MENU BUTTON
   =================================================================== */

.mobile-menu-button {
  display: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: transparent;
  border: none;
  cursor: pointer;
  z-index: 51;
  padding: 8px;
  border-radius: 8px;
  transition: all 0.2s ease;
  position: relative;
  -webkit-tap-highlight-color: transparent;
}

.mobile-menu-button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.mobile-menu-button:active {
  transform: scale(0.95);
  background: rgba(255, 255, 255, 0.12);
}

/* Professional Burger Icon with Smooth Animation */
.burger-icon {
  width: 28px;
  height: 20px;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.burger-icon span {
  display: block;
  width: 100%;
  height: 3px;
  background: var(--text-primary);
  border-radius: 3px;
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  transform-origin: center;
}

/* Smooth X Animation When Open */
.burger-icon.open span:nth-child(1) {
  transform: translateY(8.5px) rotate(45deg);
}

.burger-icon.open span:nth-child(2) {
  opacity: 0;
  transform: translateX(-20px);
}

.burger-icon.open span:nth-child(3) {
  transform: translateY(-8.5px) rotate(-45deg);
}

/* ===================================================================
   MOBILE MENU OVERLAY & PANEL
   =================================================================== */

.mobile-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 48;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.mobile-menu-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.mobile-menu-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 85%;
  max-width: 400px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  z-index: 49;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.mobile-menu-panel.open {
  transform: translateX(0);
}

.mobile-menu-content {
  padding: 6rem 0 2rem 0;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* ===================================================================
   MOBILE MENU SECTIONS
   =================================================================== */

.mobile-search-section {
  padding: 0 1.5rem;
  position: relative;
}

.mobile-search-input {
  width: 100%;
  font-size: 0.9375rem;
}

.mobile-nav-links {
  padding: 0 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mobile-nav-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
  margin-bottom: 0.5rem;
  padding: 0 0.5rem;
}

.mobile-nav-link {
  display: flex;
  align-items: center;
  padding: 1rem 0.75rem;
  border-radius: 0.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.mobile-nav-link:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.mobile-nav-link.active {
  background: rgba(var(--accent-primary-rgb), 0.1);
  color: var(--accent-primary);
  border-color: rgba(var(--accent-primary-rgb), 0.2);
}

.mobile-actions-section {
  padding: 0 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-top: 1px solid var(--border-color);
  padding-top: 2rem;
}

.mobile-action-button {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  text-align: left;
}

.mobile-action-button:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.mobile-action-button svg {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--text-secondary);
}

.mobile-action-button.wallet-button {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.mobile-action-button.wallet-button svg {
  color: white;
}

.mobile-action-button.wallet-button:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.mobile-action-button.wallet-button.connected {
  background: rgba(var(--accent-primary-rgb), 0.15);
  color: var(--accent-primary);
  border-color: rgba(var(--accent-primary-rgb), 0.3);
}

.mobile-action-button.wallet-button.connected svg {
  color: var(--accent-primary);
}

.mobile-theme-toggle-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
}

.mobile-theme-label {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text-primary);
}

/* ===================================================================
   RESPONSIVE VISIBILITY
   =================================================================== */

.desktop-only {
  display: flex;
}

.mobile-tablet-only {
  display: none;
}

/* ===================================================================
   RESPONSIVE BREAKPOINTS
   =================================================================== */

@media (max-width: 1024px) {
  .top-nav-container {
    padding: 0 1.25rem;
  }

  .top-nav-search {
    margin: 0 1.5rem;
    max-width: 24rem;
  }

  .logo-text {
    font-size: 1.375rem;
  }
}

@media (max-width: 768px) {
  .top-nav-container {
    padding: 0 1rem;
    height: 4rem;
  }
  
  .logo-text {
    font-size: 1.25rem;
  }
  
  .desktop-only {
    display: none !important;
  }
  
  .mobile-tablet-only {
    display: flex !important;
  }
  
  .mobile-menu-button {
    display: flex;
  }
}

@media (max-width: 480px) {
  .top-nav-container {
    padding: 0 0.875rem;
    height: 3.75rem;
  }

  .logo-text {
    font-size: 1.125rem;
  }

  .mobile-menu-panel {
    width: 90%;
  }

  .mobile-menu-content {
    padding: 5rem 0 1.5rem 0;
    gap: 1.5rem;
  }

  .mobile-search-section,
  .mobile-nav-links,
  .mobile-actions-section {
    padding: 0 1.25rem;
  }
}

/* ===================================================================
   LIGHT THEME
   =================================================================== */

[data-theme='light'] .top-nav {
  background: rgba(255, 255, 255, 0.98);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

[data-theme='light'] .search-input {
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

[data-theme='light'] .search-input:focus {
  border-color: rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.08);
}

[data-theme='light'] .icon-button {
  color: var(--text-secondary);
}

[data-theme='light'] .icon-button:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
}

[data-theme='light'] .connect-wallet-button {
  background: var(--text-primary);
  color: var(--bg-primary);
}

[data-theme='light'] .mobile-menu-button:hover {
  background: rgba(0, 0, 0, 0.08);
}

[data-theme='light'] .mobile-menu-button:active {
  background: rgba(0, 0, 0, 0.12);
}

[data-theme='light'] .burger-icon span {
  background: var(--text-primary);
}

[data-theme='light'] .mobile-menu-overlay {
  background: rgba(0, 0, 0, 0.5);
}

[data-theme='light'] .mobile-menu-panel {
  background: var(--bg-primary);
}

[data-theme='light'] .mobile-nav-link:hover {
  background: rgba(0, 0, 0, 0.05);
}

[data-theme='light'] .mobile-action-button {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.1);
}

[data-theme='light'] .mobile-action-button:hover {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.15);
}

[data-theme='light'] .mobile-theme-toggle-wrapper {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.1);
}
```

---

## File 2: SecondaryNav.css

**Location**: `frontend/src/components/SecondaryNav.css`

**Instructions**: Copy everything below and replace the entire contents of SecondaryNav.css

```css
.secondary-nav {
  position: fixed;
  top: 4.85rem;
  left: 0;
  right: 0;
  z-index: 40;
  width: 100%;
  background: rgba(0, 0, 0, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.secondary-nav-container {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0 1.5rem;
  height: 4rem;
}

.secondary-nav-link {
  position: relative;
  padding: 0.75rem 1.25rem 0.85rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 1rem;
  font-weight: 500;
  transition: color var(--transition-fast);
}

.secondary-nav-link:first-of-type {
  padding-left: 0;
}

.secondary-nav-link:hover {
  color: var(--text-primary);
}

.secondary-nav-link.active {
  color: var(--text-primary);
  font-weight: 600;
}

/* Light theme adjustments */
[data-theme='light'] .secondary-nav {
  background: rgba(255, 255, 255, 0.98);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

[data-theme='light'] .secondary-nav-link {
  color: var(--text-secondary);
}

[data-theme='light'] .secondary-nav-link:hover {
  color: var(--text-primary);
}

[data-theme='light'] .secondary-nav-link.active {
  color: var(--text-primary);
  font-weight: 600;
}

/* ===================================================================
   RESPONSIVE: HIDE ON MOBILE/TABLET
   =================================================================== */

/* Hide SecondaryNav on tablets and mobile - burger menu has all navigation */
@media (max-width: 1024px) {
  .secondary-nav {
    display: none !important;
  }
}
```

---

## Summary of Changes

### TopNav.css Improvements:
- ✅ Professional burger icon (44x44px)
- ✅ Smooth cubic-bezier animation
- ✅ Rounded hover effect
- ✅ Better tap feedback
- ✅ iOS tap highlight removed
- ✅ Proper spacing and positioning

### SecondaryNav.css Improvements:
- ✅ Hidden on mobile/tablet (≤1024px)
- ✅ Burger menu replaces it
- ✅ Clean, professional appearance

---

## How to Use

1. **Copy TopNav.css content** → Paste into `frontend/src/components/TopNav.css`
2. **Copy SecondaryNav.css content** → Paste into `frontend/src/components/SecondaryNav.css`
3. **Save both files**
4. **Test** on mobile/tablet

---

## Expected Result

### Desktop (>1024px)
```
[TopNav] Logo + Search + Actions
[SecondaryNav] Main | Harvesting | Distribution...
```

### Mobile/Tablet (≤1024px)
```
[TopNav] Logo                    [☰]
         (no menu bar below)
```

When burger tapped → Professional slide-out menu with all links!

---

**✅ Ready to copy and paste!**
