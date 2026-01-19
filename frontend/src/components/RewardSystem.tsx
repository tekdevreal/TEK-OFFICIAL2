import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEpochCycles, useCurrentCycleInfo, useHistoricalRewards, useEpochs } from '../hooks/useApiData';
import type { CycleResult, CycleState } from '../types/api';
import { EpochDatePicker } from './EpochDatePicker';
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
  // Label is used in tooltip, not here
  // const label = isFuture ? 'Not executed yet' : getCycleStateLabel(state, cycle?.error);

  return (
    <div
      className="cycle-block"
      style={{ backgroundColor: color }}
      onMouseEnter={() => onHover(cycle, cycleNumber)}
    />
  );
}

interface TooltipProps {
  cycle: CycleResult | null;
  cycleNumber: number;
  currentCycle: number;
  epochNumber: number;
  x: number;
  y: number;
  historicalSOL?: number; // Add historical SOL value
}

function Tooltip({ cycle, cycleNumber, currentCycle, epochNumber, x, y, historicalSOL }: TooltipProps) {
  if (!cycle) {
    const isFuture = cycleNumber > currentCycle;
    return (
      <div 
        className="cycle-tooltip"
        style={{ 
          left: `${x}px`, 
          top: `${y}px`,
          transform: 'translateX(-50%)',
        }}
      >
        <div className="tooltip-epoch">Epoch: {epochNumber}</div>
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
      style={{ 
        left: `${x}px`, 
        top: `${y}px`,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="tooltip-epoch">Epoch: {epochNumber}</div>
      <div className="tooltip-title">Cycle {cycle.cycleNumber}</div>
      <div className="tooltip-time">{timeLabel}</div>
      <div className="tooltip-status">{statusLabel}</div>
      {cycle.taxResult && (
        <div className="tooltip-details">
          <div>Harvest (TEK): {(parseFloat(cycle.taxResult.nukeHarvested) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</div>
          <div>Distributed (SOL): {historicalSOL !== undefined ? historicalSOL.toFixed(6) : ((parseFloat(cycle.taxResult.solToHolders) + parseFloat(cycle.taxResult.solToTreasury || '0')) / 1e9).toFixed(6)}</div>
        </div>
      )}
    </div>
  );
}

interface RewardSystemProps {
  selectedEpoch?: string;
  onEpochChange?: (epoch: string) => void;
}

export function RewardSystem({ selectedEpoch: externalSelectedEpoch, onEpochChange }: RewardSystemProps = {}) {
  const [internalSelectedEpoch, setInternalSelectedEpoch] = useState<string>(getCurrentEpoch());
  const [hoveredCycle, setHoveredCycle] = useState<{ cycle: CycleResult | null; cycleNumber: number; x: number; y: number } | null>(null);

  // Use external epoch if provided, otherwise use internal state
  const selectedEpoch = externalSelectedEpoch || internalSelectedEpoch;
  
  // Handle epoch selection
  const handleEpochChange = (epoch: string) => {
    setHoveredCycle(null); // Clear tooltip when changing epoch
    if (onEpochChange) {
      onEpochChange(epoch);
    } else {
      setInternalSelectedEpoch(epoch);
    }
  };

  const { data: currentCycleInfo } = useCurrentCycleInfo({
    refetchInterval: 1 * 60 * 1000, // 1 minute
  });

  const { data: epochData, isLoading } = useEpochCycles(selectedEpoch, {
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
  
  // Fetch available epochs (last 30 days)
  const { data: epochsData } = useEpochs(30, {});

  // Fetch historical data to get actual SOL distribution values
  const { data: historicalData } = useHistoricalRewards({ limit: 300 });

  // Create a map of cycle numbers to SOL distribution from historical data
  const historicalSOLMap = useMemo(() => {
    const map = new Map<number, number>(); // cycleNumber -> SOL
    if (historicalData?.cycles && selectedEpoch) {
      historicalData.cycles.forEach(cycle => {
        const cycleDate = new Date(cycle.timestamp);
        const cycleDateStr = `${cycleDate.getUTCFullYear()}-${String(cycleDate.getUTCMonth() + 1).padStart(2, '0')}-${String(cycleDate.getUTCDate()).padStart(2, '0')}`;
        
        // Only map cycles from the selected epoch
        if (cycleDateStr === selectedEpoch) {
          // Calculate cycle number from timestamp
          const startOfDay = new Date(cycleDate);
          startOfDay.setUTCHours(0, 0, 0, 0);
          const minutesSinceStartOfDay = Math.floor((cycleDate.getTime() - startOfDay.getTime()) / (1000 * 60));
          const cycleNumber = Math.floor(minutesSinceStartOfDay / 5) + 1;
          
          map.set(cycleNumber, cycle.totalSOLDistributed || 0);
        }
      });
    }
    return map;
  }, [historicalData, selectedEpoch]);

  const currentEpoch = getCurrentEpoch();
  const currentCycle = currentCycleInfo?.cycleNumber || 1;
  
  // Get list of available epochs
  const availableEpochs = useMemo(() => {
    if (!epochsData?.epochs) return [currentEpoch];
    return epochsData.epochs.map(e => e.epoch);
  }, [epochsData, currentEpoch]);
  
  // For selected epochs, we need to determine the epoch number
  // If it's the current epoch, use the API value
  // If it's a past epoch, we need to calculate (but ideally should come from backend)
  const selectedEpochNumber = useMemo(() => {
    if (selectedEpoch === currentEpoch && currentCycleInfo?.epochNumber) {
      return currentCycleInfo.epochNumber;
    }
    // For non-current epochs, we can't reliably calculate the epoch number
    // without knowing the full history. Use a placeholder for now.
    // Ideally, the backend should provide epoch numbers for all epochs.
    return 1; // Fallback - would need backend support for historical epoch numbers
  }, [selectedEpoch, currentEpoch, currentCycleInfo]);

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
    
    // Calculate the highest row index that has cycles (row containing current cycle)
    const maxRowIndex = Math.floor((maxCycle - 1) / CYCLES_PER_ROW);
    
    // Return array of visible row indices (0 to maxRowIndex)
    const rows: number[] = [];
    for (let i = 0; i <= maxRowIndex; i++) {
      rows.push(i);
    }
    
    // Reverse so newest row (highest index, containing current cycle) appears first
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
    // Collapsed: show only the 2 most recent rows
    // For current epoch: shows row containing current cycle + previous row
    // For past epochs: shows last 2 rows that have data
    // Since cyclesByRow is already in reverse order (newest first),
    // slice(0, 2) gives us the 2 most recent rows
    return cyclesByRow.slice(0, 2);
  }, [cyclesByRow, isExpanded]);

  const handleBlockHover = (cycle: CycleResult | null, cycleNumber: number, event: React.MouseEvent) => {
    // Simple approach: get the hovered element's position
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    
    // Position tooltip directly below the block, centered
    const x = rect.left + rect.width / 2;
    const y = rect.bottom + 8; // 8px below the block
    
    setHoveredCycle({
      cycle,
      cycleNumber,
      x,
      y,
    });
  };

  const handleBlockLeave = () => {
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
        <EpochDatePicker
          selectedDate={selectedEpoch}
          availableEpochs={availableEpochs}
          onDateSelect={handleEpochChange}
        />
        <div className="reward-system-controls-right">
          {selectedEpoch && (
            <div className="epoch-info">
              {selectedEpoch === currentEpoch && currentCycleInfo && (
                <span className="current-cycle-info">
                  Cycle {currentCycle} of {CYCLES_PER_EPOCH}
                </span>
              )}
            </div>
          )}
          <button
            className="expand-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Collapse to show only active rows' : 'Expand to show all rows'}
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
            {displayRows.map((row, rowIndex) => {
              // Calculate the cycle range for this row
              const firstCycle = row[0]?.cycleNumber || 0;
              const lastCycle = row[row.length - 1]?.cycleNumber || 0;
              
              return (
                <div key={`row-${rowIndex}`} className="reward-system-row-container">
                  <div className="reward-system-row-label">
                    Cycles {firstCycle}-{lastCycle}
                  </div>
                  <div className="reward-system-row">
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hoveredCycle && createPortal(
        <Tooltip
          cycle={hoveredCycle.cycle}
          cycleNumber={hoveredCycle.cycleNumber}
          currentCycle={selectedEpoch === currentEpoch ? currentCycle : CYCLES_PER_EPOCH}
          epochNumber={selectedEpochNumber}
          x={hoveredCycle.x}
          y={hoveredCycle.y}
          historicalSOL={historicalSOLMap.get(hoveredCycle.cycleNumber)}
        />,
        document.body
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

