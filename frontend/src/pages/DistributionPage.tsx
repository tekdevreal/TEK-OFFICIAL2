import { useMemo, useState, useEffect } from 'react';
import { StatCard } from '../components/StatCard';
import { GlassCard } from '../components/GlassCard';
import { Table, type TableColumn } from '../components/Table';
import { useRewards, useHistoricalRewards, useSolPrice } from '../hooks/useApiData';
import type { RewardCycle } from '../types/api';
import './DistributionPage.css';

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
  const {
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

  // Transform historical reward cycles to distribution data
  const allDistributionData: DistributionData[] = useMemo(() => {
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

        // Format date as YYYY-MM-DD for consistency
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return {
          id: cycle.id,
          date: dateStr,
          time: `${displayHours}:${displayMinutes} ${period} EST`,
          recipients: cycle.eligibleHoldersCount || 0,
          transactions: cycle.eligibleHoldersCount || 0, // Assume 1 transaction per recipient
          distributedSOL: cycle.totalSOLDistributed || 0,
          status: 'Complete' as const,
        };
      });
  }, [historicalData]);

  // Get available years and months from actual data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    allDistributionData.forEach((item) => {
      const itemDate = new Date(item.date);
      years.add(itemDate.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  }, [allDistributionData]);

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
    allDistributionData.forEach((item) => {
      const itemDate = new Date(item.date);
      if (itemDate.getFullYear() === selectedYear) {
        months.add(itemDate.getMonth() + 1);
      }
    });
    return Array.from(months).sort((a, b) => b - a); // Most recent first
  }, [allDistributionData, selectedYear]);

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
  const distributionData: DistributionData[] = useMemo(() => {
    return allDistributionData.filter((item) => {
      const itemDate = new Date(item.date);
      const itemYear = itemDate.getFullYear();
      const itemMonth = itemDate.getMonth() + 1; // getMonth() returns 0-11
      
      if (itemYear !== selectedYear) return false;
      if (selectedMonth !== null && itemMonth !== selectedMonth) return false;
      return true;
    });
  }, [allDistributionData, selectedYear, selectedMonth]);

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

  // Last Distribution: time only from most recent distribution
  const lastDistribution = useMemo(() => {
    if (allDistributionData.length > 0) {
      // Sort by date descending to get most recent
      const sorted = [...allDistributionData].sort((a, b) => 
        new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime()
      );
      // Extract just the time portion (HH:MM)
      const timeMatch = sorted[0].time.match(/(\d{1,2}:\d{2})/);
      return timeMatch ? timeMatch[1] : 'N/A';
    }
    return 'N/A';
  }, [allDistributionData]);

  // Table columns
  const columns: TableColumn<DistributionData>[] = useMemo(() => [
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
      key: 'recipients',
      header: 'RECIPIENTS',
      accessor: (row) => row.recipients.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      sortable: true,
      sortFn: (a, b) => a.recipients - b.recipients,
    },
    {
      key: 'transactions',
      header: 'TRANSACTIONS',
      accessor: (row) => row.transactions.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      sortable: true,
      sortFn: (a, b) => a.transactions - b.transactions,
    },
    {
      key: 'distributedSOL',
      header: 'DISTRIBUTED (SOL)',
      accessor: (row) => row.distributedSOL.toLocaleString(undefined, { maximumFractionDigits: 6 }),
      sortable: true,
      sortFn: (a, b) => a.distributedSOL - b.distributedSOL,
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
  ], []);

  // Export CSV handler
  const handleExportCSV = () => {
    const headers = ['DATE', 'TIME', 'RECIPIENTS', 'TRANSACTIONS', 'DISTRIBUTED (SOL)', 'STATUS'];
    const rows = distributionData.map((row) => [
      row.date,
      row.time,
      row.recipients.toString(),
      row.transactions.toString(),
      row.distributedSOL.toString(),
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
              value={`${totalSOLDistributed.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`}
            />
            <StatCard
              label="Distribution USD Value"
              value={`$${distributionUSDValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            />
            <StatCard
              label="Next Distribution"
              value="5 Minutes"
            />
            <StatCard
              label="Last Distribution"
              value={lastDistribution}
            />
          </div>

          {/* Year and Month Filters with Export */}
          <div className="distribution-filters-row">
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

          {/* Distribution Data Table */}
          <div className="distribution-table-container">
            <Table
              data={distributionData}
              columns={columns}
              searchable={false}
              pagination={true}
              pageSize={10}
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
