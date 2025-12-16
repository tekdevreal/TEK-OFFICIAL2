import { useState, useEffect } from 'react';
import { fetchHolders } from '../services/api';
import type { Holder } from '../types/api';
import { Table } from '../components/Table';
import type { TableColumn } from '../components/Table';
import './HoldersPage.css';

export function HoldersPage() {
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load all holders (with pagination handled by table)
        const response = await fetchHolders({ limit: 1000, offset: 0 });
        setHolders(response.holders);
        setTotal(response.total);
      } catch (error) {
        console.error('Error loading holders:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatBalance = (balance: string) => {
    const num = BigInt(balance);
    return (Number(num) / 1e9).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'eligible':
        return 'badge-eligible';
      case 'excluded':
        return 'badge-excluded';
      case 'blacklisted':
        return 'badge-blacklisted';
      default:
        return '';
    }
  };

  const columns: TableColumn<Holder>[] = [
    {
      key: 'pubkey',
      header: 'Pubkey',
      accessor: (row) => (
        <span className="pubkey-cell" title={row.pubkey}>
          {`${row.pubkey.substring(0, 8)}...${row.pubkey.substring(row.pubkey.length - 8)}`}
        </span>
      ),
      sortable: false,
    },
    {
      key: 'balance',
      header: 'Balance',
      accessor: (row) => formatBalance(row.balance),
      sortable: true,
      sortFn: (a, b) => {
        const aNum = BigInt(a.balance);
        const bNum = BigInt(b.balance);
        return aNum > bNum ? 1 : aNum < bNum ? -1 : 0;
      },
    },
    {
      key: 'usdValue',
      header: 'USD Value',
      accessor: (row) => `$${(row.usdValue || 0).toFixed(2)}`,
      sortable: true,
      sortFn: (a, b) => (a.usdValue || 0) - (b.usdValue || 0),
    },
    {
      key: 'eligibilityStatus',
      header: 'Status',
      accessor: (row) => (
        <span className={`badge ${getStatusBadgeClass(row.eligibilityStatus)}`}>
          {row.eligibilityStatus}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => a.eligibilityStatus.localeCompare(b.eligibilityStatus),
    },
    {
      key: 'lastReward',
      header: 'Last Reward',
      accessor: (row) =>
        row.lastReward ? new Date(row.lastReward).toLocaleString() : 'Never',
      sortable: true,
      sortFn: (a, b) => {
        if (!a.lastReward && !b.lastReward) return 0;
        if (!a.lastReward) return 1;
        if (!b.lastReward) return -1;
        return new Date(a.lastReward).getTime() - new Date(b.lastReward).getTime();
      },
    },
    {
      key: 'retryCount',
      header: 'Retry Count',
      accessor: (row) => row.retryCount,
      sortable: true,
      sortFn: (a, b) => a.retryCount - b.retryCount,
    },
  ];

  const statusFilter = {
    key: 'eligibilityStatus',
    label: 'Status',
    options: [
      { value: 'eligible', label: 'Eligible' },
      { value: 'excluded', label: 'Excluded' },
      { value: 'blacklisted', label: 'Blacklisted' },
    ],
  };

  return (
    <div className="holders-page">
      <div className="page-header">
        <h2>Token Holders</h2>
        <p className="page-subtitle">All NUKE token holders with eligibility status</p>
      </div>

      <div className="holders-summary">
        <div className="summary-stat">
          <span className="stat-label">Total Holders:</span>
          <span className="stat-value">{total}</span>
        </div>
        <div className="summary-stat highlight">
          <span className="stat-label">Eligible:</span>
          <span className="stat-value stat-eligible">
            {holders.filter((h) => h.eligibilityStatus === 'eligible').length}
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Excluded:</span>
          <span className="stat-value">
            {holders.filter((h) => h.eligibilityStatus === 'excluded').length}
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Blacklisted:</span>
          <span className="stat-value stat-blacklisted">
            {holders.filter((h) => h.eligibilityStatus === 'blacklisted').length}
          </span>
        </div>
      </div>

      <Table
        data={holders}
        columns={columns}
        searchable={true}
        searchPlaceholder="Search by pubkey..."
        searchKeys={['pubkey']}
        filterable={true}
        filters={[statusFilter]}
        onFilter={(row, filterKey, filterValue) => {
          if (filterKey === 'eligibilityStatus') {
            return row.eligibilityStatus === filterValue;
          }
          return true;
        }}
        exportable={true}
        exportFilename="token-holders"
        exportHeaders={columns.map((col) => col.header)}
        pagination={true}
        pageSize={50}
        loading={loading}
        emptyMessage="No holders found"
      />
    </div>
  );
}

