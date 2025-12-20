import { useMemo } from 'react';
import { StatCard } from '../components/StatCard';
import { GlassCard } from '../components/GlassCard';
import { Table, type TableColumn } from '../components/Table';
import './SystemStatusPage.css';

export interface SystemStatusData {
  component: string;
  status: string;
  statusIndicator: string;
}

export function SystemStatusPage() {
  // Placeholder system status data
  const systemStatusData: SystemStatusData[] = useMemo(() => {
    return [
      {
        component: 'Distribution engine',
        status: 'Online',
        statusIndicator: '🟢',
      },
      {
        component: 'Harvesting engine',
        status: 'Online',
        statusIndicator: '🟢',
      },
    ];
  }, []);

  // Calculate stats
  const distributionEngineStatus = 'Online';
  const harvestingEngineStatus = 'Online';
  const errors = 'None';
  const lastUpdate = new Date().toISOString().split('T')[0]; // Today's date in YYYY-MM-DD format

  // Table columns
  const columns: TableColumn<SystemStatusData>[] = useMemo(() => [
    {
      key: 'component',
      header: 'SYSTEM COMPONENT',
      accessor: (row) => row.component,
      sortable: true,
      sortFn: (a, b) => a.component.localeCompare(b.component),
    },
    {
      key: 'status',
      header: 'STATUS',
      accessor: (row) => row.status,
      sortable: true,
      sortFn: (a, b) => a.status.localeCompare(b.status),
    },
    {
      key: 'statusIndicator',
      header: '',
      accessor: (row) => <span className="status-indicator">{row.statusIndicator}</span>,
      sortable: false,
    },
  ], []);

  return (
    <div className="system-status-page">
      {/* System Status Section */}
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">System Status</h2>
          <p className="section-subtitle">Live operational status of distribution, harvesting, and core protocol processes.</p>
          
          {/* Stats Summary */}
          <div className="system-status-stats">
            <StatCard
              label="Distribution engine"
              value={distributionEngineStatus}
            />
            <StatCard
              label="Harvesting engine"
              value={harvestingEngineStatus}
            />
            <StatCard
              label="Errors"
              value={errors}
            />
            <StatCard
              label="Last Update"
              value={lastUpdate}
            />
          </div>

          {/* System Status Table */}
          <div className="system-status-table-container">
            <Table
              data={systemStatusData}
              columns={columns}
              searchable={false}
              pagination={false}
              exportable={false}
              loading={false}
              emptyMessage="No system status data available"
            />
          </div>
        </GlassCard>
      </section>
    </div>
  );
}

