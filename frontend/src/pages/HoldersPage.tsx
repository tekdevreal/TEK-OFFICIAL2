import { useMemo, useState, useEffect } from 'react';
import { StatCard } from '../components/StatCard';
import { GlassCard } from '../components/GlassCard';
import { Table, type TableColumn } from '../components/Table';
import { useRewards, useTreasuryBalance } from '../hooks/useApiData';
import './HoldersPage.css';

export interface TreasuryActivityData {
  id: string;
  date: string;
  time: string;
  action: string;
  amount: string;
  detail: string;
  reference: string; // Transaction signature for Solscan link
}

export function HoldersPage() {
  const {
    isLoading: isLoadingRewards,
  } = useRewards(undefined, {
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  // Year filter state
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  
  // Month filter state - initialize to December
  const [selectedMonth, setSelectedMonth] = useState<number | null>(12);

  // Treasury wallet address
  const treasuryWalletAddress = import.meta.env.VITE_TREASURY_WALLET_ADDRESS || 'DwhLErVhPhzg1ep19Lracmp6iMTECh4nVBdPebsvJwjo';

  // Placeholder treasury activity data for demonstration
  const allTreasuryActivity: TreasuryActivityData[] = useMemo(() => {
    return [
      {
        id: 'TREAS-001',
        date: '2025-12-28',
        time: '2:30 PM EST',
        action: 'Add Liquidity',
        amount: '$5,000',
        detail: 'Added liquidity to NUKE/SOL Pool',
        reference: '5KJp8vN2mQr9xYz3wE7tR4bC6dF1gH8jL0pM9nQ2sT5uV7xY',
      },
    ];
  }, []);

  // Get available months for selected year
  const availableMonths = useMemo(() => {
    const months = new Set<number>();
    allTreasuryActivity.forEach((item) => {
      const itemDate = new Date(item.date);
      if (itemDate.getFullYear() === selectedYear) {
        months.add(itemDate.getMonth() + 1);
      }
    });
    return Array.from(months).sort((a, b) => a - b);
  }, [allTreasuryActivity, selectedYear]);

  // Month names
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Update selected month when available months change (initialize to December if available)
  useEffect(() => {
    if (availableMonths.length > 0) {
      if (selectedMonth === null || !availableMonths.includes(selectedMonth)) {
        // Prefer December if available, otherwise use the latest available month
        const decemberIndex = availableMonths.indexOf(12);
        setSelectedMonth(decemberIndex >= 0 ? 12 : availableMonths[availableMonths.length - 1]);
      }
    } else {
      setSelectedMonth(null);
    }
  }, [availableMonths, selectedMonth]);

  // Filter data by year and month
  const treasuryActivity: TreasuryActivityData[] = useMemo(() => {
    return allTreasuryActivity.filter((item) => {
      const itemDate = new Date(item.date);
      const itemYear = itemDate.getFullYear();
      const itemMonth = itemDate.getMonth() + 1; // getMonth() returns 0-11
      
      if (itemYear !== selectedYear) return false;
      if (selectedMonth !== null && itemMonth !== selectedMonth) return false;
      return true;
    });
  }, [allTreasuryActivity, selectedYear, selectedMonth]);

  // Fetch treasury balance from backend
  const {
    data: treasuryBalanceData,
    isLoading: isLoadingTreasuryBalance,
  } = useTreasuryBalance(treasuryWalletAddress, {
    refetchInterval: 2 * 60 * 1000, // 2 minutes
  });

  // Calculate stats from data
  const treasuryBalance = useMemo(() => {
    if (isLoadingTreasuryBalance) {
      return 'Loading...';
    }
    if (treasuryBalanceData?.balanceSOL !== undefined && treasuryBalanceData.balanceSOL > 0) {
      return `${treasuryBalanceData.balanceSOL.toFixed(6)} SOL`;
    }
    return '0.000000 SOL';
  }, [treasuryBalanceData, isLoadingTreasuryBalance]);

  const pendingAllocation = '$0';
  const activeDeployments = '1';
  const lastTreasuryAction = '2025-12-28';

  // Table columns
  const columns: TableColumn<TreasuryActivityData>[] = useMemo(() => [
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
      key: 'action',
      header: 'ACTION',
      accessor: (row) => row.action,
      sortable: true,
      sortFn: (a, b) => a.action.localeCompare(b.action),
    },
    {
      key: 'amount',
      header: 'AMOUNT',
      accessor: (row) => row.amount,
      sortable: true,
      sortFn: (a, b) => {
        const aNum = parseFloat(a.amount.replace(/[^0-9.]/g, ''));
        const bNum = parseFloat(b.amount.replace(/[^0-9.]/g, ''));
        return aNum - bNum;
      },
    },
    {
      key: 'detail',
      header: 'DETAIL',
      accessor: (row) => row.detail,
      sortable: true,
      sortFn: (a, b) => a.detail.localeCompare(b.detail),
    },
    {
      key: 'reference',
      header: 'REFERENCE',
      accessor: (row) => (
        <a 
          href={`https://solscan.io/tx/${row.reference}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="treasury-reference-link"
        >
          {`${row.reference.substring(0, 8)}...${row.reference.substring(row.reference.length - 8)}`}
        </a>
      ),
      sortable: true,
      sortFn: (a, b) => a.reference.localeCompare(b.reference),
    },
  ], []);

  // Export CSV handler
  const handleExportCSV = () => {
    const headers = ['DATE', 'TIME', 'ACTION', 'AMOUNT', 'DETAIL', 'REFERENCE'];
    const rows = treasuryActivity.map((row) => [
      row.date,
      row.time,
      row.action,
      row.amount,
      row.detail,
      row.reference,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `treasury-activity-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy wallet address to clipboard
  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(treasuryWalletAddress);
      // Could add a notification here if needed
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  // Solscan link for treasury wallet
  const solscanWalletUrl = `https://solscan.io/account/${treasuryWalletAddress}?cluster=devnet`;

  if (isLoadingRewards) {
    return (
      <div className="holders-page">
        <div className="loading">Loading treasury data...</div>
      </div>
    );
  }

  return (
    <div className="holders-page">
      {/* Treasury Data Section */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">Treasury Data</h2>
          <p className="section-subtitle">Real-time visibility into protocol funds, allocations, and treasury activity.</p>
          
          {/* Stats Summary */}
          <div className="treasury-stats">
            <StatCard
              label="Treasury Balance"
              value={treasuryBalance}
            />
            <StatCard
              label="Pending Allocation"
              value={pendingAllocation}
            />
            <StatCard
              label="Active Deployments"
              value={activeDeployments}
            />
            <StatCard
              label="Last Treasury Action"
              value={lastTreasuryAction}
            />
          </div>

          {/* Treasury Wallet Address */}
          <div className="treasury-wallet-section">
            <label className="wallet-label">Treasury wallet address:</label>
            <div className="wallet-address-container">
              <span className="wallet-address">{treasuryWalletAddress}</span>
              <div className="wallet-buttons-group">
                <button
                  className="copy-button"
                  onClick={handleCopyAddress}
                  title="Copy address"
                >
                  Copy
                </button>
                <a
                  href={solscanWalletUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="solscan-button"
                >
                  Solscan
                </a>
              </div>
            </div>
          </div>

          {/* Year and Month Filters with Export */}
          <div className="treasury-filters-row">
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

          {/* Treasury Activity Log Table */}
          <div className="treasury-table-container">
            <Table
              data={treasuryActivity}
              columns={columns}
              searchable={false}
              pagination={true}
              pageSize={10}
              exportable={false}
              exportFilename="treasury-activity"
              loading={false}
            />
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
