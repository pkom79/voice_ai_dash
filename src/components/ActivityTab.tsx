import { useState, useEffect } from 'react';
import { Activity, AlertCircle, Filter, Search, Download, ChevronDown, ChevronUp, X, CheckCircle2, XCircle, AlertTriangle, Info, Link2, Unlink, RefreshCw, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { activityLogger } from '../services/activityLogger';

interface ActivityTabProps {
  userId: string;
}

interface ActivityLog {
  id: string;
  user_id: string;
  event_type: string;
  event_category: string;
  event_name: string;
  description: string;
  metadata: Record<string, any>;
  severity: string;
  created_at: string;
  created_by: string | null;
}

interface ConnectionEvent {
  id: string;
  user_id: string;
  event_type: string;
  location_id: string | null;
  location_name: string | null;
  token_expires_at: string | null;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
  created_by: string | null;
}

interface IntegrationError {
  id: string;
  user_id: string;
  error_type: string;
  error_source: string;
  error_message: string;
  error_code: string | null;
  request_data: Record<string, any>;
  response_data: Record<string, any>;
  stack_trace: string | null;
  retry_count: number;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

type TabView = 'all' | 'connections' | 'errors';
type FilterSeverity = 'all' | 'info' | 'warning' | 'error' | 'critical';

export function ActivityTab({ userId }: ActivityTabProps) {
  const [activeView, setActiveView] = useState<TabView>('all');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [connectionEvents, setConnectionEvents] = useState<ConnectionEvent[]>([]);
  const [integrationErrors, setIntegrationErrors] = useState<IntegrationError[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [includeResolved, setIncludeResolved] = useState(false);

  useEffect(() => {
    loadActivityData();
  }, [userId, includeResolved]);

  const loadActivityData = async () => {
    setLoading(true);
    try {
      const [logs, connections, errors] = await Promise.all([
        activityLogger.getUserActivityLogs(userId, 100),
        activityLogger.getUserConnectionEvents(userId, 100),
        activityLogger.getUserIntegrationErrors(userId, 100, 0, includeResolved),
      ]);

      setActivityLogs(logs);
      setConnectionEvents(connections);
      setIntegrationErrors(errors);
    } catch (error) {
      console.error('Error loading activity data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const handleMarkResolved = async (errorId: string) => {
    const success = await activityLogger.markErrorResolved(errorId);
    if (success) {
      loadActivityData();
    }
  };

  const exportToJSON = () => {
    const exportData = {
      activityLogs,
      connectionEvents,
      integrationErrors,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${userId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const styles = {
      critical: 'bg-red-100 text-red-700',
      error: 'bg-red-50 text-red-600',
      warning: 'bg-yellow-100 text-yellow-700',
      info: 'bg-blue-100 text-blue-700',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase ${styles[severity as keyof typeof styles] || styles.info}`}>
        {severity}
      </span>
    );
  };

  const getConnectionEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'connected':
        return <Link2 className="h-5 w-5 text-green-600" />;
      case 'disconnected':
        return <Unlink className="h-5 w-5 text-red-600" />;
      case 'token_refreshed':
        return <RefreshCw className="h-5 w-5 text-blue-600" />;
      case 'token_expired':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'refresh_failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Activity className="h-5 w-5 text-gray-600" />;
    }
  };

  const getConnectionEventBadge = (eventType: string) => {
    const styles = {
      connected: 'bg-green-100 text-green-700',
      disconnected: 'bg-red-100 text-red-700',
      token_refreshed: 'bg-blue-100 text-blue-700',
      token_expired: 'bg-yellow-100 text-yellow-700',
      refresh_failed: 'bg-red-100 text-red-700',
      connection_attempted: 'bg-gray-100 text-gray-700',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase ${styles[eventType as keyof typeof styles] || 'bg-gray-100 text-gray-700'}`}>
        {eventType.replace('_', ' ')}
      </span>
    );
  };

  const filteredLogs = activityLogs.filter((log) => {
    const matchesSearch = searchQuery === '' ||
      log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.event_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = filterSeverity === 'all' || log.severity === filterSeverity;
    return matchesSearch && matchesSeverity;
  });

  const filteredConnections = connectionEvents.filter((conn) => {
    const matchesSearch = searchQuery === '' ||
      conn.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (conn.location_name && conn.location_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  const filteredErrors = integrationErrors.filter((error) => {
    const matchesSearch = searchQuery === '' ||
      error.error_message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      error.error_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      error.error_source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const renderActivityLog = (log: ActivityLog) => {
    const isExpanded = expandedItems.has(log.id);
    return (
      <div key={log.id} className="border-b border-gray-200 last:border-0">
        <div className="p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-start gap-3">
            {getSeverityIcon(log.severity)}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-gray-900">{log.event_name}</h4>
                {getSeverityBadge(log.severity)}
                <span className="px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-700 rounded uppercase">
                  {log.event_category}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">{log.description}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}</span>
                {Object.keys(log.metadata || {}).length > 0 && (
                  <button
                    onClick={() => toggleExpanded(log.id)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {isExpanded ? 'Hide' : 'View'} Details
                  </button>
                )}
              </div>
              {isExpanded && Object.keys(log.metadata || {}).length > 0 && (
                <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Event Metadata:</p>
                  <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderConnectionEvent = (conn: ConnectionEvent) => {
    const isExpanded = expandedItems.has(conn.id);
    return (
      <div key={conn.id} className="border-b border-gray-200 last:border-0">
        <div className="p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-start gap-3">
            {getConnectionEventIcon(conn.event_type)}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-gray-900">HighLevel Connection Event</h4>
                {getConnectionEventBadge(conn.event_type)}
              </div>
              {conn.location_name && (
                <p className="text-sm text-gray-600 mb-1">Location: {conn.location_name}</p>
              )}
              {conn.error_message && (
                <p className="text-sm text-red-600 mb-1">Error: {conn.error_message}</p>
              )}
              {conn.token_expires_at && (
                <p className="text-sm text-gray-600 mb-1">
                  Token Expires: {format(new Date(conn.token_expires_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{format(new Date(conn.created_at), 'MMM d, yyyy h:mm a')}</span>
                {Object.keys(conn.metadata || {}).length > 0 && (
                  <button
                    onClick={() => toggleExpanded(conn.id)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {isExpanded ? 'Hide' : 'View'} Details
                  </button>
                )}
              </div>
              {isExpanded && Object.keys(conn.metadata || {}).length > 0 && (
                <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Connection Metadata:</p>
                  <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(conn.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderIntegrationError = (error: IntegrationError) => {
    const isExpanded = expandedItems.has(error.id);
    return (
      <div key={error.id} className="border-b border-gray-200 last:border-0">
        <div className="p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-gray-900">{error.error_type.replace(/_/g, ' ').toUpperCase()}</h4>
                {error.resolved ? (
                  <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded uppercase">
                    RESOLVED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded uppercase">
                    UNRESOLVED
                  </span>
                )}
                <span className="px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-700 rounded uppercase">
                  {error.error_source}
                </span>
              </div>
              <p className="text-sm text-red-600 mb-1">{error.error_message}</p>
              {error.error_code && (
                <p className="text-xs text-gray-500 mb-1">Error Code: {error.error_code}</p>
              )}
              {error.retry_count > 0 && (
                <p className="text-xs text-gray-500 mb-1">Retry Attempts: {error.retry_count}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{format(new Date(error.created_at), 'MMM d, yyyy h:mm a')}</span>
                <button
                  onClick={() => toggleExpanded(error.id)}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {isExpanded ? 'Hide' : 'View'} Details
                </button>
                {!error.resolved && (
                  <button
                    onClick={() => handleMarkResolved(error.id)}
                    className="flex items-center gap-1 text-green-600 hover:text-green-700 font-medium"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Resolved
                  </button>
                )}
              </div>
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  {Object.keys(error.request_data || {}).length > 0 && (
                    <div className="p-3 bg-blue-50 rounded border border-blue-200">
                      <p className="text-xs font-semibold text-blue-900 mb-2">Request Data:</p>
                      <pre className="text-xs text-blue-700 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(error.request_data, null, 2)}
                      </pre>
                    </div>
                  )}
                  {Object.keys(error.response_data || {}).length > 0 && (
                    <div className="p-3 bg-red-50 rounded border border-red-200">
                      <p className="text-xs font-semibold text-red-900 mb-2">Response Data:</p>
                      <pre className="text-xs text-red-700 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(error.response_data, null, 2)}
                      </pre>
                    </div>
                  )}
                  {error.stack_trace && (
                    <div className="p-3 bg-gray-50 rounded border border-gray-200">
                      <p className="text-xs font-semibold text-gray-700 mb-2">Stack Trace:</p>
                      <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap font-mono">
                        {error.stack_trace}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Activity Log</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                showFilters
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Filter className="h-4 w-4" />
            </button>
            <button
              onClick={exportToJSON}
              className="px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={loadActivityData}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Severity Filter
                </label>
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value as FilterSeverity)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Severities</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Include Resolved Errors
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeResolved}
                    onChange={(e) => setIncludeResolved(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Show resolved errors</span>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search activity logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('all')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeView === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Activity ({filteredLogs.length})
          </button>
          <button
            onClick={() => setActiveView('connections')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeView === 'connections'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Connections ({filteredConnections.length})
          </button>
          <button
            onClick={() => setActiveView('errors')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeView === 'errors'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Errors ({filteredErrors.filter(e => !e.resolved).length})
          </button>
        </div>
      </div>

      <div className="max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600">Loading activity logs...</p>
          </div>
        ) : (
          <>
            {activeView === 'all' && (
              <>
                {filteredLogs.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p>No activity logs found</p>
                  </div>
                ) : (
                  filteredLogs.map(renderActivityLog)
                )}
              </>
            )}

            {activeView === 'connections' && (
              <>
                {filteredConnections.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <Link2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p>No connection events found</p>
                  </div>
                ) : (
                  filteredConnections.map(renderConnectionEvent)
                )}
              </>
            )}

            {activeView === 'errors' && (
              <>
                {filteredErrors.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <CheckCircle2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p>No integration errors found</p>
                  </div>
                ) : (
                  filteredErrors.map(renderIntegrationError)
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
