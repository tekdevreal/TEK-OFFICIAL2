import { useMemo, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { GlassCard } from '../components/GlassCard';
import { Table, type TableColumn } from '../components/Table';
import { EpochDatePicker } from '../components/EpochDatePicker';
import { useRewards, useHistoricalRewards, useSolPrice, useEpochs } from '../hooks/useApiData';
import type { RewardCycle } from '../types/api';
import './HarvestingPage.css';

// Helper to get current epoch date
function getCurrentEpoch(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface HarvestingData {
  id: string;
  date: string;
  time: string;
  nukeSold: number;
  rewardPoolSOL: number;
  allocatedSOL: number;
  status: 'Complete' | 'Failed';
}

export function HarvestingPage() {
  // Selected epoch for table filtering (defaults to today)
  const [selectedEpoch, setSelectedEpoch] = useState<string>(getCurrentEpoch());
  
  const {
    data: rewardsData,
    isLoading: isLoadingRewards,
  } = useRewards(undefined, {
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  const {
    data: historicalData,
    isLoading: isLoadingHistorical,
  } = useHistoricalRewards({ limit: 1000 }); // Get enough data for filtering

  const {
    data: solPriceData,
  } = useSolPrice({
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch available epochs (last 30 days) for the calendar
  const { data: epochsData } = useEpochs(30, {});

  // Get available epoch dates for the calendar picker
  const availableEpochs = useMemo(() => {
    if (!epochsData?.epochs) return [];
    return epochsData.epochs.map(e => e.epoch);
  }, [epochsData]);

  // Transform historical reward cycles to harvesting data
  const allHarvestingData: HarvestingData[] = useMemo(() => {
    if (!historicalData?.cycles) {
      return [];
    }

    return historicalData.cycles
      .filter((cycle: RewardCycle) => cycle.totalSOLDistributed > 0) // Only show cycles with distributions
      .map((cycle: RewardCycle) => {
        const d = new Date(cycle.timestamp);
        
        // Convert to CET timezone and format as 24-hour time
        const cetTime = d.toLocaleString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Europe/Paris', // CET timezone
        });

        // Calculate NUKE sold proportionally based on tax statistics
        // Use the total NUKE sold and total SOL distributed to calculate proportion per cycle
        const distributedSOL = cycle.totalSOLDistributed;
        const tax = rewardsData?.tax || {
          totalNukeSold: '0',
          totalSolDistributed: '0',
        };
        const totalNukeSold = parseFloat(tax.totalNukeSold || '0');
        const totalSolDistributedAllTime = parseFloat(tax.totalSolDistributed || '0') / 1e9; // Convert lamports to SOL
        
        // Calculate NUKE sold for this cycle proportionally
        const nukeSold = totalSolDistributedAllTime > 0 && distributedSOL > 0
          ? (totalNukeSold * distributedSOL / totalSolDistributedAllTime) / 1e6 // Convert to human-readable (divide by 1e6 for 6 decimals)
          : 0;

        // Reward pool = SOL to holders (75%) + SOL to treasury (25%) = distributedSOL / 0.75
        const rewardPoolSOL = distributedSOL / 0.75;
        
        // Allocated SOL = SOL distributed to holders (75% of reward pool)
        const allocatedSOL = distributedSOL;

        // Format date as YYYY-MM-DD for consistency
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return {
          id: cycle.id,
          date: dateStr,
          time: cetTime,
          nukeSold, // Already converted to human-readable format above
          rewardPoolSOL,
          allocatedSOL,
          status: 'Complete' as const,
        };
      });
  }, [historicalData, rewardsData]);

  // Filter data by last 30 days from selected epoch
  const harvestingData: HarvestingData[] = useMemo(() => {
    if (!selectedEpoch) return allHarvestingData;
    
    // Calculate date 30 days before selected epoch
    const selectedDate = new Date(selectedEpoch + 'T00:00:00Z');
    const startDate = new Date(selectedDate);
    startDate.setUTCDate(startDate.getUTCDate() - 29); // 30 days including selected day
    
    return allHarvestingData.filter((item) => {
      const itemDate = new Date(item.date + 'T00:00:00Z');
      return itemDate >= startDate && itemDate <= selectedDate;
    });
  }, [allHarvestingData, selectedEpoch]);

  // Calculate stats from data
  const totalNukeHarvested = useMemo(() => {
    // Use cumulative total from backend if available, otherwise sum filtered data
    if (rewardsData?.tax?.totalNukeHarvested) {
      return parseFloat(rewardsData.tax.totalNukeHarvested) / 1e6; // Convert from raw units
    }
    return harvestingData.reduce((sum, item) => sum + item.nukeSold, 0);
  }, [harvestingData, rewardsData]);

  // Allocated SOL: total SOL allocated to holders in filtered period
  const allocatedSOL = useMemo(() => {
    return harvestingData.reduce((sum, item) => sum + item.allocatedSOL, 0);
  }, [harvestingData]);

  // Allocated USD: allocated SOL × SOL price
  const allocatedUSD = useMemo(() => {
    const solPrice = solPriceData?.price || 0;
    return allocatedSOL * solPrice;
  }, [allocatedSOL, solPriceData]);

  // Last Harvesting: time only from most recent harvest with CET timezone
  const lastHarvesting = useMemo(() => {
    if (allHarvestingData.length > 0) {
      // Sort by date descending to get most recent
      const sorted = [...allHarvestingData].sort((a, b) => 
        new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime()
      );
      // Get the most recent harvest timestamp
      const mostRecentDate = new Date(sorted[0].date + 'T00:00:00Z');
      const timeMatch = sorted[0].time.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const period = sorted[0].time.includes('PM') ? 'PM' : 'AM';
        // Convert 12-hour to 24-hour
        let hours24 = hours;
        if (period === 'PM' && hours !== 12) hours24 += 12;
        if (period === 'AM' && hours === 12) hours24 = 0;
        
        // Create date with correct time and convert to CET
        mostRecentDate.setUTCHours(hours24, minutes, 0, 0);
        const cetTime = mostRecentDate.toLocaleString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Europe/Paris', // CET timezone
        });
        return `${cetTime} CET`;
      }
    }
    return 'N/A';
  }, [allHarvestingData]);

  // Table columns
  const columns: TableColumn<HarvestingData>[] = useMemo(() => [
    {
      key: 'date',
      header: 'DATE',
      accessor: (row) => row.date,
      sortable: true,
      sortFn: (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    },
    {
      key: 'time',
      header: 'TIME',
      accessor: (row) => row.time,
      sortable: true,
      sortFn: (a, b) => a.time.localeCompare(b.time),
    },
    {
      key: 'nukeSold',
      header: 'NUKE HARVESTED',
      accessor: (row) => row.nukeSold.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      sortable: true,
      sortFn: (a, b) => a.nukeSold - b.nukeSold,
    },
    {
      key: 'rewardPoolSOL',
      header: 'REWARD POOL (SOL)',
      accessor: (row) => row.rewardPoolSOL.toLocaleString(undefined, { maximumFractionDigits: 6 }),
      sortable: true,
      sortFn: (a, b) => a.rewardPoolSOL - b.rewardPoolSOL,
    },
    {
      key: 'allocatedSOL',
      header: 'ALLOCATED (SOL)',
      accessor: (row) => row.allocatedSOL.toLocaleString(undefined, { maximumFractionDigits: 6 }),
      sortable: true,
      sortFn: (a, b) => a.allocatedSOL - b.allocatedSOL,
    },
    {
      key: 'status',
      header: 'STATUS',
      accessor: (row) => (
        <a 
          href="#" 
          className="harvesting-status-link"
          onClick={(e) => {
            e.preventDefault();
            // TODO: Open detailed table/view
          }}
          style={{ 
            color: row.status === 'Complete' ? 'var(--accent-success)' : 'var(--accent-danger)',
            fontWeight: 600,
            textDecoration: 'none'
          }}
        >
          {row.status}
        </a>
      ),
      sortable: true,
      sortFn: (a, b) => a.status.localeCompare(b.status),
    },
  ], []);

  // Export CSV handler
  const handleExportCSV = () => {
    const headers = ['DATE', 'TIME', 'NUKE SOLD', 'REWARD POOL (SOL)', 'ALLOCATED (SOL)', 'STATUS'];
    const rows = harvestingData.map((row) => [
      row.date,
      row.time,
      row.nukeSold.toString(),
      row.rewardPoolSOL.toString(),
      row.allocatedSOL.toString(),
      row.status,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `harvesting-data-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoadingRewards || isLoadingHistorical) {
    return (
      <div className="harvesting-page">
        <div className="loading">Loading harvesting data...</div>
      </div>
    );
  }

  return (
    <div className="harvesting-page">
      {/* Harvesting Data Section */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">Harvesting Data</h2>
          <p className="section-subtitle">Track NUKE token harvesting activities and reward pool distributions.</p>
          
          {/* Stats Summary */}
          <div className="harvesting-stats">
            <StatCard
              label="Total Nuke Harvested"
              value={totalNukeHarvested.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            />
            <StatCard
              label="Allocated SOL"
              value={`${allocatedSOL.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 4 })} SOL`}
            />
            <StatCard
              label="Allocated USD"
              value={`$${allocatedUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            />
            <StatCard
              label="Last Harvesting"
              value={lastHarvesting}
            />
          </div>

          {/* Calendar Filter and Export */}
          <div className="harvesting-filters-row">
            <div className="filter-group">
              <EpochDatePicker
                selectedDate={selectedEpoch}
                availableEpochs={availableEpochs}
                onDateSelect={setSelectedEpoch}
              />
            </div>

            <div className="filter-export">
              <button
                className="export-csv-button"
                onClick={handleExportCSV}
              >
                Export CSV
              </button>
            </div>
          </div>

          {/* Harvesting Data Table */}
          <div className="harvesting-table-container">
            <Table
              data={harvestingData}
              columns={columns}
              searchable={false}
              pagination={true}
              pageSize={15}
              exportable={false}
              exportFilename="harvesting-data"
              loading={false}
            />
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
