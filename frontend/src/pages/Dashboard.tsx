import { RewardSummary } from '../components/RewardSummary';
import { ChartsSection } from '../components/ChartsSection';
import './Dashboard.css';

export function Dashboard() {
  try {
    return (
      <div className="dashboard-container">
        <header className="dashboard-header">
          <h1>NUKE Token Reward Dashboard</h1>
          <p className="subtitle">Real-time monitoring of token holders, rewards, and payouts</p>
        </header>

        <div className="dashboard-content">
          <RewardSummary />
          <ChartsSection />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Dashboard rendering error:', error);
    return (
      <div className="dashboard-container">
        <div style={{ padding: '20px', color: 'red' }}>
          <h2>Dashboard Error</h2>
          <p>An error occurred while rendering the dashboard.</p>
          <pre>{error instanceof Error ? error.message : String(error)}</pre>
        </div>
      </div>
    );
  }
}

