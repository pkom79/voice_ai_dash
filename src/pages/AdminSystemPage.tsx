import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { adminService, UnifiedAuditLog } from '../services/admin';
import { Shield, RefreshCw, Calendar, Search, User, ChevronDown, ChevronRight, X, Link2, CheckCircle2, XCircle, AlertCircle, AlertTriangle, Info, Activity, Unlink, Clock, Filter, Loader2, Wifi, WifiOff, Key, Timer } from 'lucide-react';
import { formatDateEST } from '../utils/formatting';
import DateRangePicker from '../components/DateRangePicker';

// Types for unified audit logs
type AuditSubTab = 'all' | 'connections' | 'errors';
type AuditSource = 'all' | 'manual' | 'auto' | 'github_action';
type EventTypeFilter = 'all' | 'sync' | 'token' | 'admin' | 'activity';

export function AdminSystemPage() {
  const [activeTab, setActiveTab] = useState<'audit' | 'connections'>('connections');
  
  // Unified Audit Logs State
  const [auditLogs, setAuditLogs] = useState<UnifiedAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditSubTab, setAuditSubTab] = useState<AuditSubTab>('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<AuditSource>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [auditFilters, setAuditFilters] = useState<{
    action?: string;
    targetUserId?: string;
    startDate?: Date;
    endDate?: Date;
  }>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Connections State
  const [connections, setConnections] = useState<any[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [connectionSearch, setConnectionSearch] = useState('');

  // Audit Log User Filter State
  const [users, setUsers] = useState<any[]>([]);
  const [auditUserSearch, setAuditUserSearch] = useState('');
  const [showAuditUserDropdown, setShowAuditUserDropdown] = useState(false);
  const auditUserDropdownRef = useRef<HTMLDivElement>(null);

  // Load audit logs with unified data
  const loadAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const endDate = auditFilters.endDate ? new Date(auditFilters.endDate) : undefined;
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
      }

      const result = await adminService.getUnifiedAuditLogs({
        startDate: auditFilters.startDate,
        endDate: endDate,
        limit: 200,
      });
      // Handle both possible return types (array or { logs, counts })
      if (Array.isArray(result)) {
        setAuditLogs(result);
      } else if (result && 'logs' in result) {
        setAuditLogs(result.logs || []);
      } else {
        setAuditLogs([]);
      }
    } catch (error) {
      console.error('Error loading unified audit logs:', error);
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  }, [auditFilters]);

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

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
      if (users.length === 0) loadUsers();
    }
  }, [activeTab, auditFilters, loadAuditLogs]);

  useEffect(() => {
    if (activeTab === 'connections') {
      loadConnections();
    }
  }, [activeTab]);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && activeTab === 'audit') {
      autoRefreshIntervalRef.current = setInterval(() => {
        loadAuditLogs();
      }, 30000); // 30 seconds
    }
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, activeTab, loadAuditLogs]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (auditUserDropdownRef.current && !auditUserDropdownRef.current.contains(event.target as Node)) {
        setShowAuditUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter logs based on sub-tab, search, source, and event type
  const filteredLogs = auditLogs.filter(log => {
    // Sub-tab filter (using category from UnifiedAuditLog)
    if (auditSubTab === 'connections' && log.category !== 'connections') return false;
    if (auditSubTab === 'errors' && log.category !== 'errors') return false;
    
    // Source filter
    if (sourceFilter !== 'all') {
      const logSource = log.source || 'manual';
      if (sourceFilter === 'github_action' && logSource !== 'github_action') return false;
      if (sourceFilter === 'auto' && logSource !== 'auto') return false;
      if (sourceFilter === 'manual' && logSource !== 'manual') return false;
    }
    
    // Event type filter
    if (eventTypeFilter !== 'all') {
      const titleLower = log.title.toLowerCase();
      if (eventTypeFilter === 'sync') {
        if (!titleLower.includes('sync')) return false;
      } else if (eventTypeFilter === 'token') {
        if (!titleLower.includes('token') && !titleLower.includes('refresh') && !titleLower.includes('oauth')) return false;
      } else if (eventTypeFilter === 'admin') {
        if (log.eventType !== 'admin_action') return false;
      } else if (eventTypeFilter === 'activity') {
        if (log.eventType !== 'activity') return false;
      }
    }
    
    // Search filter
    if (auditSearch) {
      const searchLower = auditSearch.toLowerCase();
      const matchesTitle = log.title?.toLowerCase().includes(searchLower);
      const matchesUser = log.user?.name?.toLowerCase().includes(searchLower);
      const matchesDescription = log.description?.toLowerCase().includes(searchLower);
      if (!matchesTitle && !matchesUser && !matchesDescription) return false;
    }
    
    return true;
  });

  // Count logs by category for badges
  const allCount = auditLogs.length;
  const connectionCount = auditLogs.filter(l => l.category === 'connections').length;
  const errorCount = auditLogs.filter(l => l.category === 'errors').length;

  const filteredConnections = connections.filter(c =>
    `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(connectionSearch.toLowerCase())
  );

  // Helper functions for Activity Log-style rendering
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-blue-500 dark:text-blue-400" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const styles: Record<string, string> = {
      critical: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      error: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
      info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[severity] || styles.info}`}>
        {severity.toUpperCase()}
      </span>
    );
  };

  const getConnectionEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'connected':
        return <Wifi className="h-5 w-5 text-green-500" />;
      case 'disconnected':
        return <WifiOff className="h-5 w-5 text-red-500" />;
      case 'token_refreshed':
        return <Key className="h-5 w-5 text-blue-500" />;
      case 'token_expired':
        return <Timer className="h-5 w-5 text-amber-500" />;
      case 'refresh_failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'sync_started':
      case 'sync_completed':
        return <RefreshCw className="h-5 w-5 text-blue-500" />;
      case 'sync_failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'batch_sync_started':
      case 'batch_sync_completed':
        return <Activity className="h-5 w-5 text-purple-500" />;
      default:
        return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  const getConnectionEventBadge = (eventType: string) => {
    const styles: Record<string, string> = {
      connected: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
      disconnected: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      token_refreshed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
      token_expired: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
      refresh_failed: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      sync_started: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
      sync_completed: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
      sync_failed: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      batch_sync_started: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
      batch_sync_completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    };
    const style = styles[eventType] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${style}`}>
        {eventType.replace(/_/g, ' ').toUpperCase()}
      </span>
    );
  };

  const getSourceBadge = (source: string | undefined) => {
    const sourceStyles: Record<string, string> = {
      manual: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
      auto: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
      github_action: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    };
    const sourceLabel = source === 'github_action' ? 'GitHub Action' : source || 'Manual';
    const style = sourceStyles[source || 'manual'] || sourceStyles.manual;
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${style}`}>
        {sourceLabel.toUpperCase()}
      </span>
    );
  };

  const getCategoryBadge = (category: string, eventType: string) => {
    const categoryStyles: Record<string, { label: string; style: string }> = {
      admin: { label: 'Admin', style: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' },
      activity: { label: 'Activity', style: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' },
      connections: { label: 'Connection', style: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
      errors: { label: 'Error', style: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
    };
    // Map eventType to category for display
    let displayCategory = category;
    if (eventType === 'admin_action') displayCategory = 'admin';
    else if (eventType === 'activity') displayCategory = 'activity';
    else if (eventType === 'connection_event') displayCategory = 'connections';
    else if (eventType === 'integration_error') displayCategory = 'errors';
    
    const config = categoryStyles[displayCategory] || { label: 'Unknown', style: 'bg-gray-100 text-gray-600' };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${config.style}`}>
        {config.label}
      </span>
    );
  };

  const renderLogItem = (log: UnifiedAuditLog) => {
    const isExpanded = expandedItems.has(log.id);
    
    // Determine icon based on eventType
    const getIcon = () => {
      if (log.eventType === 'connection_event') {
        return getConnectionEventIcon(log.title);
      }
      if (log.eventType === 'integration_error') {
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      }
      if (log.eventType === 'admin_action') {
        return <Shield className="h-5 w-5 text-indigo-500" />;
      }
      return getSeverityIcon(log.severity || 'info');
    };

    return (
      <div
        key={log.id}
        className={`border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
          isExpanded ? 'bg-gray-50 dark:bg-gray-700/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
        }`}
      >
        <div
          className="flex items-start gap-3 p-4 cursor-pointer"
          onClick={() => toggleExpanded(log.id)}
        >
          <div className="flex-shrink-0 mt-0.5">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )}
          </div>
          
          <div className="flex-shrink-0 mt-0.5">
            {getIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-medium text-gray-900 dark:text-white">
                {log.title}
              </span>
              {getCategoryBadge(log.category, log.eventType)}
              {log.source && getSourceBadge(log.source)}
              {log.severity && log.eventType !== 'connection_event' && getSeverityBadge(log.severity)}
              {log.eventType === 'connection_event' && getConnectionEventBadge(log.title)}
            </div>
            
            {log.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                {log.description}
              </p>
            )}
            
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDateEST(new Date(log.timestamp), 'MMM d, yyyy h:mm:ss a')}
              </span>
              {log.user?.name && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {log.user.name}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {isExpanded && log.metadata && Object.keys(log.metadata).length > 0 && (
          <div className="px-4 pb-4 ml-12">
            <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                Details
              </h4>
              <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

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
              {/* Sub-tabs with count badges */}
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-4">
                <button
                  onClick={() => setAuditSubTab('all')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    auditSubTab === 'all'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  All Activity
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 rounded">
                    {allCount}
                  </span>
                </button>
                <button
                  onClick={() => setAuditSubTab('connections')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    auditSubTab === 'connections'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Connections
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 rounded">
                    {connectionCount}
                  </span>
                </button>
                <button
                  onClick={() => setAuditSubTab('errors')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    auditSubTab === 'errors'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Errors
                  {errorCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300 rounded">
                      {errorCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Filters row */}
              <div className="flex flex-wrap gap-3 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search events, users..."
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Source filter */}
                <div className="min-w-[150px]">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Source</label>
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value as AuditSource)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Sources</option>
                    <option value="manual">Manual</option>
                    <option value="auto">Auto</option>
                    <option value="github_action">GitHub Action</option>
                  </select>
                </div>

                {/* Event Type filter */}
                <div className="min-w-[150px]">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Event Type</label>
                  <select
                    value={eventTypeFilter}
                    onChange={(e) => setEventTypeFilter(e.target.value as EventTypeFilter)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="sync">Sync Events</option>
                    <option value="token">Token/OAuth Events</option>
                    <option value="admin">Admin Actions</option>
                    <option value="activity">User Activity</option>
                  </select>
                </div>

                {/* Date Range */}
                <div className="min-w-[180px]">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date Range</label>
                  <div className="relative">
                    <button
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      <span>
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
                        <div className="relative bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 border border-gray-200 dark:border-gray-700">
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

                {/* Auto-refresh toggle */}
                <div className="flex items-end">
                  <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Auto-refresh
                  </label>
                </div>

                {/* Actions */}
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => {
                      setAuditFilters({});
                      setAuditSearch('');
                      setSourceFilter('all');
                      setEventTypeFilter('all');
                    }}
                    className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => loadAuditLogs()}
                    disabled={loadingAudit}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingAudit ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Logs list */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {loadingAudit ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="ml-2 text-gray-500 dark:text-gray-400">Loading activity logs...</span>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <Activity className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p>No activity logs found matching your filters</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[600px] overflow-y-auto">
                    {filteredLogs.map(log => renderLogItem(log))}
                  </div>
                )}
              </div>

              {/* Footer info */}
              {!loadingAudit && filteredLogs.length > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    Showing {filteredLogs.length} of {auditLogs.length} events
                  </span>
                  {autoRefresh && (
                    <span className="flex items-center gap-1">
                      <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                      Auto-refreshing every 30s
                    </span>
                  )}
                </div>
              )}
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
