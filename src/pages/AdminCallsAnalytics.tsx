import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { highLevelService } from '../services/highlevel';
import {
  Phone,
  TrendingUp,
  Clock,
  DollarSign,
  Search,
  Download,
  RefreshCw,
  Filter,
  FileText,
  StickyNote,
  ChevronDown,
  X,
  Volume2,
  Calendar,
} from 'lucide-react';
import { format, subDays, startOfToday, endOfToday } from 'date-fns';
import { NotificationModal } from '../components/NotificationModal';
import { useNotification } from '../hooks/useNotification';
import DateRangePicker from '../components/DateRangePicker';
import RecordingPlayer from '../components/RecordingPlayer';
import { formatContactName } from '../utils/formatting';

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
  user_id: string;
  message_id: string | null;
  location_id: string | null;
  agent_id: string | null;
  phone_number_id: string | null;
  users?: { first_name: string; last_name: string };
  agents?: { id: string; name: string };
  phone_numbers?: { id: string; phone_number: string };
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
}

interface Agent {
  id: string;
  name: string;
}

interface PhoneNumber {
  id: string;
  phone_number: string;
  label?: string;
}

export function AdminCallsAnalytics() {
  const { notification, showError, hideNotification } = useNotification();
  const [calls, setCalls] = useState<Call[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [allPhoneNumbers, setAllPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [userAgentMap, setUserAgentMap] = useState<Record<string, string[]>>({});
  const [agentPhoneMap, setAgentPhoneMap] = useState<Record<string, string[]>>({});

  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string>('all');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [searchQuery, setSearchQuery] = useState('');
  const today = startOfToday();
  const [startDate, setStartDate] = useState<Date | null>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [endDate, setEndDate] = useState<Date | null>(endOfToday());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [showModal, setShowModal] = useState<'summary' | 'transcript' | 'notes' | 'recording' | null>(null);
  const [billingPlans, setBillingPlans] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterCalls();
  }, [calls, selectedUserId, selectedAgentId, selectedPhoneNumberId, direction, searchQuery, startDate, endDate]);

  useEffect(() => {
    if (selectedUserId !== 'all') {
      setSelectedAgentId('all');
      setSelectedPhoneNumberId('all');
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (selectedAgentId !== 'all') {
      setSelectedPhoneNumberId('all');
    }
  }, [selectedAgentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [callsResult, usersResult, userAgentsResult, agentPhonesResult, billingResult] = await Promise.all([
        supabase
          .from('calls')
          .select(`
            *,
            agents:agent_id(id, name),
            phone_numbers:phone_number_id(id, phone_number)
          `)
          .eq('is_test_call', false)
          .order('call_started_at', { ascending: false }),
        supabase.from('users').select('id, first_name, last_name').eq('role', 'client'),
        supabase.from('user_agents').select('user_id, agent_id'),
        supabase.from('agent_phone_numbers').select('agent_id, phone_number_id'),
        supabase.from('billing_accounts').select('user_id, inbound_plan'),
      ]);

      if (callsResult.data) setCalls(callsResult.data);
      if (usersResult.data) setUsers(usersResult.data);
      if (billingResult.data) {
        const planMap: Record<string, string> = {};
        billingResult.data.forEach((b) => {
          planMap[b.user_id] = b.inbound_plan;
        });
        setBillingPlans(planMap);
      }

      // Get only agents that are assigned to at least one user
      if (userAgentsResult.data) {
        const assignedAgentIds = [...new Set(userAgentsResult.data.map(ua => ua.agent_id))];

        const { data: agentsData } = await supabase
          .from('agents')
          .select('id, name')
          .in('id', assignedAgentIds)
          .eq('is_active', true);

        if (agentsData) setAllAgents(agentsData);
      }

      if (userAgentsResult.data) {
        const map: Record<string, string[]> = {};
        userAgentsResult.data.forEach((ua) => {
          if (!map[ua.user_id]) map[ua.user_id] = [];
          map[ua.user_id].push(ua.agent_id);
        });
        setUserAgentMap(map);
      }

      if (agentPhonesResult.data) {
        const map: Record<string, string[]> = {};
        agentPhonesResult.data.forEach((ap) => {
          if (!map[ap.agent_id]) map[ap.agent_id] = [];
          map[ap.agent_id].push(ap.phone_number_id);
        });
        setAgentPhoneMap(map);
      }

      // Get only phone numbers that are assigned to agents who are assigned to users
      if (userAgentsResult.data && agentPhonesResult.data) {
        const assignedAgentIds = [...new Set(userAgentsResult.data.map(ua => ua.agent_id))];
        const assignedPhoneIds = agentPhonesResult.data
          .filter(ap => assignedAgentIds.includes(ap.agent_id))
          .map(ap => ap.phone_number_id);

        const uniquePhoneIds = [...new Set(assignedPhoneIds)];

        if (uniquePhoneIds.length > 0) {
          const { data: phoneNumbersData } = await supabase
            .from('phone_numbers')
            .select('id, phone_number')
            .in('id', uniquePhoneIds)
            .eq('is_active', true);

          if (phoneNumbersData) setAllPhoneNumbers(phoneNumbersData);
        } else {
          setAllPhoneNumbers([]);
        }
      } else {
        // Fallback: derive numbers from calls if nothing is assigned
        if (callsResult.data && callsResult.data.length > 0) {
          const unique = new Map<string, PhoneNumber>();
          callsResult.data.forEach((c) => {
            [c.from_number, c.to_number].forEach((num) => {
              if (num && !unique.has(num)) {
                unique.set(num, { id: `num:${num}`, phone_number: num, label: num });
              }
            });
          });
          setAllPhoneNumbers(Array.from(unique.values()));
        } else {
          setAllPhoneNumbers([]);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAvailableAgents = () => {
    if (selectedUserId === 'all') {
      return allAgents;
    }
    const agentIds = userAgentMap[selectedUserId] || [];
    return allAgents.filter((agent) => agentIds.includes(agent.id));
  };

  const getAvailablePhoneNumbers = () => {
    if (selectedAgentId === 'all') {
      if (selectedUserId === 'all') {
        return allPhoneNumbers;
      }
      const agentIds = userAgentMap[selectedUserId] || [];
      const phoneIds = agentIds.flatMap((agentId) => agentPhoneMap[agentId] || []);
      return allPhoneNumbers.filter((phone) => phoneIds.includes(phone.id) || phone.id.startsWith('num:'));
    }
    const phoneIds = agentPhoneMap[selectedAgentId] || [];
    return allPhoneNumbers.filter((phone) => phoneIds.includes(phone.id) || phone.id.startsWith('num:'));
  };

  const getUserForAgent = (agentId: string | null) => {
    if (!agentId) return null;
    const userId = Object.keys(userAgentMap).find((uid) => userAgentMap[uid].includes(agentId));
    if (!userId) return null;
    return users.find((u) => u.id === userId);
  };

  const getAgentAndPhoneForCall = (call: Call) => {
    const agentName = call.agents?.name || 'N/A';
    const phoneNumber = call.phone_numbers?.phone_number || 'N/A';
    return { agentName, phoneNumber };
  };

  const filterCalls = () => {
    let filtered = [...calls];

    const hasAssignments = Object.keys(userAgentMap).length > 0;
    if (hasAssignments) {
      // Get all agent IDs that are assigned to any user
      const allAssignedAgentIds = Object.values(userAgentMap).flat();

      // Filter out calls from agents that aren't assigned to any user
      filtered = filtered.filter((call) => {
        if (!call.agent_id) return false;
        return allAssignedAgentIds.includes(call.agent_id);
      });
    }

    if (selectedUserId !== 'all') {
      const allowedAgentIds = userAgentMap[selectedUserId] || [];
      filtered = filtered.filter((call) => call.agent_id && allowedAgentIds.includes(call.agent_id));
    }

    if (selectedAgentId !== 'all') {
      filtered = filtered.filter((call) => call.agent_id === selectedAgentId);
    }

    if (selectedPhoneNumberId !== 'all') {
      if (selectedPhoneNumberId.startsWith('num:')) {
        const num = selectedPhoneNumberId.replace(/^num:/, '');
        filtered = filtered.filter((call) => call.from_number === num || call.to_number === num);
      } else {
        filtered = filtered.filter((call) => call.phone_number_id === selectedPhoneNumberId);
      }
    }

    filtered = filtered.filter((call) => call.direction === direction);

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (call) =>
          call.contact_name?.toLowerCase().includes(query) ||
          call.from_number.includes(query) ||
          call.to_number.includes(query) ||
          call.action_triggered?.toLowerCase().includes(query) ||
          call.transcript?.toLowerCase().includes(query)
      );
    }

    if (startDate && endDate) {
      const endInclusive = new Date(endDate);
      endInclusive.setHours(23, 59, 59, 999);
      filtered = filtered.filter((call) => {
        const callDate = new Date(call.call_started_at);
        return callDate >= startDate && callDate <= endInclusive;
      });
    }

    setFilteredCalls(filtered);
  };

  const calculateMetrics = () => {
    const inbound = filteredCalls.filter((c) => c.direction === 'inbound');
    const outbound = filteredCalls.filter((c) => c.direction === 'outbound');
    const totalDuration = filteredCalls.reduce((sum, c) => sum + c.duration_seconds, 0);
    const actionsTriggered = filteredCalls.filter((c) => c.action_triggered).length;
    const totalCost = filteredCalls.reduce((sum, c) => {
      if (c.display_cost === 'INCLUDED') return sum;
      const userPlan = billingPlans[c.user_id];
      if (userPlan === 'inbound_unlimited') return sum;
      return sum + c.cost;
    }, 0);

    const sentimentCounts = {
      positive: filteredCalls.filter((c) => c.sentiment === 'positive').length,
      neutral: filteredCalls.filter((c) => c.sentiment === 'neutral').length,
      negative: filteredCalls.filter((c) => c.sentiment === 'negative').length,
    };

    const statusCounts = {
      connected: outbound.filter((c) => c.status === 'connected').length,
      voicemail: outbound.filter((c) => c.status === 'voicemail').length,
      'no-answer': outbound.filter((c) => c.status === 'no-answer').length,
      failed: outbound.filter((c) => c.status === 'failed').length,
    };

    return {
      totalCalls: filteredCalls.length,
      inboundCalls: inbound.length,
      outboundCalls: outbound.length,
      actionsTriggered,
      totalDuration,
      avgDuration: filteredCalls.length > 0 ? Math.round(totalDuration / filteredCalls.length) : 0,
      totalCost,
      sentimentCounts,
      statusCounts,
    };
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
      'Sentiment',
      'Cost',
      'User',
      'Agent',
      'Phone Number',
    ];

    const rows = filteredCalls.map((call) => {
      const user = getUserForAgent(call.agent_id);
      const { agentName, phoneNumber } = getAgentAndPhoneForCall(call);
      return [
        format(new Date(call.call_started_at), 'yyyy-MM-dd HH:mm:ss'),
        call.direction.toUpperCase(),
        formatContactName(call.contact_name),
        call.from_number,
        call.to_number,
        formatDuration(call.duration_seconds),
        call.status || 'N/A',
        call.action_triggered || 'None',
        call.sentiment || 'N/A',
        `$${call.cost.toFixed(2)}`,
        user ? `${user.first_name} ${user.last_name}` : 'N/A',
        agentName,
        phoneNumber,
      ];
    });

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-calls-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSaveNotes = async (callId: string, notes: string) => {
    try {
      const { error } = await supabase
        .from('calls')
        .update({ notes, updated_at: new Date().toISOString() })
        .eq('id', callId);

      if (error) throw error;
      await loadData();
      setShowModal(null);
    } catch (error) {
      console.error('Error saving notes:', error);
      showError('Failed to save notes');
    }
  };

  const metrics = calculateMetrics();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Analytics</h1>
          <p className="text-gray-600">Comprehensive call monitoring and analytics</p>
        </div>
        <button
          onClick={() => loadData()}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Global Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        {/* Top Row: Direction Toggle | Date Range */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-4">
          {/* Direction Toggle */}
          <div className="flex">
            <button
              onClick={() => setDirection('inbound')}
              className={`px-6 py-2 rounded-l-lg border transition-colors ${
                direction === 'inbound'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Inbound
            </button>
            <button
              onClick={() => setDirection('outbound')}
              className={`px-6 py-2 rounded-r-lg border-t border-r border-b transition-colors ${
                direction === 'outbound'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Outbound
            </button>
          </div>

          {/* Date Range Picker Button */}
          <button
            onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <Calendar className="h-4 w-4 text-gray-500" />
            <span className="text-gray-700">
              {startDate && endDate
                ? `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`
                : 'Select Date Range'}
            </span>
          </button>
        </div>

        {/* Second Row: User | Agent | Phone Numbers | Search */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* User Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Users</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.first_name} {user.last_name}
                </option>
              ))}
            </select>
          </div>

          {/* Agent Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Agents</option>
              {getAvailableAgents().map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Phone Numbers Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Phone Numbers</label>
            <select
              value={selectedPhoneNumberId}
              onChange={(e) => setSelectedPhoneNumberId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Phone Numbers</option>
              {getAvailablePhoneNumbers().map((phone) => (
                <option key={phone.id} value={phone.id}>
                  {phone.phone_number}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Contact, phone, action..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-600">

          </p>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-500 p-3 rounded-lg">
              <Phone className="h-6 w-6 text-white" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Calls</h3>
          <p className="text-2xl font-bold text-gray-900">{metrics.totalCalls}</p>
          <p className="text-sm text-gray-500 mt-1">
            {metrics.inboundCalls} in / {metrics.outboundCalls} out
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-500 p-3 rounded-lg">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-600 mb-1">Actions Triggered</h3>
          <p className="text-2xl font-bold text-gray-900">{metrics.actionsTriggered}</p>
          <p className="text-sm text-gray-500 mt-1">
            {metrics.totalCalls > 0
              ? `${Math.round((metrics.actionsTriggered / metrics.totalCalls) * 100)}%`
              : '0%'}{' '}
            success rate
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-yellow-500 p-3 rounded-lg">
              <Clock className="h-6 w-6 text-white" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-600 mb-1">Avg Duration</h3>
          <p className="text-2xl font-bold text-gray-900">{formatDuration(metrics.avgDuration)}</p>
          <p className="text-sm text-gray-500 mt-1">Total: {formatDuration(metrics.totalDuration)}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-purple-500 p-3 rounded-lg">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Cost</h3>
          <p className="text-2xl font-bold text-gray-900">${metrics.totalCost.toFixed(2)}</p>
          <p className="text-sm text-gray-500 mt-1">
            Avg: ${metrics.totalCalls > 0 ? (metrics.totalCost / metrics.totalCalls).toFixed(2) : '0.00'}
          </p>
        </div>
      </div>

      {/* Call Details Table (Simplified version - full table would continue here) */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Call Details</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Call ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent & Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Direction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Content
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    No calls found matching your filters
                  </td>
                </tr>
              ) : (
                filteredCalls.slice(0, 50).map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs text-gray-600 font-mono">
                        {call.highlevel_call_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatContactName(call.contact_name)}
                      </div>
                      <div className="text-sm text-gray-500 font-mono">{call.from_number}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(() => {
                        const user = getUserForAgent(call.agent_id);
                        return user ? `${user.first_name} ${user.last_name}` : 'N/A';
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const { agentName, phoneNumber } = getAgentAndPhoneForCall(call);
                        return (
                          <div>
                            <div className="text-sm font-medium text-gray-900">{agentName}</div>
                            <div className="text-sm text-gray-500 font-mono">{phoneNumber}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          call.direction === 'inbound'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {call.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{format(new Date(call.call_started_at), 'MMM d, yyyy')}</div>
                      <div className="text-gray-500">
                        {format(new Date(call.call_started_at), 'h:mm a')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDuration(call.duration_seconds)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(call.display_cost === 'INCLUDED' || billingPlans[call.user_id] === 'inbound_unlimited') ? (
                        <span className="inline-flex px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded uppercase">
                          INCLUDED
                        </span>
                      ) : (
                        `$${call.cost.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {call.summary && (
                          <button
                            onClick={() => {
                              setSelectedCall(call);
                              setShowModal('summary');
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="View Summary"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        )}
                        {call.transcript && (
                          <button
                            onClick={() => {
                              setSelectedCall(call);
                              setShowModal('transcript');
                            }}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                            title="View Transcript"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        )}
                        {(call.recording_url || (call.message_id && call.location_id)) && (
                          <button
                            onClick={() => {
                              setSelectedCall(call);
                              setShowModal('recording');
                            }}
                            className="p-1 text-purple-600 hover:bg-purple-50 rounded"
                            title="Play Recording"
                          >
                            <Volume2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedCall(call);
                            setShowModal('notes');
                          }}
                          className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                          title="Add Notes"
                        >
                          <StickyNote className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Date Range Picker Modal */}
      {showDatePicker && (
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {/* Modals */}
      {showModal && selectedCall && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {showModal === 'summary' && 'Call Summary'}
                {showModal === 'transcript' && 'Call Transcript'}
                {showModal === 'notes' && 'Call Notes'}
                {showModal === 'recording' && 'Call Recording'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(null);
                  setSelectedCall(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              {showModal === 'summary' && <p className="text-gray-700">{selectedCall.summary}</p>}
              {showModal === 'transcript' && (
                <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                  {selectedCall.transcript}
                </pre>
              )}
              {showModal === 'recording' && selectedCall.message_id && selectedCall.location_id && selectedCall.user_id && (
                <RecordingPlayer
                  messageId={selectedCall.message_id}
                  locationId={selectedCall.location_id}
                  userId={selectedCall.user_id}
                  contactName={formatContactName(selectedCall.contact_name)}
                  duration={selectedCall.duration_seconds}
                  callDate={selectedCall.call_started_at}
                />
              )}
              {showModal === 'notes' && (
                <div>
                  <textarea
                    defaultValue={selectedCall.notes || ''}
                    className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Add notes about this call..."
                    id="call-notes"
                  />
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => {
                        const notes = (
                          document.getElementById('call-notes') as HTMLTextAreaElement
                        ).value;
                        handleSaveNotes(selectedCall.id, notes);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Notes
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <NotificationModal
        isOpen={notification.isOpen}
        onClose={hideNotification}
        title={notification.title}
        message={notification.message}
        type={notification.type}
      />
    </div>
  );
}
