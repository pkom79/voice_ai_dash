import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { highLevelService } from '../services/highlevel';
import { adminService } from '../services/admin';
import { Activity, Shield, RefreshCw, Server, AlertCircle, CheckCircle, Users } from 'lucide-react';
import { format } from 'date-fns';

interface SyncStatus {
  service: string;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'failure' | null;
  last_sync_message: string | null;
  records_synced: number;
}

interface SystemHealth {
  totalUsers: number;
  activeUsers: number;
  totalConnections: number;
  activeConnections: number;
  failedSyncs: number;
  lastSync: string | null;
}

export function AdminConfigPage() {
  const [activeTab, setActiveTab] = useState<'health' | 'sync' | 'audit'>('health');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditFilters, setAuditFilters] = useState<{
    action?: string;
    startDate?: string;
    endDate?: string;
  }>({});

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'health') {
        const health = await adminService.getSystemHealth();
        setSystemHealth(health);
      } else if (activeTab === 'sync') {
        const status = await highLevelService.getSyncStatus();
        setSyncStatus(status);
      } else if (activeTab === 'audit') {
        const logs = await adminService.getAuditLogs({
          action: auditFilters.action,
          startDate: auditFilters.startDate ? new Date(auditFilters.startDate) : undefined,
          endDate: auditFilters.endDate ? new Date(auditFilters.endDate) : undefined,
          limit: 100,
        });
        setAuditLogs(logs);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
        <p className="text-gray-600">System settings and sync status</p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('health')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'health'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                System Health
              </div>
            </button>
            <button
              onClick={() => setActiveTab('sync')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sync'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Sync Status
              </div>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'audit'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Audit Logs
              </div>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'health' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health Overview</h2>
                {systemHealth ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Users className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">Total Users</p>
                          <p className="text-2xl font-bold text-gray-900">{systemHealth.totalUsers}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500">
                        {systemHealth.activeUsers} active users
                      </p>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <CheckCircle className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">HL Connections</p>
                          <p className="text-2xl font-bold text-gray-900">{systemHealth.totalConnections}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500">
                        {systemHealth.activeConnections} active connections
                      </p>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`p-2 rounded-lg ${
                          systemHealth.failedSyncs > 0 ? 'bg-red-100' : 'bg-green-100'
                        }`}>
                          {systemHealth.failedSyncs > 0 ? (
                            <AlertCircle className="h-6 w-6 text-red-600" />
                          ) : (
                            <CheckCircle className="h-6 w-6 text-green-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">Sync Status</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {systemHealth.failedSyncs === 0 ? 'Healthy' : `${systemHealth.failedSyncs} Failed`}
                          </p>
                        </div>
                      </div>
                      {systemHealth.lastSync && (
                        <p className="text-sm text-gray-500">
                          Last sync: {format(new Date(systemHealth.lastSync), 'MMM d, h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No system health data available</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Sync Status</h2>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-900">
                    <strong>Note:</strong> OAuth connections are now managed per-user in the Users page.
                    Each user can have their own HighLevel OAuth connection with location-level access.
                  </p>
                </div>
                {syncStatus ? (
                  <div className="border border-gray-200 rounded-lg p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Service</p>
                        <p className="text-lg font-semibold text-gray-900 capitalize">
                          {syncStatus.service}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Status</p>
                        <span
                          className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                            syncStatus.last_sync_status === 'success'
                              ? 'bg-green-100 text-green-800'
                              : syncStatus.last_sync_status === 'failure'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {syncStatus.last_sync_status || 'Never synced'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Last Sync</p>
                        <p className="text-gray-900">
                          {syncStatus.last_sync_at
                            ? format(new Date(syncStatus.last_sync_at), 'MMM d, yyyy h:mm a')
                            : 'Never'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Records Synced</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {syncStatus.records_synced}
                        </p>
                      </div>
                    </div>
                    {syncStatus.last_sync_message && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">{syncStatus.last_sync_message}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No sync data available</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Audit Logs</h2>
                <button
                  onClick={() => loadData()}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                  <select
                    value={auditFilters.action || ''}
                    onChange={(e) => setAuditFilters({ ...auditFilters, action: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">All Actions</option>
                    <option value="create_user">Create User</option>
                    <option value="suspend_user">Suspend User</option>
                    <option value="unsuspend_user">Unsuspend User</option>
                    <option value="invite_user">Invite User</option>
                    <option value="update_billing_model">Update Billing</option>
                    <option value="bulk_assign_agents">Bulk Assign Agents</option>
                    <option value="bulk_assign_phone_numbers">Bulk Assign Phones</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={auditFilters.startDate || ''}
                    onChange={(e) => setAuditFilters({ ...auditFilters, startDate: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={auditFilters.endDate || ''}
                    onChange={(e) => setAuditFilters({ ...auditFilters, endDate: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Admin
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Target User
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                          No audit logs yet
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log: any) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {log.admin
                              ? `${log.admin.first_name} ${log.admin.last_name}`
                              : 'System'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                              {log.action.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {log.target
                              ? `${log.target.first_name} ${log.target.last_name}`
                              : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
