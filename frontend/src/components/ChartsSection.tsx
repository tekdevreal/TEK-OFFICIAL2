// Temporarily removed chart imports to prevent crashes
// import { HolderDistributionChart } from './HolderDistributionChart';
// import { PayoutStatusChart } from './PayoutStatusChart';
// import { HoldersValueChart } from './HoldersValueChart';
// import { RewardTrendsChart } from './RewardTrendsChart';
import './ChartsSection.css';

export function ChartsSection() {
  return (
    <div className="charts-section">
      <div className="charts-header">
        <h2>Analytics & Visualizations</h2>
        <p className="charts-subtitle">Real-time charts and metrics</p>
      </div>

      <div className="charts-grid">
        {/* Temporarily disabled all charts for debugging */}
        <div className="chart-item">
          <div className="chart-container">
            <h3>Holder Distribution</h3>
            <div className="chart-no-data">Charts temporarily disabled for debugging</div>
          </div>
        </div>

        <div className="chart-item">
          <div className="chart-container">
            <h3>Payout Status</h3>
            <div className="chart-no-data">Charts temporarily disabled for debugging</div>
          </div>
        </div>

        <div className="chart-item chart-full-width">
          <div className="chart-container">
            <h3>Holders Value</h3>
            <div className="chart-no-data">Charts temporarily disabled for debugging</div>
          </div>
        </div>

        <div className="chart-item chart-full-width">
          <div className="chart-container">
            <h3>Reward Trends</h3>
            <div className="chart-no-data">Charts temporarily disabled for debugging</div>
          </div>
        </div>
        
        {/* Original charts - temporarily disabled
        <div className="chart-item">
          <HolderDistributionChart />
        </div>

        <div className="chart-item">
          <PayoutStatusChart />
        </div>

        <div className="chart-item chart-full-width">
          <HoldersValueChart />
        </div>

        <div className="chart-item chart-full-width">
          <RewardTrendsChart />
        </div>
        */}
      </div>
    </div>
  );
}

