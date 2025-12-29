import { useMemo, useState } from 'react';
import { useEpochCycles, useCurrentCycleInfo } from '../hooks/useApiData';
import type { CycleResult, CycleState } from '../types/api';
import './RewardSystem.css';

const CYCLES_PER_EPOCH = 288;
const CYCLES_PER_ROW = 24;

function getCurrentEpoch(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayEpoch(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const year = yesterday.getUTCFullYear();
  const month = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatEpochDate(epoch: string): string {
  const date = new Date(epoch + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

function getCycleStateColor(state: CycleState | 'PENDING' | 'NOT_EXECUTED'): string {
  switch (state) {
    case 'DISTRIBUTED':
      return 'var(--cycle-distributed)';
    case 'ROLLED_OVER':
      return 'var(--cycle-rolled-over)';
    case 'FAILED':
      return 'var(--cycle-failed)';
    case 'NOT_EXECUTED':
      return 'var(--cycle-not-executed)';
    case 'PENDING':
    default:
      return 'var(--cycle-pending)';
  }
}

function getCycleStateLabel(state: CycleState | 'PENDING' | 'NOT_EXECUTED', error?: string): string {
  switch (state) {
    case 'DISTRIBUTED':
      return 'Distributed';
    case 'ROLLED_OVER':
      return 'Rolled Over (Insufficient Tax)';
    case 'FAILED':
      return error ? `Failed (${error})` : 'Failed';
    case 'NOT_EXECUTED':
      return 'Not executed yet';
    case 'PENDING':
    default:
      return 'Not executed yet';
  }
}

function formatCycleTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

interface CycleBlockProps {
  cycleNumber: number;
  cycle: CycleResult | null;
  currentCycle: number;
  onHover: (cycle: CycleResult | null, cycleNumber: number) => void;
}

function CycleBlock({ cycleNumber, cycle, currentCycle, onHover }: CycleBlockProps) {
  const isPending = cycle === null;
  const state: CycleState | 'PENDING' | 'NOT_EXECUTED' = isPending ? 'NOT_EXECUTED' : cycle.state;
  const isFuture = cycleNumber > currentCycle;
  
  // NOT_EXECUTED only applies to future cycles in the active row
  const finalState = isFuture ? 'NOT_EXECUTED' : state;
  const color = getCycleStateColor(finalState);
  const label = isFuture 
    ? 'Not executed yet' 
    : getCycleStateLabel(state, cycle?.error);

  return (
    <div
      className="cycle-block"
      style={{ backgroundColor: color }}
      onMouseEnter={() => onHover(cycle, cycleNumber)}
      title={`Cycle ${cycleNumber}${cycle ? ` - ${label}` : ' - Not executed yet'}`}
    />
  );
}

interface TooltipProps {
  cycle: CycleResult | null;
  cycleNumber: number;
  currentCycle: number;
  x: number;
  y: number;
}

function Tooltip({ cycle, cycleNumber, currentCycle, x, y }: TooltipProps) {
  if (!cycle) {
    const isFuture = cycleNumber > currentCycle;
    return (
      <div 
        className="cycle-tooltip"
        style={{ left: `${x}px`, top: `${y}px` }}
      >
        <div className="tooltip-title">Cycle {cycleNumber}</div>
        <div className="tooltip-status">{isFuture ? 'Not executed yet' : 'No data'}</div>
      </div>
    );
  }

  const statusLabel = getCycleStateLabel(cycle.state, cycle.error);
  const timeLabel = formatCycleTime(cycle.timestamp);

  return (
    <div 
      className="cycle-tooltip"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <div className="tooltip-title">Cycle {cycle.cycleNumber}</div>
      <div className="tooltip-time">{timeLabel}</div>
      <div className="tooltip-status">{statusLabel}</div>
      {cycle.taxResult && (
        <div className="tooltip-details">
          <div>NUKE: {parseFloat(cycle.taxResult.nukeHarvested).toLocaleString()}</div>
          <div>SOL to Holders: {cycle.taxResult.solToHolders}</div>
          <div>Recipients: {cycle.taxResult.distributedCount}</div>
        </div>
      )}
    </div>
  );
}

export function RewardSystem() {
  const [selectedEpoch, setSelectedEpoch] = useState<string>(getCurrentEpoch());
  const [hoveredCycle, setHoveredCycle] = useState<{ cycle: CycleResult | null; cycleNumber: number; x: number; y: number } | null>(null);

  const { data: currentCycleInfo } = useCurrentCycleInfo({
    refetchInterval: 1 * 60 * 1000, // 1 minute
  });

  const { data: epochData, isLoading } = useEpochCycles(selectedEpoch, {
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  const currentEpoch = getCurrentEpoch();
  const currentCycle = currentCycleInfo?.cycleNumber || 1;

  // Create a map of cycle number to cycle result for quick lookup
  const cyclesMap = useMemo(() => {
    const map = new Map<number, CycleResult>();
    if (epochData?.cycles) {
      epochData.cycles.forEach((cycle) => {
        map.set(cycle.cycleNumber, cycle);
      });
    }
    return map;
  }, [epochData]);

  // Calculate which rows are visible (progressive rendering)
  // A row becomes visible when its first cycle starts
  const visibleRows = useMemo(() => {
    const maxCycle = selectedEpoch === currentEpoch 
      ? currentCycle 
      : CYCLES_PER_EPOCH;
    
    // Calculate the highest row index that has cycles
    const maxRowIndex = Math.floor((maxCycle - 1) / CYCLES_PER_ROW);
    
    // Return array of visible row indices (0 to maxRowIndex)
    const rows: number[] = [];
    for (let i = 0; i <= maxRowIndex; i++) {
      rows.push(i);
    }
    
    // Reverse so newest row (highest index) appears first
    return rows.reverse();
  }, [selectedEpoch, currentEpoch, currentCycle]);

  // Generate cycles organized by rows (progressive rendering)
  const cyclesByRow = useMemo(() => {
    const rows: Array<Array<{ cycleNumber: number; cycle: CycleResult | null }>> = [];
    
    // Only process visible rows
    visibleRows.forEach((rowIndex) => {
      const rowCycles: Array<{ cycleNumber: number; cycle: CycleResult | null }> = [];
      const startCycle = rowIndex * CYCLES_PER_ROW + 1;
      const endCycle = Math.min(startCycle + CYCLES_PER_ROW - 1, CYCLES_PER_EPOCH);
      
      for (let cycleNumber = startCycle; cycleNumber <= endCycle; cycleNumber++) {
        const cycle = cyclesMap.get(cycleNumber) || null;
        const isFuture = selectedEpoch === currentEpoch && cycleNumber > currentCycle;
        
        rowCycles.push({
          cycleNumber,
          cycle: isFuture ? null : cycle,
        });
      }
      
      rows.push(rowCycles);
    });
    
    return rows;
  }, [visibleRows, cyclesMap, selectedEpoch, currentEpoch, currentCycle]);

  // Expand/Collapse state - default to collapsed
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Determine which rows to display based on expand/collapse
  const displayRows = useMemo(() => {
    if (isExpanded) {
      return cyclesByRow;
    }
    // Collapsed: show only current row (first) and previous row (second) if available
    return cyclesByRow.slice(0, 2);
  }, [cyclesByRow, isExpanded]);

  const handleBlockHover = (cycle: CycleResult | null, cycleNumber: number, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setHoveredCycle({
      cycle,
      cycleNumber,
      x: rect.left + rect.width / 2,
      y: rect.top - 4, // Closer to the block
    });
  };

  const handleBlockLeave = () => {
    setHoveredCycle(null);
  };

  const handleEpochChange = (epoch: string) => {
    setSelectedEpoch(epoch);
    setHoveredCycle(null);
  };

  return (
    <div className="reward-system">
      <div className="reward-system-header">
        <h2 className="section-title">Reward System</h2>
        <div className="reward-system-legend">
          <span className="legend-item">
            <span className="legend-color" style={{ backgroundColor: 'var(--cycle-distributed)' }}></span>
            Distributed
          </span>
          <span className="legend-item">
            <span className="legend-color" style={{ backgroundColor: 'var(--cycle-rolled-over)' }}></span>
            Rolled Over
          </span>
          <span className="legend-item">
            <span className="legend-color" style={{ backgroundColor: 'var(--cycle-failed)' }}></span>
            Failed
          </span>
        </div>
      </div>

      <div className="reward-system-controls">
        <div className="epoch-selector">
          <button
            className={`epoch-button ${selectedEpoch === currentEpoch ? 'active' : ''}`}
            onClick={() => handleEpochChange(currentEpoch)}
          >
            Today
          </button>
          <button
            className={`epoch-button ${selectedEpoch === getYesterdayEpoch() ? 'active' : ''}`}
            onClick={() => handleEpochChange(getYesterdayEpoch())}
          >
            Yesterday
          </button>
          <input
            type="date"
            className="epoch-date-picker"
            value={selectedEpoch}
            onChange={(e) => handleEpochChange(e.target.value)}
            max={currentEpoch}
          />
        </div>
        <div className="reward-system-controls-right">
          {selectedEpoch && (
            <div className="epoch-info">
              {formatEpochDate(selectedEpoch)}
              {selectedEpoch === currentEpoch && currentCycleInfo && (
                <span className="current-cycle-info">
                  {' '}• Cycle {currentCycle} of {CYCLES_PER_EPOCH}
                </span>
              )}
            </div>
          )}
          <button
            className="expand-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse to show only active rows' : 'Expand to show all rows'}
          >
            {isExpanded ? '−' : '+'}
          </button>
        </div>
      </div>

      <div className="reward-system-grid-container">
        {isLoading ? (
          <div className="reward-system-loading">Loading cycle data...</div>
        ) : displayRows.length === 0 ? (
          <div className="reward-system-loading">No cycle data available</div>
        ) : (
          <div className="reward-system-rows">
            {displayRows.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="reward-system-row">
                {row.map(({ cycleNumber, cycle }: { cycleNumber: number; cycle: CycleResult | null }) => (
                  <div
                    key={cycleNumber}
                    className="cycle-block-wrapper"
                    onMouseEnter={(e) => handleBlockHover(cycle, cycleNumber, e)}
                    onMouseLeave={handleBlockLeave}
                  >
                    <CycleBlock
                      cycleNumber={cycleNumber}
                      cycle={cycle}
                      currentCycle={selectedEpoch === currentEpoch ? currentCycle : CYCLES_PER_EPOCH}
                      onHover={() => {}}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {hoveredCycle && (
        <Tooltip
          cycle={hoveredCycle.cycle}
          cycleNumber={hoveredCycle.cycleNumber}
          currentCycle={selectedEpoch === currentEpoch ? currentCycle : CYCLES_PER_EPOCH}
          x={hoveredCycle.x}
          y={hoveredCycle.y}
        />
      )}

      {epochData?.statistics && (
        <div className="reward-system-stats">
          <span className="stat-item">
            <span className="stat-value">{epochData.statistics.distributed}</span>
            <span className="stat-label">Distributed</span>
          </span>
          <span className="stat-item">
            <span className="stat-value">{epochData.statistics.rolledOver}</span>
            <span className="stat-label">Rolled Over</span>
          </span>
          <span className="stat-item">
            <span className="stat-value">{epochData.statistics.failed}</span>
            <span className="stat-label">Failed</span>
          </span>
          <span className="stat-item">
            <span className="stat-value">{epochData.statistics.totalCycles}</span>
            <span className="stat-label">Total Cycles</span>
          </span>
        </div>
      )}
    </div>
  );
}

