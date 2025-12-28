import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { WalletContextProvider } from './contexts/WalletContext';
import { TopNav } from './components/TopNav';
import { SecondaryNav } from './components/SecondaryNav';
import { NotificationManager } from './components/Notifications';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { HarvestingPage } from './pages/HarvestingPage';
import { DistributionPage } from './pages/DistributionPage';
import { LiquidityPoolsPage } from './pages/LiquidityPoolsPage';
import { HoldersPage } from './pages/HoldersPage';
import { PayoutsPage } from './pages/PayoutsPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DocumentationPage } from './pages/DocumentationPage';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <WalletContextProvider>
        <ThemeProvider>
          <BrowserRouter>
            <div className="app">
              <TopNav />
              <SecondaryNav />
              <NotificationManager />
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/harvesting" element={<HarvestingPage />} />
                <Route path="/distribution" element={<DistributionPage />} />
                <Route path="/liquidity-pools" element={<LiquidityPoolsPage />} />
                <Route path="/holders" element={<HoldersPage />} />
                <Route path="/payouts" element={<PayoutsPage />} />
                <Route path="/system-status" element={<SystemStatusPage />} />
                <Route path="/docs" element={<DocumentationPage />} />
              </Routes>
            </div>
          </BrowserRouter>
        </ThemeProvider>
      </WalletContextProvider>
    </ErrorBoundary>
  );
}

export default App;
