import { GlassCard } from './GlassCard';
import './DistributionCard.css';

export interface DistributionCardItem {
  date: string;
  time?: string;
  status: 'Completed' | 'Failed';
  harvestedTEK: number;
  distributedSOL: number;
  epochNumber?: number; // Epoch number from backend (e.g., 1, 2, 3, 4)
}

interface DistributionCardProps {
  item: DistributionCardItem;
  rewardWalletAddress?: string;
}

export function DistributionCard({ item, rewardWalletAddress }: DistributionCardProps) {
  // Get reward wallet from env or prop
  const walletAddress = rewardWalletAddress || import.meta.env.VITE_REWARD_WALLET_ADDRESS || '';
  const solscanUrl = walletAddress 
    ? `https://solscan.io/account/${walletAddress}?cluster=devnet`
    : '#';

  return (
    <GlassCard className="distribution-card">
      {/* Cycle on left, Status badge on right */}
      <div className="distribution-card-status-section">
        <div className="epoch-section">
          <span className="status-label">Cycle:</span>
          <span className="epoch-number">
            {item.epochNumber !== undefined 
              ? item.epochNumber
              : 1}
          </span>
        </div>
        <span className={`distribution-status distribution-status-${item.status.toLowerCase()}`}>
          {item.status}
        </span>
      </div>

      {/* Details section */}
      <div className="distribution-card-details">
        <div className="distribution-detail">
          <span className="detail-label">Harvested:</span>
          <span className="detail-value">{item.harvestedTEK.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} TEK</span>
        </div>
        <div className="distribution-detail">
          <span className="detail-label">Distributed:</span>
          <span className="detail-value">{item.distributedSOL.toLocaleString(undefined, { maximumFractionDigits: 8, minimumFractionDigits: 8 })} SOL</span>
        </div>
      </div>

      {/* Time and Date at the bottom */}
      <div className="distribution-card-header">
        <div className="distribution-card-time">
          {item.time ? (
            <span className="distribution-card-time-text">{item.time}</span>
          ) : null}
        </div>
        <div className="distribution-card-date">
          <span className="distribution-card-date-text">{item.date}</span>
        </div>
      </div>

      {/* Solscan button at the bottom */}
      <div className="distribution-card-footer">
        <a 
          href={solscanUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="solscan-button"
          onClick={(e) => {
            if (!walletAddress) {
              e.preventDefault();
            }
          }}
        >
          View on Solscan
        </a>
      </div>
    </GlassCard>
  );
}

