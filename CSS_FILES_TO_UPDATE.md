# Complete CSS Files - Copy & Paste Ready

## File 1: SecondaryNav.css

**Location**: `frontend/src/components/SecondaryNav.css`

**Complete file content:**

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

@media (max-width: 1024px) {
  .secondary-nav {
    display: none !important;
  }
}
```

---

## File 2: TopNav.css - Burger Icon Section Update

**Location**: `frontend/src/components/TopNav.css`

**Find the burger icon section (around lines 140-180) and replace with:**

```css
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

/* Light Theme Burger Icon */
[data-theme='light'] .mobile-menu-button:hover {
  background: rgba(0, 0, 0, 0.08);
}

[data-theme='light'] .mobile-menu-button:active {
  background: rgba(0, 0, 0, 0.12);
}
```

---

## How to Apply

### Option 1: Manual Copy-Paste
1. Open `frontend/src/components/SecondaryNav.css`
2. Copy the entire content from "File 1" above
3. Replace all content in the file

4. Open `frontend/src/components/TopNav.css`
5. Find the burger icon section (lines ~140-180)
6. Replace with the content from "File 2" above

### Option 2: Quick Update
Add to end of `SecondaryNav.css`:
```css
@media (max-width: 1024px) {
  .secondary-nav { display: none !important; }
}
```

Update burger button in `TopNav.css`:
- Change width/height to 44px
- Add border-radius: 8px
- Add hover background
- Increase icon size to 28x20px
- Increase bar height to 3px

---

## Expected Result

### Desktop (>1024px)
- TopNav: Logo + Search + Actions
- SecondaryNav: Navigation links visible

### Tablet/Mobile (≤1024px)
- TopNav: Logo + Burger Icon
- SecondaryNav: Hidden (replaced by burger menu)
- Burger Icon: Larger, more tappable, professional appearance

---

**After applying these changes, test on mobile/tablet to verify!**
