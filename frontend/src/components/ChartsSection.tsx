import { HolderDistributionChart } from './HolderDistributionChart';
import { PayoutStatusChart } from './PayoutStatusChart';
import { HoldersValueChart } from './HoldersValueChart';
import { RewardTrendsChart } from './RewardTrendsChart';
import './ChartsSection.css';

export function ChartsSection() {
  return (
    <div className="charts-section">
      <div className="charts-header">
        <h2>Analytics & Visualizations</h2>
        <p className="charts-subtitle">Real-time charts and metrics</p>
      </div>

      <div className="charts-grid">
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
      </div>
    </div>
  );
}

