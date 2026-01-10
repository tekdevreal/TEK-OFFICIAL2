import { useMemo, useState, useEffect } from 'react';
import { StatCard } from '../components/StatCard';
import { GlassCard } from '../components/GlassCard';
import { Table, type TableColumn } from '../components/Table';
import { useRewards, useHistoricalRewards, useSolPrice } from '../hooks/useApiData';
import type { RewardCycle } from '../types/api';
import './HarvestingPage.css';

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

  // Year filter state
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Transform historical reward cycles to harvesting data
  const allHarvestingData: HarvestingData[] = useMemo(() => {
    if (!historicalData?.cycles) {
      return [];
    }

    return historicalData.cycles
      .filter((cycle: RewardCycle) => cycle.totalSOLDistributed > 0) // Only show cycles with distributions
      .map((cycle: RewardCycle) => {
        const d = new Date(cycle.timestamp);
        const hours = d.getHours();
        const minutes = d.getMinutes();
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        const displayMinutes = minutes.toString().padStart(2, '0');

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
          time: `${displayHours}:${displayMinutes} ${period} EST`,
          nukeSold, // Already converted to human-readable format above
          rewardPoolSOL,
          allocatedSOL,
          status: 'Complete' as const,
        };
      });
  }, [historicalData, rewardsData]);

  // Get available years and months from actual data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    allHarvestingData.forEach((item) => {
      const itemDate = new Date(item.date);
      years.add(itemDate.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  }, [allHarvestingData]);

  // Initialize selected year to most recent year
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
      setSelectedMonth(null); // Reset month when year changes
    }
  }, [availableYears, selectedYear]);

  // Get available months for selected year
  const availableMonths = useMemo(() => {
    const months = new Set<number>();
    allHarvestingData.forEach((item) => {
      const itemDate = new Date(item.date);
      if (itemDate.getFullYear() === selectedYear) {
        months.add(itemDate.getMonth() + 1);
      }
    });
    return Array.from(months).sort((a, b) => b - a); // Most recent first
  }, [allHarvestingData, selectedYear]);

  // Month names
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Initialize selected month to the latest available month
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // Update selected month when available months change
  useEffect(() => {
    if (availableMonths.length > 0) {
      if (selectedMonth === null || !availableMonths.includes(selectedMonth)) {
        setSelectedMonth(availableMonths[0]); // Most recent month (first in descending sorted array)
      }
    } else {
      setSelectedMonth(null); // Reset if no months available
    }
  }, [availableMonths, selectedMonth]);

  // Filter data by year and month
  const harvestingData: HarvestingData[] = useMemo(() => {
    return allHarvestingData.filter((item) => {
      const itemDate = new Date(item.date);
      const itemYear = itemDate.getFullYear();
      const itemMonth = itemDate.getMonth() + 1; // getMonth() returns 0-11
      
      if (itemYear !== selectedYear) return false;
      if (selectedMonth !== null && itemMonth !== selectedMonth) return false;
      return true;
    });
  }, [allHarvestingData, selectedYear, selectedMonth]);

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

  // Last Harvesting: time only from most recent harvest
  const lastHarvesting = useMemo(() => {
    if (allHarvestingData.length > 0) {
      // Sort by date descending to get most recent
      const sorted = [...allHarvestingData].sort((a, b) => 
        new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime()
      );
      // Extract just the time portion (HH:MM)
      const timeMatch = sorted[0].time.match(/(\d{1,2}:\d{2})/);
      return timeMatch ? timeMatch[1] : 'N/A';
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
      header: 'NUKE SOLD',
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
              value={`${allocatedSOL.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`}
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

          {/* Year and Month Filters with Export */}
          <div className="harvesting-filters-row">
            <div className="filter-group">
              <label className="filter-label">Year:</label>
              <button
                className="filter-button active"
                onClick={() => {
                  setSelectedYear(selectedYear);
                }}
              >
                {selectedYear}
              </button>
            </div>
            
            {availableMonths.length > 0 && (
              <div className="filter-group">
                <label className="filter-label">Month:</label>
                <button
                  className="filter-button active"
                >
                  {selectedMonth !== null ? monthNames[selectedMonth - 1] : monthNames[availableMonths[0] - 1]}
                </button>
              </div>
            )}

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
              pageSize={10}
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
