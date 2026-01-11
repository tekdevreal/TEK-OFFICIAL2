import { useMemo, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { GlassCard } from '../components/GlassCard';
import { Table, type TableColumn } from '../components/Table';
import { EpochDatePicker } from '../components/EpochDatePicker';
import { useRewards, useHistoricalRewards, useSolPrice, useEpochs } from '../hooks/useApiData';
import type { RewardCycle } from '../types/api';
import './DistributionPage.css';

// Helper to get current epoch date
function getCurrentEpoch(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface DistributionData {
  id: string;
  date: string;
  time: string;
  recipients: number;
  transactions: number;
  distributedSOL: number;
  status: 'Complete' | 'Failed';
}

export function DistributionPage() {
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

  // Transform historical reward cycles to distribution data
  const allDistributionData: DistributionData[] = useMemo(() => {
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

        // Format date as YYYY-MM-DD for consistency
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return {
          id: cycle.id,
          date: dateStr,
          time: cetTime,
          recipients: cycle.eligibleHoldersCount || 0,
          transactions: cycle.eligibleHoldersCount || 0, // Assume 1 transaction per recipient
          distributedSOL: cycle.totalSOLDistributed || 0,
          status: 'Complete' as const,
        };
      });
  }, [historicalData]);

  // Filter data by last 30 days from selected epoch
  const distributionData: DistributionData[] = useMemo(() => {
    if (!selectedEpoch) return allDistributionData;
    
    // Calculate date 30 days before selected epoch
    const selectedDate = new Date(selectedEpoch + 'T00:00:00Z');
    const startDate = new Date(selectedDate);
    startDate.setUTCDate(startDate.getUTCDate() - 29); // 30 days including selected day
    
    return allDistributionData.filter((item) => {
      const itemDate = new Date(item.date + 'T00:00:00Z');
      return itemDate >= startDate && itemDate <= selectedDate;
    });
  }, [allDistributionData, selectedEpoch]);

  // Calculate stats from data
  const totalSOLDistributed = useMemo(() => {
    // Sum all SOL distributed in the filtered period
    return distributionData.reduce((sum, item) => sum + item.distributedSOL, 0);
  }, [distributionData]);

  // Distribution USD Value: total SOL × SOL price
  const distributionUSDValue = useMemo(() => {
    const solPrice = solPriceData?.price || 0;
    return totalSOLDistributed * solPrice;
  }, [totalSOLDistributed, solPriceData]);

  // Last Distribution: time only from most recent distribution with CET timezone
  const lastDistribution = useMemo(() => {
    if (allDistributionData.length > 0) {
      // Sort by date descending to get most recent
      const sorted = [...allDistributionData].sort((a, b) => 
        new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime()
      );
      // Time is already in CET 24-hour format from the map function
      return `${sorted[0].time} CET`;
    }
    return 'N/A';
  }, [allDistributionData]);

  // Next Distribution: fetch from rewardsData (Processing section)
  const nextDistribution = useMemo(() => {
    if (rewardsData?.nextRun) {
      const nextRun = new Date(rewardsData.nextRun);
      const now = new Date();
      const diffMs = nextRun.getTime() - now.getTime();
      const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
      return diffMinutes <= 5 ? '5 Minutes' : `${diffMinutes} Minutes`;
    }
    return '5 Minutes';
  }, [rewardsData]);

  // Table columns with new order: DATE, TIME, DISTRIBUTED (SOL), VALUE $, TRX, STATUS
  const columns: TableColumn<DistributionData>[] = useMemo(() => {
    const solPrice = solPriceData?.price || 0;
    
    return [
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
        key: 'distributedSOL',
        header: 'DISTRIBUTED (SOL)',
        accessor: (row) => row.distributedSOL.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 4 }),
        sortable: true,
        sortFn: (a, b) => a.distributedSOL - b.distributedSOL,
      },
      {
        key: 'usdValue',
        header: 'VALUE $',
        accessor: (row) => `$${(row.distributedSOL * solPrice).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`,
        sortable: true,
        sortFn: (a, b) => (a.distributedSOL * solPrice) - (b.distributedSOL * solPrice),
      },
      {
        key: 'transactions',
        header: 'TRANSACTIONS',
        accessor: (row) => row.transactions.toLocaleString(undefined, { maximumFractionDigits: 0 }),
        sortable: true,
        sortFn: (a, b) => a.transactions - b.transactions,
      },
      {
        key: 'status',
        header: 'STATUS',
        accessor: (row) => (
          <a 
            href="#" 
            className="distribution-status-link"
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
    ];
  }, [solPriceData]);

  // Export CSV handler
  const handleExportCSV = () => {
    const solPrice = solPriceData?.price || 0;
    const headers = ['DATE', 'TIME', 'DISTRIBUTED (SOL)', 'VALUE $', 'TRANSACTIONS', 'STATUS'];
    const rows = distributionData.map((row) => [
      row.date,
      row.time,
      row.distributedSOL.toFixed(4),
      (row.distributedSOL * solPrice).toFixed(2),
      row.transactions.toString(),
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
    link.setAttribute('download', `distribution-data-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoadingRewards || isLoadingHistorical) {
    return (
      <div className="distribution-page">
        <div className="loading">Loading distribution data...</div>
      </div>
    );
  }

  return (
    <div className="distribution-page">
      {/* Distribution Data Section */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">Distribution Data</h2>
          <p className="section-subtitle">Track SOL reward distributions to holders and their USD values.</p>
          
          {/* Stats Summary */}
          <div className="distribution-stats">
            <StatCard
              label="Total SOL Distributed"
              value={`${totalSOLDistributed.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 4 })} SOL`}
            />
            <StatCard
              label="Distribution USD Value"
              value={`$${distributionUSDValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            />
            <StatCard
              label="Next Distribution"
              value={nextDistribution}
            />
            <StatCard
              label="Last Distribution"
              value={lastDistribution}
            />
          </div>

          {/* Calendar Filter and Export */}
          <div className="distribution-filters-row">
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

          {/* Distribution Data Table */}
          <div className="distribution-table-container">
            <Table
              data={distributionData}
              columns={columns}
              searchable={false}
              pagination={true}
              pageSize={15}
              exportable={false}
              exportFilename="distribution-data"
              loading={false}
            />
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
