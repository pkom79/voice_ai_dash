import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { highLevelService } from '../services/highlevel';
import { adminService } from '../services/admin';
import { Activity, Shield, RefreshCw, Server, AlertCircle, CheckCircle, Users, Clock, XCircle } from 'lucide-react';
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
  const [oauthConnections, setOAuthConnections] = useState<any[]>([]);
  const [connectionFilter, setConnectionFilter] = useState<'all' | 'active' | 'expired' | 'errors'>('all');
  const [loading, setLoading] = useState(true);
  const [auditFilters, setAuditFilters] = useState<{
    action?: string;
    startDate?: string;
    endDate?: string;
  }>({});

  useEffect(() => {
    loadData();
  }, [activeTab, connectionFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'health') {
        const health = await adminService.getSystemHealth();
        setSystemHealth(health);
      } else if (activeTab === 'sync') {
        const connections = await adminService.getOAuthConnections(connectionFilter);
        setOAuthConnections(connections);
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
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">OAuth Connections</h2>
                <div className="flex items-center gap-3">
                  <select
                    value={connectionFilter}
                    onChange={(e) => setConnectionFilter(e.target.value as any)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Connections</option>
                    <option value="active">Active Only</option>
                    <option value="expired">Expired Only</option>
                    <option value="errors">Error Status</option>
                  </select>
                  <button
                    onClick={() => loadData()}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  Monitor all client OAuth connections to HighLevel. Each connection is managed per-user with location-level access.
                </p>
              </div>

              {loading ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-spin" />
                  <p className="text-gray-600">Loading connections...</p>
                </div>
              ) : oauthConnections.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No OAuth connections found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          User / Business
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Location
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Connected
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Token Expires
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Last Refresh
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {oauthConnections.map((conn: any) => (
                        <tr key={conn.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {conn.users.first_name} {conn.users.last_name}
                              </div>
                              {conn.users.business_name && (
                                <div className="text-sm text-gray-500">{conn.users.business_name}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {conn.location_name || conn.location_id || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {conn.status === 'healthy' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded uppercase">
                                <CheckCircle className="h-3 w-3" />
                                HEALTHY
                              </span>
                            )}
                            {conn.status === 'expiring_soon' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold bg-yellow-100 text-yellow-700 rounded uppercase">
                                <Clock className="h-3 w-3" />
                                EXPIRING SOON
                              </span>
                            )}
                            {conn.status === 'expired' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded uppercase">
                                <AlertCircle className="h-3 w-3" />
                                EXPIRED
                              </span>
                            )}
                            {conn.status === 'inactive' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-700 rounded uppercase">
                                <XCircle className="h-3 w-3" />
                                INACTIVE
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(new Date(conn.created_at), 'MMM d, yyyy')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {conn.token_expires_at
                              ? format(new Date(conn.token_expires_at), 'MMM d, yyyy h:mm a')
                              : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {conn.updated_at
                              ? format(new Date(conn.updated_at), 'MMM d, yyyy h:mm a')
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                            <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 uppercase">
                              {log.action.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {log.target
                              ? `${log.target.first_name} ${log.target.last_name}`
                              : 'SYSTEM'}
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
