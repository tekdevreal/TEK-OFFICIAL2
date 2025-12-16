import { useState, useEffect } from 'react';
import { fetchRewards, fetchHistoricalRewards, exportRewards } from '../services/api';
import type { RewardsResponse, RewardCycle } from '../types/api';
import { Table } from '../components/Table';
import type { TableColumn } from '../components/Table';
import { exportToExcel } from '../utils/exportUtils';
import { showNotification } from '../components/Notifications';
import './HarvestPage.css';

export function HarvestPage() {
  const [data, setData] = useState<RewardsResponse | null>(null);
  const [harvestCycles, setHarvestCycles] = useState<RewardCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [dateFilters, setDateFilters] = useState<{ startDate?: string; endDate?: string }>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load current rewards status
        const currentResponse = await fetchRewards();
        setData(currentResponse);

        // Load historical cycles
        const offset = (currentPage - 1) * pageSize;
        const historicalResponse = await fetchHistoricalRewards({
          ...dateFilters,
          limit: pageSize,
          offset,
        });

        setHarvestCycles(historicalResponse.cycles);
        setTotal(historicalResponse.total);
      } catch (error) {
        console.error('Error loading harvest data:', error);
        showNotification('Failed to load harvest cycles', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [currentPage, pageSize, dateFilters]);

  const columns: TableColumn<RewardCycle>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      accessor: (row) => new Date(row.timestamp).toLocaleString(),
      sortable: true,
      sortFn: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    },
    {
      key: 'totalHoldersCount',
      header: 'Total Holders',
      accessor: (row) => row.totalHoldersCount.toLocaleString(),
      sortable: true,
      sortFn: (a, b) => a.totalHoldersCount - b.totalHoldersCount,
    },
    {
      key: 'eligibleHoldersCount',
      header: 'Eligible',
      accessor: (row) => (
        <span style={{ color: '#28a745', fontWeight: 600 }}>
          {row.eligibleHoldersCount.toLocaleString()}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => a.eligibleHoldersCount - b.eligibleHoldersCount,
    },
    {
      key: 'excludedHoldersCount',
      header: 'Excluded',
      accessor: (row) => row.excludedHoldersCount.toLocaleString(),
      sortable: true,
      sortFn: (a, b) => a.excludedHoldersCount - b.excludedHoldersCount,
    },
    {
      key: 'blacklistedHoldersCount',
      header: 'Blacklisted',
      accessor: (row) => (
        <span style={{ color: '#dc3545' }}>{row.blacklistedHoldersCount.toLocaleString()}</span>
      ),
      sortable: true,
      sortFn: (a, b) => a.blacklistedHoldersCount - b.blacklistedHoldersCount,
    },
    {
      key: 'totalSOLDistributed',
      header: 'Total SOL',
      accessor: (row) => (
        <span style={{ color: '#4a90e2', fontWeight: 600 }}>
          {(row.totalSOLDistributed || 0).toFixed(6)} SOL
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => a.totalSOLDistributed - b.totalSOLDistributed,
    },
    {
      key: 'tokenPriceUSD',
      header: 'Token Price (USD)',
      accessor: (row) => `$${(row.tokenPriceUSD || 0).toFixed(6)}`,
      sortable: true,
      sortFn: (a, b) => (a.tokenPriceUSD || 0) - (b.tokenPriceUSD || 0),
    },
  ];

  const handleExcelExport = async () => {
    try {
      if (harvestCycles.length === 0) {
        showNotification('No data to export', 'warning');
        return;
      }

      // Fetch export data from backend
      const exportData = await exportRewards(dateFilters);

      // Prepare summary sheet
      const summaryData = data
        ? [
            ['Harvest Cycles Summary'],
            [''],
            ['Total Cycles', total],
            ['Latest Eligible Holders', data.statistics?.eligibleHolders || 0],
            ['Latest Excluded Holders', data.statistics?.excludedHolders || 0],
            ['Latest Blacklisted Holders', data.statistics?.blacklistedHolders || 0],
            ['Total SOL Distributed', (data.statistics?.totalSOLDistributed || 0).toFixed(6)],
                  // Token price removed for debugging
            [''],
            ['Last Harvest', data.lastRun ? new Date(data.lastRun).toLocaleString() : 'Never'],
            ['Next Harvest', data.nextRun ? new Date(data.nextRun).toLocaleString() : 'N/A'],
            [''],
            ['Export Date Range', exportData.metadata.dateRange.start === 'all' 
              ? 'All Time' 
              : `${exportData.metadata.dateRange.start} to ${exportData.metadata.dateRange.end}`],
          ]
        : [['No summary data available']];

      exportToExcel(
        [
          {
            name: 'Summary',
            data: summaryData.map((row) => ({ '': row[0], Value: row[1] || '' })),
            headers: ['Metric', 'Value'],
          },
          {
            name: 'Harvest Cycles',
            data: exportData.data,
          },
        ],
        'harvest-cycles-report'
      );

      showNotification('Excel export started', 'success');
    } catch (error) {
      console.error('Export error:', error);
      showNotification('Failed to export Excel file', 'error');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="harvest-page">
      <div className="page-header">
        <h2>Harvest Cycles</h2>
        <p className="page-subtitle">Reward computation cycles and eligibility statistics</p>
      </div>

      {data && (
        <div className="harvest-summary">
          <div className="summary-card">
            <div className="card-label">Last Harvest</div>
            <div className="card-value">
              {data.lastRun ? new Date(data.lastRun).toLocaleString() : 'Never'}
            </div>
          </div>
          <div className="summary-card">
            <div className="card-label">Next Harvest</div>
            <div className="card-value">
              {data.nextRun ? new Date(data.nextRun).toLocaleString() : 'N/A'}
            </div>
          </div>
          <div className="summary-card highlight">
            <div className="card-label">Current Eligible</div>
            <div className="card-value">{data.statistics.eligibleHolders}</div>
          </div>
          <div className="summary-card highlight">
            <div className="card-label">Total SOL Distributed</div>
            <div className="card-value">{(data.statistics?.totalSOLDistributed || 0).toFixed(6)} SOL</div>
          </div>
        </div>
      )}

      <div className="export-toolbar">
        <button onClick={handleExcelExport} className="export-excel-btn">
          Export to Excel
        </button>
      </div>

      <div className="filters-section">
        <input
          type="date"
          value={dateFilters.startDate || ''}
          onChange={(e) => {
            setDateFilters((prev) => ({ ...prev, startDate: e.target.value || undefined }));
            setCurrentPage(1);
          }}
          className="filter-date"
          placeholder="Start Date"
        />
        <input
          type="date"
          value={dateFilters.endDate || ''}
          onChange={(e) => {
            setDateFilters((prev) => ({ ...prev, endDate: e.target.value || undefined }));
            setCurrentPage(1);
          }}
          className="filter-date"
          placeholder="End Date"
        />
        {(dateFilters.startDate || dateFilters.endDate) && (
          <button
            onClick={() => {
              setDateFilters({});
              setCurrentPage(1);
            }}
            className="clear-filters-btn"
          >
            Clear Filters
          </button>
        )}
      </div>

      <Table
        data={harvestCycles}
        columns={columns}
        searchable={false}
        filterable={false}
        exportable={false}
        pagination={false}
        loading={loading}
        emptyMessage="No harvest cycles recorded yet"
      />

      {totalPages > 1 && (
        <div className="pagination-controls">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {currentPage} of {totalPages} ({total} total)
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="pagination-btn"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

