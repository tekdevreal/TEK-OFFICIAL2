import { useMemo, useState, useEffect } from 'react';
import { StatCard } from '../components/StatCard';
import { GlassCard } from '../components/GlassCard';
import { Table, type TableColumn } from '../components/Table';
import { useRewards } from '../hooks/useApiData';
import './HarvestingPage.css';

export interface HarvestingData {
  id: string;
  date: string;
  time: string;
  nukeSold: number;
  rewardPoolSOL: number;
  allocatedSOL: number;
}

export function HarvestingPage() {
  const {
    data: rewardsData,
    isLoading: isLoadingRewards,
  } = useRewards(undefined, {
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  // Year filter state
  const [selectedYear, setSelectedYear] = useState<number>(2025);

  // Placeholder harvesting data for demonstration
  const allHarvestingData: HarvestingData[] = useMemo(() => {
    return [
      {
        id: 'HARV-001',
        date: '2025-01-15',
        time: '10:30 AM EST',
        nukeSold: 125000,
        rewardPoolSOL: 9.375,
        allocatedSOL: 7.031,
      },
      {
        id: 'HARV-002',
        date: '2025-01-14',
        time: '10:30 AM EST',
        nukeSold: 118500,
        rewardPoolSOL: 8.888,
        allocatedSOL: 6.666,
      },
      {
        id: 'HARV-003',
        date: '2025-01-13',
        time: '10:30 AM EST',
        nukeSold: 132000,
        rewardPoolSOL: 9.900,
        allocatedSOL: 7.425,
      },
      {
        id: 'HARV-004',
        date: '2025-01-12',
        time: '10:30 AM EST',
        nukeSold: 110000,
        rewardPoolSOL: 8.250,
        allocatedSOL: 6.188,
      },
      {
        id: 'HARV-005',
        date: '2025-01-11',
        time: '10:30 AM EST',
        nukeSold: 140000,
        rewardPoolSOL: 10.500,
        allocatedSOL: 7.875,
      },
    ];
  }, []);

  // Get available months for selected year
  const availableMonths = useMemo(() => {
    const months = new Set<number>();
    allHarvestingData.forEach((item) => {
      const itemDate = new Date(item.date);
      if (itemDate.getFullYear() === selectedYear) {
        months.add(itemDate.getMonth() + 1);
      }
    });
    return Array.from(months).sort((a, b) => a - b);
  }, [allHarvestingData, selectedYear]);

  // Month names
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Initialize selected month to the latest available month
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // Update selected month when available months change
  useEffect(() => {
    if (availableMonths.length > 0 && (selectedMonth === null || !availableMonths.includes(selectedMonth))) {
      setSelectedMonth(availableMonths[availableMonths.length - 1]);
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
    return harvestingData.reduce((sum, item) => sum + item.nukeSold, 0);
  }, [harvestingData]);

  const lastHarvesting = harvestingData.length > 0 ? harvestingData[0].date : 'N/A';
  const nextHarvesting = rewardsData?.nextRun 
    ? new Date(rewardsData.nextRun).toLocaleDateString()
    : 'N/A';

  const estimatedSOL = useMemo(() => {
    const totalRewardPool = harvestingData.reduce((sum, item) => sum + item.rewardPoolSOL, 0);
    return totalRewardPool.toFixed(6);
  }, [harvestingData]);

  // Table columns
  const columns: TableColumn<HarvestingData>[] = useMemo(() => [
    {
      key: 'id',
      header: 'ID',
      accessor: (row) => (
        <a 
          href="#" 
          className="harvesting-id-link"
          onClick={(e) => {
            e.preventDefault();
            // TODO: Link to detailed spreadsheet
          }}
        >
          {row.id}
        </a>
      ),
      sortable: true,
      sortFn: (a, b) => a.id.localeCompare(b.id),
    },
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
  ], []);

  // Export CSV handler
  const handleExportCSV = () => {
    const headers = ['ID', 'DATE', 'TIME', 'NUKE SOLD', 'REWARD POOL (SOL)', 'ALLOCATED (SOL)'];
    const rows = harvestingData.map((row) => [
      row.id,
      row.date,
      row.time,
      row.nukeSold.toString(),
      row.rewardPoolSOL.toString(),
      row.allocatedSOL.toString(),
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

  if (isLoadingRewards) {
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
              label="Next Harvesting"
              value={nextHarvesting}
            />
            <StatCard
              label="Last Harvesting"
              value={lastHarvesting}
            />
            <StatCard
              label="Estimated SOL"
              value={`${estimatedSOL} SOL`}
            />
          </div>

          {/* Year and Month Filters with Export */}
          <div className="harvesting-filters-row">
            <div className="filter-group">
              <label className="filter-label">Year:</label>
              <button
                className="filter-button active"
                onClick={() => {
                  setSelectedYear(2025);
                }}
              >
                2025
              </button>
            </div>
            
            {availableMonths.length > 0 && selectedMonth !== null && (
              <div className="filter-group">
                <label className="filter-label">Month:</label>
                <button
                  className="filter-button active"
                >
                  {monthNames[selectedMonth - 1]}
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
