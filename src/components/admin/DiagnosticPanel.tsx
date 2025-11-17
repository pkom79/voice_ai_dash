import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertCircle, CheckCircle, Download, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { format } from 'date-fns';

interface DiagnosticPanelProps {
  userId: string;
  userName: string;
}

interface SyncLog {
  id: string;
  sync_started_at: string;
  sync_completed_at: string;
  sync_type: string;
  sync_status: string;
  api_response_summary: any;
  processing_summary: any;
  skipped_calls: any[];
  duration_ms: number;
}

interface DiagnosticResult {
  summary: {
    dateRange: { start: string; end: string };
    highlevelTotal: number;
    databaseTotal: number;
    matching: number;
    missingInDatabase: number;
    extraInDatabase: number;
  };
  missingCalls: any[];
  reasonBreakdown: Record<string, number>;
  agentAnalysis: {
    totalAgentsInCalls: number;
    assignedToUser: number;
    unassignedAgents: Array<{
      highlevelId: string;
      name: string;
      inSystem: boolean;
      callCount: number;
    }>;
  };
}

export function DiagnosticPanel({ userId, userName }: DiagnosticPanelProps) {
  const [recentLogs, setRecentLogs] = useState<SyncLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<SyncLog | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadRecentLogs();
  }, [userId]);

  const loadRecentLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('call_sync_logs')
        .select('*')
        .eq('user_id', userId)
        .order('sync_started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentLogs(data || []);
    } catch (error) {
      console.error('Error loading sync logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const runDiagnostic = async () => {
    setDiagnosticLoading(true);
    setDiagnosticResult(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diagnostic-call-comparison`;

      const body: any = {
        userId,
        includeRawData: false,
      };

      if (startDate) body.startDate = new Date(startDate).toISOString();
      if (endDate) body.endDate = new Date(endDate).toISOString();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Full diagnostic error response:', errorData);
        const errorMessage = errorData.error || 'Diagnostic failed';
        const errorDetails = errorData.details ? `\n\nDetails: ${errorData.details}` : '';
        const errorUrl = errorData.url ? `\n\nURL: ${errorData.url}` : '';
        const errorParams = errorData.params ? `\n\nParams: ${JSON.stringify(errorData.params, null, 2)}` : '';
        throw new Error(errorMessage + errorDetails + errorUrl + errorParams);
      }

      const result = await response.json();
      setDiagnosticResult(result);

      await loadRecentLogs();
    } catch (error) {
      console.error('Diagnostic error:', error);
      alert(`Diagnostic failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const exportLogAsJSON = (log: SyncLog) => {
    const dataStr = JSON.stringify(log, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sync-log-${log.id}.json`;
    link.click();
  };

  const exportDiagnosticAsJSON = () => {
    if (!diagnosticResult) return;
    const dataStr = JSON.stringify(diagnosticResult, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagnostic-${userId}-${Date.now()}.json`;
    link.click();
  };

  const exportMissingCallsCSV = () => {
    if (!diagnosticResult?.missingCalls.length) return;

    const headers = ['Call ID', 'Agent ID', 'Reason', 'From Number', 'To Number', 'Call Date', 'Contact Name'];
    const rows = diagnosticResult.missingCalls.map(call => [
      call.callId,
      call.agentId || '',
      call.reason || '',
      call.fromNumber || '',
      call.toNumber || '',
      call.callDate || '',
      call.contactName || '',
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `missing-calls-${userId}-${Date.now()}.csv`;
    link.click();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'partial':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20';
      case 'partial':
        return 'text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20';
      case 'failed':
        return 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20';
      default:
        return 'text-gray-700 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20';
    }
  };

  const formatReason = (reason: string) => {
    const reasonMap: Record<string, string> = {
      'filtering_or_sync_issue': 'Agent Assigned but Call Not Synced (Potential Sync Bug)',
      'agent_not_assigned_to_user': 'Agent Not Assigned to User',
      'agent_not_in_system': 'Agent Not Found in System',
      'no_agent_id_in_call': 'No Agent ID in Call Data',
      'not_in_hl_response': 'Not in HighLevel Response',
    };
    return reasonMap[reason] || reason.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Call Sync Diagnostics
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {userName}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadRecentLogs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={runDiagnostic}
              disabled={diagnosticLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {diagnosticLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              Run Diagnostic
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Date (optional)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Date (optional)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Clear Dates
            </button>
          </div>
        </div>

        {diagnosticLoading && (
          <div className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Analyzing call data from HighLevel and database...
            </p>
          </div>
        )}

        {diagnosticResult && (
          <div className="space-y-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-3">
                Diagnostic Summary
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {diagnosticResult.summary.highlevelTotal}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">HighLevel Total</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {diagnosticResult.summary.databaseTotal}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Database Total</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {diagnosticResult.summary.matching}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Matching</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {diagnosticResult.summary.missingInDatabase}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Missing in DB</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>Date Range:</strong>{' '}
                  {format(new Date(diagnosticResult.summary.dateRange.start), 'MMM d, yyyy')} -{' '}
                  {format(new Date(diagnosticResult.summary.dateRange.end), 'MMM d, yyyy')}
                </div>
              </div>
            </div>

            {diagnosticResult.missingCalls.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-yellow-900 dark:text-yellow-300">
                    Missing Calls Breakdown
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={exportMissingCallsCSV}
                      className="flex items-center gap-1 px-3 py-1 text-xs bg-white dark:bg-gray-700 border border-yellow-300 dark:border-yellow-600 rounded hover:bg-yellow-50 dark:hover:bg-gray-600"
                    >
                      <Download className="h-3 w-3" />
                      Export CSV
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {Object.entries(diagnosticResult.reasonBreakdown).map(([reason, count]) => (
                    <div key={reason} className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        {formatReason(reason)}:
                      </span>
                      <span className="font-semibold text-yellow-900 dark:text-yellow-300">
                        {count} calls
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diagnosticResult.agentAnalysis.unassignedAgents.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <h4 className="font-semibold text-red-900 dark:text-red-300 mb-3">
                  Unassigned Agents Found in Calls
                </h4>
                <div className="space-y-2">
                  {diagnosticResult.agentAnalysis.unassignedAgents.map((agent) => (
                    <div
                      key={agent.highlevelId}
                      className="flex justify-between items-center text-sm bg-white dark:bg-gray-800 p-2 rounded"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {agent.name}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          ID: {agent.highlevelId}
                          {!agent.inSystem && (
                            <span className="ml-2 text-red-600 dark:text-red-400">
                              (Not in system)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-red-700 dark:text-red-300 font-semibold">
                        {agent.callCount} calls
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={exportDiagnosticAsJSON}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                <Download className="h-4 w-4" />
                Export Full Report (JSON)
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Recent Sync Operations</h4>

        {loading ? (
          <div className="py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : recentLogs.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            No sync operations found
          </div>
        ) : (
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(log.sync_status)}
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {format(new Date(log.sync_started_at), 'MMM d, yyyy h:mm a')} -{' '}
                        <span className="capitalize">{log.sync_type}</span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {log.processing_summary?.saved || 0} saved,{' '}
                        {log.processing_summary?.skipped || 0} skipped
                        {log.duration_ms && ` • ${(log.duration_ms / 1000).toFixed(1)}s`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded uppercase ${getStatusColor(
                        log.sync_status
                      )}`}
                    >
                      {log.sync_status}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportLogAsJSON(log);
                      }}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      title="Export log"
                    >
                      <Download className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                </div>

                {selectedLog?.id === log.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                    {log.api_response_summary && (
                      <div>
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          API Response
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Fetched: {log.api_response_summary.totalFetched || 0} calls,{' '}
                          Pages: {log.api_response_summary.pageCount || 0}
                        </div>
                      </div>
                    )}

                    {log.processing_summary?.skipReasons && (
                      <div>
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Skip Reasons
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {JSON.stringify(log.processing_summary.skipReasons, null, 2)}
                        </div>
                      </div>
                    )}

                    {log.skipped_calls && log.skipped_calls.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Sample Skipped Calls ({log.skipped_calls.length} total)
                        </div>
                        <div className="max-h-40 overflow-y-auto text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                          {JSON.stringify(log.skipped_calls.slice(0, 5), null, 2)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
