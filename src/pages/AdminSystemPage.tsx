import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { adminService } from '../services/admin';
import { Shield, RefreshCw, Calendar, Search, User, ChevronDown, ChevronRight, X, Link2, CheckCircle2, XCircle } from 'lucide-react';
import { formatDateEST } from '../utils/formatting';
import DateRangePicker from '../components/DateRangePicker';

export function AdminSystemPage() {
  const [activeTab, setActiveTab] = useState<'audit' | 'connections'>('audit');
  
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
      const { data, error } = await supabase.rpc('get_admin_connections_status');
      
      if (error) throw error;
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
        <h1 className="text-2xl font-bold text-gray-900">System</h1>
        <p className="text-gray-600">System monitoring and diagnostics</p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'audit'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Audit Logs
              </div>
            </button>
            <button
              onClick={() => setActiveTab('connections')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'connections'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Connections
              </div>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Date Range Picker Button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors bg-white text-sm"
                    >
                      <Calendar className="h-4 w-4 text-gray-600" />
                      <span className="text-gray-700">
                        {auditFilters.startDate && auditFilters.endDate
                          ? `${formatDateEST(auditFilters.startDate, 'MMM d, yyyy')} - ${formatDateEST(auditFilters.endDate, 'MMM d, yyyy')}`
                          : 'Select Date Range'}
                      </span>
                    </button>
                    {showDatePicker && (
                      <DateRangePicker
                        startDate={auditFilters.startDate || null}
                        endDate={auditFilters.endDate || null}
                        onDateRangeChange={(start, end) => {
                          setAuditFilters(prev => ({ ...prev, startDate: start || undefined, endDate: end || undefined }));
                          setShowDatePicker(false);
                        }}
                        onClose={() => setShowDatePicker(false)}
                      />
                    )}
                  </div>

                  {/* Action Filter */}
                  <select
                    value={auditFilters.action || ''}
                    onChange={(e) => setAuditFilters({ ...auditFilters, action: e.target.value || undefined })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">All Actions</option>
                    <option value="create_user">Create User</option>
                    <option value="suspend_user">Suspend User</option>
                    <option value="unsuspend_user">Unsuspend User</option>
                    <option value="invite_user">Invite User</option>
                    <option value="update_billing_model">Update Billing</option>
                    <option value="assign_agent">Assign Agent</option>
                    <option value="unassign_agent">Unassign Agent</option>
                    <option value="update_user_profile">Update User Profile</option>
                    <option value="reset_password">Reset Password</option>
                    <option value="delete_user">Delete User</option>
                    <option value="update_subscription">Update Subscription</option>
                    <option value="wallet_adjustment">Wallet Adjustment</option>
                    <option value="oauth_connected">OAuth Connected</option>
                    <option value="oauth_disconnected">OAuth Disconnected</option>
                  </select>

                  {/* Target User Filter */}
                  <div className="relative" ref={auditUserDropdownRef}>
                    <div 
                      className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer min-w-[200px]"
                      onClick={() => setShowAuditUserDropdown(!showAuditUserDropdown)}
                    >
                      <User className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-700 flex-1 truncate">
                        {selectedAuditUser 
                          ? `${selectedAuditUser.first_name} ${selectedAuditUser.last_name}` 
                          : 'All Users'}
                      </span>
                      {selectedAuditUser ? (
                        <X 
                          className="h-4 w-4 text-gray-400 hover:text-gray-600" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setAuditFilters(prev => ({ ...prev, targetUserId: undefined }));
                          }}
                        />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    
                    {showAuditUserDropdown && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden flex flex-col">
                        <div className="p-2 border-b border-gray-200">
                          <input
                            type="text"
                            placeholder="Search users..."
                            value={auditUserSearch}
                            onChange={(e) => setAuditUserSearch(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="overflow-y-auto flex-1">
                          <div 
                            className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
                            onClick={() => {
                              setAuditFilters(prev => ({ ...prev, targetUserId: undefined }));
                              setShowAuditUserDropdown(false);
                            }}
                          >
                            All Users
                          </div>
                          {filteredAuditUsers.map(user => (
                            <div
                              key={user.id}
                              className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
                              onClick={() => {
                                setAuditFilters(prev => ({ ...prev, targetUserId: user.id }));
                                setShowAuditUserDropdown(false);
                              }}
                            >
                              {user.first_name} {user.last_name}
                            </div>
                          ))}
                          {filteredAuditUsers.length === 0 && (
                            <div className="px-4 py-2 text-sm text-gray-500 text-center">No users found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => loadAuditLogs()}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingAudit ? 'animate-spin' : ''}`} />
                  Refresh Data
                </button>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-8 px-4 py-3"></th>
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
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {loadingAudit ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                          Loading audit logs...
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                          No audit logs found matching your filters
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log: any) => (
                        <>
                          <tr 
                            key={log.id} 
                            className={`hover:bg-gray-50 cursor-pointer ${expandedLogId === log.id ? 'bg-gray-50' : ''}`}
                            onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                          >
                            <td className="px-4 py-4 text-gray-400">
                              {expandedLogId === log.id ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDateEST(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
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
                          {expandedLogId === log.id && (
                            <tr className="bg-gray-50">
                              <td colSpan={5} className="px-6 py-4 border-t border-gray-200">
                                <div className="text-sm text-gray-700">
                                  <h4 className="font-medium mb-2">Action Details</h4>
                                  <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-xs font-mono">
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
              <div className="flex items-center justify-between">
                <div className="relative max-w-md w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={connectionSearch}
                    onChange={(e) => setConnectionSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={() => loadConnections()}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingConnections ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        User Account
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        HL Connection
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        HL Token Health
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {loadingConnections ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-500">
                          Loading connections...
                        </td>
                      </tr>
                    ) : filteredConnections.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-500">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      filteredConnections.map((conn: any) => {
                        const isConnected = !!conn.connection_id && conn.is_active;
                        const isTokenHealthy = isConnected && conn.token_expires_at && new Date(conn.token_expires_at) > new Date();
                        
                        return (
                          <tr key={conn.user_id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium mr-3">
                                  {conn.first_name[0]}{conn.last_name[0]}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {conn.first_name} {conn.last_name}
                                  </div>
                                  <div className="text-sm text-gray-500">
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
