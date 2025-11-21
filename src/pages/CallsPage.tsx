import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { supabase } from '../lib/supabase';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  User,
  FileText,
  MessageSquare,
  Calendar,
  Volume2,
} from 'lucide-react';
import { formatDateEST } from '../utils/formatting';
import DateRangePicker from '../components/DateRangePicker';
import RecordingPlayer from '../components/RecordingPlayer';
import { formatContactName, formatPhoneNumber } from '../utils/formatting';

interface Call {
  id: string;
  highlevel_call_id: string;
  direction: 'inbound' | 'outbound';
  contact_name: string | null;
  from_number: string;
  to_number: string;
  status: string | null;
  duration_seconds: number;
  cost: number;
  action_triggered: string | null;
  sentiment: string | null;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  workflow_names: string[];
  notes: string | null;
  tags: string[];
  call_started_at: string;
  agent_id: string | null;
  phone_number_id: string | null;
  message_id: string | null;
  location_id: string | null;
  display_cost?: string | null;
  agents?: {
    name: string;
    highlevel_agent_id: string;
  };
}


export function CallsPage() {
  const { profile } = useAuth();
  const { lastSyncTime } = useSync();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const viewingUserId = searchParams.get('userId');
  const isAdminView = profile?.role === 'admin' && viewingUserId && viewingUserId !== profile.id;
  const effectiveUserId = isAdminView ? viewingUserId : profile?.id;
  const [viewingUserName, setViewingUserName] = useState<string>('');
  const [calls, setCalls] = useState<Call[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [showModal, setShowModal] = useState<'summary' | 'transcript' | 'recording' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<keyof Call>('call_started_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadAgents();
    if (isAdminView && viewingUserId) {
      loadViewingUserName(viewingUserId);
    }
  }, [viewingUserId]);

  useEffect(() => {
    if (availableAgents.length > 0 || profile?.role === 'admin') {
      loadCalls();
    }
  }, [availableAgents, effectiveUserId]);

  useEffect(() => {
    if (lastSyncTime) {
      loadCalls();
    }
  }, [lastSyncTime]);

  useEffect(() => {
    filterCalls();
  }, [calls, direction, searchQuery, selectedAgent, dateRange, sortField, sortDirection, availableAgents]);

  const loadViewingUserName = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('first_name, last_name, business_name')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const name = data.business_name || `${data.first_name} ${data.last_name}`;
        setViewingUserName(name);
      }
    } catch (error) {
      console.error('Error loading user name:', error);
    }
  };

  const loadCalls = async () => {
    setLoading(true);
    try {
      if (!effectiveUserId) {
        setLoading(false);
        return;
      }

      const isViewingOwnCallsAsAdmin = profile?.role === 'admin' && !isAdminView;

      if (isViewingOwnCallsAsAdmin) {
        const { data, error } = await supabase
          .from('calls')
          .select(`
            *,
            agents (
              name,
              highlevel_agent_id
            )
          `)
          .eq('user_id', effectiveUserId)
          .eq('is_test_call', false)
          .not('from_number', 'is', null)
          .neq('from_number', '')
          .order('call_started_at', { ascending: false });

        if (error) throw error;
        setCalls(data || []);
      } else {
        const assignedAgentIds = availableAgents.map(agent => agent.id);

        if (assignedAgentIds.length === 0) {
          setCalls([]);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('calls')
          .select(`
            *,
            agents (
              name,
              highlevel_agent_id
            )
          `)
          .eq('user_id', effectiveUserId)
          .eq('is_test_call', false)
          .not('from_number', 'is', null)
          .neq('from_number', '')
          .in('agent_id', assignedAgentIds)
          .order('call_started_at', { ascending: false });

        if (error) throw error;
        setCalls(data || []);
      }
    } catch (error) {
      console.error('Error loading calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      if (!effectiveUserId) return;

      // Admin viewing their own calls - show all agents
      // Client or admin viewing client's calls - show only assigned agents
      const isViewingOwnCallsAsAdmin = profile?.role === 'admin' && !isAdminView;

      let agents = [];

      if (isViewingOwnCallsAsAdmin) {
        // Admin viewing their own calls - show all agents
        const { data, error } = await supabase
          .from('agents')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        agents = data || [];
      } else {
        // Client or admin viewing client's calls - show only assigned agents
        const { data, error } = await supabase
          .from('user_agents')
          .select(`
            agents:agent_id (
              id,
              name
            )
          `)
          .eq('user_id', effectiveUserId);

        if (error) throw error;

        // Transform the joined data to match the expected format
        // Filter out any null agents
        agents = (data || [])
          .filter((item: any) => item.agents)
          .map((item: any) => ({
            id: item.agents.id,
            name: item.agents.name
          }));
      }

      setAvailableAgents(agents);
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  const filterCalls = () => {
    let filtered = [...calls];

    filtered = filtered.filter((call) => call.direction === direction);

    if (selectedAgent !== 'all') {
      filtered = filtered.filter((call) => call.agent_id === selectedAgent);
    }

    if (dateRange.start) {
      const startDate = new Date(dateRange.start);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(
        (call) => new Date(call.call_started_at) >= startDate
      );
    }

    if (dateRange.end) {
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(
        (call) => new Date(call.call_started_at) <= endDate
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (call) =>
          call.contact_name?.toLowerCase().includes(query) ||
          call.from_number.includes(query) ||
          call.to_number.includes(query)
      );
    }

    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    setFilteredCalls(filtered);
    setCurrentPage(1);
  };

  const exportToCSV = () => {
    const headers = [
      'Date',
      'Direction',
      'Contact',
      'From',
      'To',
      'Duration',
      'Status',
      'Action',
      'Cost',
    ];

    const rows = filteredCalls.map((call) => [
      formatDateEST(new Date(call.call_started_at), 'yyyy-MM-dd HH:mm:ss'),
      call.direction,
      formatContactName(call.contact_name),
      call.from_number,
      call.to_number,
      formatDuration(call.duration_seconds),
      call.status || 'N/A',
      call.action_triggered || 'None',
      call.display_cost === 'INCLUDED' ? 'INCLUDED' : `$${call.cost.toFixed(2)}`,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calls-${formatDateEST(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSort = (field: keyof Call) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };


  const paginatedCalls = filteredCalls.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totalPages = Math.ceil(filteredCalls.length / pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isAdminView && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                  Admin View: {viewingUserName || 'Loading...'}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400">You are viewing this user's call data</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/admin/users')}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Users
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Call Logs</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isAdminView
              ? `Viewing call history for ${viewingUserName || 'user'}`
              : 'View and analyze your call history'}
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export CSV</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-4 space-y-4">
        {/* First Row: Direction Tabs & Date Picker */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setDirection('inbound')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${direction === 'inbound'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
            >
              Inbound
            </button>
            <button
              onClick={() => setDirection('outbound')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${direction === 'outbound'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
            >
              Outbound
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-800"
            >
              <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {dateRange.start && dateRange.end
                  ? `${formatDateEST(dateRange.start, 'MMM d, yyyy')} - ${formatDateEST(dateRange.end, 'MMM d, yyyy')}`
                  : 'Select Date Range'}
              </span>
            </button>
          </div>
        </div>

        {/* Second Row: Agent | Search */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Agent Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full px-3 py-2 h-[42px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Agents</option>
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Contact, phone, action..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Calls Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th
                  onClick={() => handleSort('call_started_at')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Date & Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Direction
                </th>
                <th
                  onClick={() => handleSort('duration_seconds')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Duration
                </th>
                <th
                  onClick={() => handleSort('cost')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Call ID
                </th>
                <th
                  onClick={() => handleSort('contact_name')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Content
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No calls found. Try adjusting your filters or click Sync Now to refresh your data.
                  </td>
                </tr>
              ) : (
                paginatedCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {formatDateEST(new Date(call.call_started_at), 'MMM d, yyyy')}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDateEST(new Date(call.call_started_at), 'h:mm a')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${call.direction === 'inbound'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          }`}
                      >
                        {call.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatDuration(call.duration_seconds)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {call.display_cost === 'INCLUDED' ? (
                        <span className="inline-flex px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded uppercase">
                          INCLUDED
                        </span>
                      ) : (
                        <span className="font-mono text-gray-900 dark:text-gray-100">
                          ${call.cost.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                        {call.highlevel_call_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatContactName(call.contact_name)}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                        {formatPhoneNumber(call.direction === 'inbound' ? call.from_number : call.to_number)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {call.agents?.name || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {call.summary && (
                          <button
                            onClick={() => {
                              setSelectedCall(call);
                              setShowModal('summary');
                            }}
                            className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors group relative"
                            title="Call Summary"
                            aria-label="View call summary"
                          >
                            <FileText className="h-5 w-5" />
                          </button>
                        )}
                        {call.transcript && (
                          <button
                            onClick={() => {
                              setSelectedCall(call);
                              setShowModal('transcript');
                            }}
                            className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors group relative"
                            title="Call Transcript"
                            aria-label="View call transcript"
                          >
                            <MessageSquare className="h-5 w-5" />
                          </button>
                        )}
                        {(call.recording_url || (call.message_id && call.location_id)) && (
                          <button
                            onClick={() => {
                              setSelectedCall(call);
                              setShowModal('recording');
                            }}
                            className="p-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition-colors group relative"
                            title="Call Recording"
                            aria-label="Play call recording"
                          >
                            <Volume2 className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Date Range Picker Modal */}
      {showDatePicker && (
        <DateRangePicker
          startDate={dateRange.start}
          endDate={dateRange.end}
          onDateRangeChange={(start, end) => setDateRange({ start, end })}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {/* Modals */}
      {showModal && selectedCall && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {showModal === 'summary' && 'Call Summary'}
                {showModal === 'transcript' && 'Call Transcript'}
                {showModal === 'recording' && 'Call Recording'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(null);
                  setSelectedCall(null);
                }}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              {showModal === 'summary' && <p className="text-gray-700 dark:text-gray-300">{selectedCall.summary}</p>}
              {showModal === 'transcript' && (
                <div className="space-y-3">
                  {(selectedCall.transcript || '')
                    .split('\n')
                    .map((line, index) => line.trim() ? { line: line.trim(), index } : null)
                    .filter((item): item is { line: string; index: number } => item !== null)
                    .map(({ line, index }) => {
                      const lower = line.toLowerCase();
                      const isBot = lower.startsWith('bot:');
                      const isHuman = lower.startsWith('human:');
                      const content = isBot || isHuman ? line.substring(line.indexOf(':') + 1).trim() : line;

                      return (
                        <div
                          key={index}
                          className={isHuman ? 'flex justify-end' : 'flex justify-start'}
                        >
                          <div
                            className={
                              'max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ' +
                              (isHuman
                                ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
                                : 'bg-[#2563eb] text-white dark:bg-[#2563eb]')
                            }
                          >
                            {content}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
              {showModal === 'recording' && (
                selectedCall.message_id && selectedCall.location_id && effectiveUserId ? (
                  <RecordingPlayer
                    messageId={selectedCall.message_id}
                    locationId={selectedCall.location_id}
                    userId={effectiveUserId}
                    recordingUrl={selectedCall.recording_url}
                    contactName={formatContactName(selectedCall.contact_name)}
                    duration={selectedCall.duration_seconds}
                    callDate={selectedCall.call_started_at}
                  />
                ) : selectedCall.recording_url ? (
                  <RecordingPlayer
                    messageId={selectedCall.message_id || ''}
                    locationId={selectedCall.location_id || ''}
                    userId={effectiveUserId || profile?.id || ''}
                    recordingUrl={selectedCall.recording_url}
                    contactName={formatContactName(selectedCall.contact_name)}
                    duration={selectedCall.duration_seconds}
                    callDate={selectedCall.call_started_at}
                  />
                ) : (
                  <p className="text-sm text-gray-600">
                    Recording details are not available for this call.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
