import { useMemo, useState, useEffect } from 'react';
import { StatCard } from '../components/StatCard';
import { GlassCard } from '../components/GlassCard';
import { Table, type TableColumn } from '../components/Table';
import { useRewards } from '../hooks/useApiData';
import './DistributionPage.css';

export interface DistributionData {
  id: string;
  date: string;
  time: string;
  recipients: number;
  transactions: number;
  distributedSOL: number;
}

export function DistributionPage() {
  const {
    data: rewardsData,
    isLoading: isLoadingRewards,
  } = useRewards(undefined, {
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  // Year filter state
  const [selectedYear, setSelectedYear] = useState<number>(2025);

  // Placeholder distribution data for demonstration
  const allDistributionData: DistributionData[] = useMemo(() => {
    return [
      {
        id: 'DIST-001',
        date: '2025-01-15',
        time: '10:30 AM EST',
        recipients: 1250,
        transactions: 1250,
        distributedSOL: 7.031,
      },
      {
        id: 'DIST-002',
        date: '2025-01-14',
        time: '10:30 AM EST',
        recipients: 1180,
        transactions: 1180,
        distributedSOL: 6.666,
      },
      {
        id: 'DIST-003',
        date: '2025-01-13',
        time: '10:30 AM EST',
        recipients: 1320,
        transactions: 1320,
        distributedSOL: 7.425,
      },
      {
        id: 'DIST-004',
        date: '2025-01-12',
        time: '10:30 AM EST',
        recipients: 1100,
        transactions: 1100,
        distributedSOL: 6.188,
      },
      {
        id: 'DIST-005',
        date: '2025-01-11',
        time: '10:30 AM EST',
        recipients: 1400,
        transactions: 1400,
        distributedSOL: 7.875,
      },
    ];
  }, []);

  // Get available months for selected year
  const availableMonths = useMemo(() => {
    const months = new Set<number>();
    allDistributionData.forEach((item) => {
      const itemDate = new Date(item.date);
      if (itemDate.getFullYear() === selectedYear) {
        months.add(itemDate.getMonth() + 1);
      }
    });
    return Array.from(months).sort((a, b) => a - b);
  }, [allDistributionData, selectedYear]);

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
  const totalNukeSold = useMemo(() => {
    // Placeholder calculation - in real implementation, this would come from backend
    return distributionData.reduce((sum, item) => sum + item.distributedSOL * 13333, 0); // Rough estimate
  }, [distributionData]);

  const lastDistribution = distributionData.length > 0 ? distributionData[0].date : 'N/A';
  const nextDistribution = rewardsData?.nextRun 
    ? new Date(rewardsData.nextRun).toLocaleDateString()
    : 'N/A';

  const estimatedSOL = useMemo(() => {
    const totalDistributed = distributionData.reduce((sum, item) => sum + item.distributedSOL, 0);
    return totalDistributed.toFixed(6);
  }, [distributionData]);

  // Table columns
  const columns: TableColumn<DistributionData>[] = useMemo(() => [
    {
      key: 'id',
      header: 'ID',
      accessor: (row) => (
        <a 
          href="#" 
          className="distribution-id-link"
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
  ], []);

  // Export CSV handler
  const handleExportCSV = () => {
    const headers = ['ID', 'DATE', 'TIME', 'RECIPIENTS', 'TRANSACTIONS', 'DISTRIBUTED (SOL)'];
    const rows = distributionData.map((row) => [
      row.id,
      row.date,
      row.time,
      row.recipients.toString(),
      row.transactions.toString(),
      row.distributedSOL.toString(),
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

  if (isLoadingRewards) {
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
              label="Total NUKE Sold"
              value={totalNukeSold.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            />
            <StatCard
              label="Next Distribution"
              value={nextDistribution}
            />
            <StatCard
              label="Last Distribution"
              value={lastDistribution}
            />
            <StatCard
              label="Estimated SOL"
              value={`${estimatedSOL} SOL`}
            />
          </div>

          {/* Year and Month Filters with Export */}
          <div className="distribution-filters-row">
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
