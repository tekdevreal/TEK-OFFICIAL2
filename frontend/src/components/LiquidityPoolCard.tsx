import { GlassCard } from './GlassCard';
import './LiquidityPoolCard.css';

export interface LiquidityPoolCardItem {
  pairName: string;
  token1Logo: string;
  token2Logo: string;
  dexLogo: string;
  totalLiquidityUSD: number;
  volume24h: number;
}

interface LiquidityPoolCardProps {
  item: LiquidityPoolCardItem;
}

export function LiquidityPoolCard({ item }: LiquidityPoolCardProps) {
  return (
    <GlassCard className="liquidity-pool-card">
      {/* Top Row: Pair Info (Left) and DEX Logo (Right) */}
      <div className="liquidity-pool-header">
        {/* Left Side: Pair Info */}
        <div className="pair-info">
          <div className="pair-logos">
            <img 
              src={item.token1Logo} 
              alt={item.pairName.split('/')[0]?.trim()} 
              className="token-logo"
            />
            <img 
              src={item.token2Logo} 
              alt={item.pairName.split('/')[1]?.trim()} 
              className="token-logo"
            />
          </div>
          <div className="pair-name">{item.pairName}</div>
        </div>

        {/* Right Side: DEX Logo */}
        <div className="dex-logo-container">
          <img 
            src={item.dexLogo} 
            alt="DEX" 
            className="dex-logo"
          />
        </div>
      </div>

      {/* Stats Section */}
      <div className="liquidity-pool-stats">
        <div className="pool-stat">
          <span className="stat-label">Total Liquidity (USD):</span>
          <span className="stat-value">${item.totalLiquidityUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="pool-stat">
          <span className="stat-label">24H Volume:</span>
          <span className="stat-value">${item.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="liquidity-pool-actions">
        <button className="pool-action-button">View Pool</button>
        <button className="pool-action-button">Swap</button>
        <button className="pool-action-button">Add Liquidity</button>
      </div>
    </GlassCard>
  );
}

