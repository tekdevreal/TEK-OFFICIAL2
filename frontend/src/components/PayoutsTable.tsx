import { useState, useEffect } from 'react';
import { fetchPayouts } from '../services/api';
import type { Payout } from '../types/api';
import { Table } from './Table';
import type { TableColumn } from './Table';
import './PayoutsTable.css';

interface PayoutsTableProps {
  refreshInterval?: number;
}

export function PayoutsTable({ refreshInterval = 60000 }: PayoutsTableProps) {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    pending: 0,
    failed: 0,
    totalSOL: 0,
  });

  const loadPayouts = async () => {
    try {
      setLoading(true);
      
      const response = await fetchPayouts({ limit: 1000 });
      
      setPayouts(response.payouts || []);
      setSummary(response.summary || { pending: 0, failed: 0, totalSOL: 0 });
    } catch (err) {
      console.error('Error loading payouts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayouts();
  }, []);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadPayouts();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const columns: TableColumn<Payout>[] = [
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
      key: 'rewardSOL',
      header: 'Reward SOL',
      accessor: (row) => (
        <span style={{ color: '#4a90e2', fontWeight: 600 }}>
          {(row.rewardSOL || 0).toFixed(6)} SOL
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => (a.rewardSOL || 0) - (b.rewardSOL || 0),
    },
    {
      key: 'queuedAt',
      header: 'Queued At',
      accessor: (row) => new Date(row.queuedAt).toLocaleString(),
      sortable: true,
      sortFn: (a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime(),
    },
    {
      key: 'retryCount',
      header: 'Retry Count',
      accessor: (row) => row.retryCount,
      sortable: true,
      sortFn: (a, b) => a.retryCount - b.retryCount,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => {
        const statusClass = row.status === 'pending' ? 'badge-pending' : 'badge-failed';
        return <span className={`badge ${statusClass}`}>{row.status}</span>;
      },
      sortable: true,
      sortFn: (a, b) => a.status.localeCompare(b.status),
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
  ];

  const statusFilter = {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'pending', label: 'Pending' },
      { value: 'failed', label: 'Failed' },
    ],
  };

  return (
    <div className="payouts-table-container">
      <div className="summary-badges">
        <div className="summary-badge">
          <span className="badge-label">Total:</span>
          <span className="badge-value">{payouts.length}</span>
        </div>
        <div className="summary-badge">
          <span className="badge-label">Pending:</span>
          <span className="badge-value badge-pending">{summary?.pending || 0}</span>
        </div>
        <div className="summary-badge">
          <span className="badge-label">Failed:</span>
          <span className="badge-value badge-failed">{summary?.failed || 0}</span>
        </div>
        <div className="summary-badge highlight">
          <span className="badge-label">Total SOL:</span>
          <span className="badge-value">{(summary?.totalSOL || 0).toFixed(6)}</span>
        </div>
      </div>

      <Table
        data={payouts}
        columns={columns}
        searchable={true}
        searchPlaceholder="Search by pubkey..."
        searchKeys={['pubkey']}
        filterable={true}
        filters={[statusFilter]}
        onFilter={(row, filterKey, filterValue) => {
          if (filterKey === 'status') {
            return row.status === filterValue;
          }
          return true;
        }}
        exportable={true}
        exportFilename="pending-payouts"
        exportHeaders={columns.map((col) => col.header)}
        pagination={true}
        pageSize={50}
        loading={loading}
        emptyMessage="No payouts found"
      />
    </div>
  );
}

