import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { adminService } from '../services/admin';
import { Shield, RefreshCw, Calendar, Search, User, ChevronDown, ChevronRight, X, Link2, CheckCircle2, XCircle } from 'lucide-react';
import { formatDateEST } from '../utils/formatting';
import DateRangePicker from '../components/DateRangePicker';

export function AdminSystemPage() {
  const [activeTab, setActiveTab] = useState<'audit' | 'connections'>('connections');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [auditFilters, setAuditFilters] = useState<{
    action?: string;
    targetUserId?: string;
    startDate?: Date;
    endDate?: Date;
  }>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Connections State
  const [connections, setConnections] = useState<any[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [connectionSearch, setConnectionSearch] = useState('');

  // Audit Log User Filter State
  const [users, setUsers] = useState<any[]>([]);
  const [auditUserSearch, setAuditUserSearch] = useState('');
  const [showAuditUserDropdown, setShowAuditUserDropdown] = useState(false);
  const auditUserDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
      if (users.length === 0) loadUsers();
    }
  }, [activeTab, auditFilters]);

  useEffect(() => {
    if (activeTab === 'connections') {
      loadConnections();
    }
  }, [activeTab]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (auditUserDropdownRef.current && !auditUserDropdownRef.current.contains(event.target as Node)) {
        setShowAuditUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const loadAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      // Ensure endDate covers the full day
      const endDate = auditFilters.endDate ? new Date(auditFilters.endDate) : undefined;
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
      }

      const logs = await adminService.getAuditLogs({
        action: auditFilters.action,
        targetUserId: auditFilters.targetUserId,
        startDate: auditFilters.startDate,
        endDate: endDate,
        limit: 100,
      });
      setAuditLogs(logs);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoadingAudit(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_user_list');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadConnections = async () => {
    setLoadingConnections(true);
    try {
      const data = await adminService.getConnectionsStatus();
      setConnections(data || []);
    } catch (error) {
      console.error('Error loading connections:', error);
    } finally {
      setLoadingConnections(false);
    }
  };

  const filteredConnections = connections.filter(c =>
    `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(connectionSearch.toLowerCase())
  );

  const filteredAuditUsers = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(auditUserSearch.toLowerCase())
  );

  const selectedAuditUser = users.find(u => u.id === auditFilters.targetUserId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">System</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">System monitoring and diagnostics</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          <nav className="flex -mb-px min-w-max">
            <button
              onClick={() => setActiveTab('connections')}
              className={`px-4 sm:px-6 py-2.5 sm:py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'connections'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Link2 className="h-4 w-4" />
                Connections
              </div>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 sm:px-6 py-2.5 sm:py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'audit'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Shield className="h-4 w-4" />
                Audit Logs
              </div>
            </button>
          </nav>
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Action Type</label>
                  <select
                    value={auditFilters.action || ''}
                    onChange={(e) => setAuditFilters(prev => ({ ...prev, action: e.target.value || undefined }))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Actions</option>
                    <option value="login">Login</option>
                    <option value="logout">Logout</option>
                    <option value="create_user">Create User</option>
                    <option value="update_user">Update User</option>
                    <option value="delete_user">Delete User</option>
                    <option value="invite_user">Invite User</option>
                    <option value="revoke_invitation">Revoke Invitation</option>
                    <option value="impersonate_user">Impersonate User</option>
                    <option value="view_user_details">View User Details</option>
                    <option value="export_data">Export Data</option>
                    <option value="system_config_change">System Config Change</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[200px] relative" ref={auditUserDropdownRef}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Target User</label>
                  <div
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white cursor-pointer flex items-center justify-between"
                    onClick={() => setShowAuditUserDropdown(!showAuditUserDropdown)}
                  >
                    <span className={!selectedAuditUser ? 'text-gray-500' : 'text-gray-900'}>
                      {selectedAuditUser
                        ? `${selectedAuditUser.first_name} ${selectedAuditUser.last_name}`
                        : 'All Users'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </div>

                  {showAuditUserDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                      <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                        <input
                          type="text"
                          className="w-full border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Search users..."
                          value={auditUserSearch}
                          onChange={(e) => setAuditUserSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div
                        className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50 text-gray-900"
                        onClick={() => {
                          setAuditFilters(prev => ({ ...prev, targetUserId: undefined }));
                          setShowAuditUserDropdown(false);
                        }}
                      >
                        All Users
                      </div>
                      {filteredAuditUsers.map((user) => (
                        <div
                          key={user.id}
                          className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50 text-gray-900"
                          onClick={() => {
                            setAuditFilters(prev => ({ ...prev, targetUserId: user.id }));
                            setShowAuditUserDropdown(false);
                          }}
                        >
                          {user.first_name} {user.last_name}
                          <span className="block text-xs text-gray-500">{user.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date Range</label>
                  <div className="relative">
                    <button
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md text-sm bg-white hover:bg-gray-50"
                    >
                      <span className="text-gray-700">
                        {auditFilters.startDate ? (
                          <>
                            {formatDateEST(auditFilters.startDate, 'MMM d')}
                            {auditFilters.endDate ? ` - ${formatDateEST(auditFilters.endDate, 'MMM d')}` : ''}
                          </>
                        ) : (
                          'All Time'
                        )}
                      </span>
                      <Calendar className="h-4 w-4 text-gray-400" />
                    </button>
                    {showDatePicker && (
                      <div className="absolute z-10 mt-1 right-0">
                        <div className="fixed inset-0" onClick={() => setShowDatePicker(false)} />
                        <div className="relative bg-white shadow-lg rounded-lg p-4 border border-gray-200">
                          <DateRangePicker
                            startDate={auditFilters.startDate}
                            endDate={auditFilters.endDate}
                            onChange={(start, end) => {
                              setAuditFilters(prev => ({ ...prev, startDate: start, endDate: end }));
                              if (start && end) setShowDatePicker(false);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setAuditFilters({});
                      setAuditUserSearch('');
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="w-10 px-4 py-3"></th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Admin
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Target User
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {loadingAudit ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                          Loading audit logs...
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                          No audit logs found matching your filters
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log: any) => (
                        <>
                          <tr
                            key={log.id}
                            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${expandedLogId === log.id ? 'bg-gray-50 dark:bg-gray-700/50' : ''}`}
                            onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                          >
                            <td className="px-4 py-4 text-gray-400">
                              {expandedLogId === log.id ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                              {formatDateEST(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                              {log.admin
                                ? `${log.admin.first_name} ${log.admin.last_name}`
                                : 'System'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 uppercase">
                                {log.action.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                              {log.target
                                ? `${log.target.first_name} ${log.target.last_name}`
                                : 'SYSTEM'}
                            </td>
                          </tr>
                          {expandedLogId === log.id && (
                            <tr className="bg-gray-50 dark:bg-gray-700/50">
                              <td colSpan={5} className="px-6 py-4 border-t border-gray-200 dark:border-gray-600">
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  <h4 className="font-medium mb-2">Action Details</h4>
                                  <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                                    {JSON.stringify(log.details || {}, null, 2)}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'connections' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative max-w-md w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={connectionSearch}
                    onChange={(e) => setConnectionSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <button
                  onClick={() => loadConnections()}
                  className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingConnections ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        User Account
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        HL Connection
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        HL Token Health
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {loadingConnections ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                          Loading connections...
                        </td>
                      </tr>
                    ) : filteredConnections.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      filteredConnections.map((conn: any) => {
                        const isConnected = conn.has_connection;
                        const isTokenHealthy = conn.token_status === 'valid';

                        return (
                          <tr key={conn.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium mr-3">
                                  {conn.first_name[0]}{conn.last_name[0]}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {conn.first_name} {conn.last_name}
                                  </div>
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {conn.email}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="flex justify-center">
                                {isConnected ? (
                                  <div className="h-4 w-4 rounded-full bg-green-500 shadow-sm" title="Connected & Active" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full bg-red-500 shadow-sm" title="Disconnected or Inactive" />
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="flex justify-center">
                                {isTokenHealthy ? (
                                  <div className="h-4 w-4 rounded-full bg-green-500 shadow-sm" title="Token Valid" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full bg-red-500 shadow-sm" title="Token Expired or Missing" />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
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
