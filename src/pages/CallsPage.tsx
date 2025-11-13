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
import { format } from 'date-fns';
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
  message_id: string | null;
  location_id: string | null;
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
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string>('all');
  const [availablePhoneNumbers, setAvailablePhoneNumbers] = useState<Array<{ id: string; phoneNumber: string }>>([]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [showModal, setShowModal] = useState<'summary' | 'transcript' | 'recording' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<keyof Call>('call_started_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadCalls();
    loadAgents();
    if (isAdminView && viewingUserId) {
      loadViewingUserName(viewingUserId);
    }
  }, [viewingUserId]);

  useEffect(() => {
    loadPhoneNumbers();
  }, [selectedAgent, availableAgents, effectiveUserId]);

  useEffect(() => {
    if (lastSyncTime) {
      loadCalls();
    }
  }, [lastSyncTime]);

  useEffect(() => {
    filterCalls();
  }, [calls, direction, searchQuery, selectedAgent, selectedPhoneNumber, dateRange, sortField, sortDirection, availableAgents, availablePhoneNumbers]);

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
        .order('call_started_at', { ascending: false });

      if (error) throw error;
      setCalls(data || []);
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
        // Filter out any null agents and agents with generic names
        agents = (data || [])
          .filter((item: any) => item.agents && !item.agents.name.startsWith('Agent '))
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

  const loadPhoneNumbers = async () => {
    try {
      if (!effectiveUserId) return;

      // Get phone numbers based on selected agent or all assigned agents
      let agentIds: string[] = [];

      if (selectedAgent === 'all') {
        // Get all agents assigned to user
        agentIds = availableAgents.map(agent => agent.id);
      } else {
        // Get only the selected agent
        agentIds = [selectedAgent];
      }

      if (agentIds.length === 0) {
        setAvailablePhoneNumbers([]);
        setSelectedPhoneNumber('all');
        return;
      }

      // Fetch phone numbers linked to these agents
      const { data, error } = await supabase
        .from('agent_phone_numbers')
        .select(`
          phone_numbers:phone_number_id (
            id,
            phone_number
          )
        `)
        .in('agent_id', agentIds);

      if (error) throw error;

      const phoneNumbers = (data || [])
        .filter((item: any) => item.phone_numbers)
        .map((item: any) => ({
          id: item.phone_numbers.phone_number,
          phoneNumber: item.phone_numbers.phone_number
        }))
        .filter((phone, index, self) =>
          index === self.findIndex(p => p.id === phone.id)
        );

      setAvailablePhoneNumbers(phoneNumbers);

      // Reset phone number selection if current selection is not in new list
      if (selectedPhoneNumber !== 'all' && !phoneNumbers.find(p => p.id === selectedPhoneNumber)) {
        setSelectedPhoneNumber('all');
      }
    } catch (error) {
      console.error('Error loading phone numbers:', error);
    }
  };

  const filterCalls = () => {
    let filtered = [...calls];

    filtered = filtered.filter((call) => call.direction === direction);

    if (selectedAgent !== 'all') {
      filtered = filtered.filter((call) => call.agent_id === selectedAgent);
    } else {
      // When "All Agents" is selected, only show calls from assigned agents
      const assignedAgentIds = availableAgents.map(agent => agent.id);
      filtered = filtered.filter((call) => call.agent_id && assignedAgentIds.includes(call.agent_id));
    }

    if (selectedPhoneNumber !== 'all') {
      filtered = filtered.filter(
        (call) => call.from_number === selectedPhoneNumber || call.to_number === selectedPhoneNumber
      );
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
      format(new Date(call.call_started_at), 'yyyy-MM-dd HH:mm:ss'),
      call.direction,
      formatContactName(call.contact_name),
      call.from_number,
      call.to_number,
      formatDuration(call.duration_seconds),
      call.status || 'N/A',
      call.action_triggered || 'None',
      `$${call.cost.toFixed(2)}`,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calls-${format(new Date(), 'yyyy-MM-dd')}.csv`;
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-4">
          {/* Direction Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setDirection('inbound')}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                direction === 'inbound' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              Inbound
            </button>
            <button
              onClick={() => setDirection('outbound')}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                direction === 'outbound' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              Outbound
            </button>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDatePicker(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <span className="text-gray-700 dark:text-gray-300">
                {dateRange.start && dateRange.end
                  ? `${format(dateRange.start, 'MMM d, yyyy')} - ${format(dateRange.end, 'MMM d, yyyy')}`
                  : dateRange.start
                  ? format(dateRange.start, 'MMM d, yyyy')
                  : 'All Time'}
              </span>
            </button>
            {(dateRange.start || dateRange.end) && (
              <button
                onClick={() => setDateRange({ start: null, end: null })}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Clear date filter"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Agent Filter */}
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="w-full sm:w-72 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Agents</option>
            {availableAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>

          {/* Phone Numbers Filter */}
          <select
            value={selectedPhoneNumber}
            onChange={(e) => setSelectedPhoneNumber(e.target.value)}
            className="w-full sm:w-64 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Assigned Phone Numbers</option>
            {availablePhoneNumbers.map((phone) => (
              <option key={phone.id} value={phone.id}>
                {formatPhoneNumber(phone.phoneNumber)}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="w-full sm:flex-1 sm:min-w-[150px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search by contact or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Results Count and Export */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredCalls.length} call{filteredCalls.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Calls Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Agent
                </th>
                <th
                  onClick={() => handleSort('contact_name')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Contact
                </th>
                <th
                  onClick={() => handleSort('from_number')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  From
                </th>
                <th
                  onClick={() => handleSort('call_started_at')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Date & Time
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

                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedCalls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No calls found. Try adjusting your filters or click Sync Now to refresh your data.
                  </td>
                </tr>
              ) : (
                paginatedCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {call.agents?.name || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatContactName(call.contact_name)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-mono">{call.from_number || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {format(new Date(call.call_started_at), 'MMM d, yyyy')}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {format(new Date(call.call_started_at), 'h:mm a')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatDuration(call.duration_seconds)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">
                      ${call.cost.toFixed(2)}
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
                        {(call.message_id && call.location_id) && (
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
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {selectedCall.transcript}
                </pre>
              )}
              {showModal === 'recording' && selectedCall.message_id && selectedCall.location_id && effectiveUserId && (
                <RecordingPlayer
                  messageId={selectedCall.message_id}
                  locationId={selectedCall.location_id}
                  userId={effectiveUserId}
                  contactName={formatContactName(selectedCall.contact_name)}
                  duration={selectedCall.duration_seconds}
                  callDate={selectedCall.call_started_at}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
