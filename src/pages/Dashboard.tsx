import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { supabase } from '../lib/supabase';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Phone, TrendingUp, Heart, CheckCircle, Clock, DollarSign, User, ArrowLeft, Calendar, X } from 'lucide-react';
import { formatPhoneNumber } from '../utils/formatting';
import DateRangePicker from '../components/DateRangePicker';
import { format } from 'date-fns';
import { FirstLoginBillingModal } from '../components/FirstLoginBillingModal';

export function Dashboard() {
  const { profile, user } = useAuth();
  const { lastSyncTime } = useSync();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const viewingUserId = searchParams.get('userId');
  const isAdminView = profile?.role === 'admin' && viewingUserId && viewingUserId !== profile.id;
  const effectiveUserId = isAdminView ? viewingUserId : profile?.id;
  const [viewingUserName, setViewingUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [stats, setStats] = useState({
    totalCalls: 0,
    inboundCalls: 0,
    outboundCalls: 0,
    totalDuration: 0,
    avgDuration: 0,
    actionsTriggered: 0,
  });
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('inbound');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [availableAgents, setAvailableAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string>('all');
  const [availablePhoneNumbers, setAvailablePhoneNumbers] = useState<Array<{ id: string; phoneNumber: string }>>([]);

  useEffect(() => {
    loadDashboardData();
    loadAgents();
    if (isAdminView && viewingUserId) {
      loadViewingUserName(viewingUserId);
    }
    checkBillingStatus();
  }, [viewingUserId]);

  useEffect(() => {
    loadPhoneNumbers();
  }, [selectedAgent, availableAgents, effectiveUserId]);

  useEffect(() => {
    loadDashboardData();
  }, [direction, dateRange, selectedAgent, selectedPhoneNumber, availableAgents, availablePhoneNumbers]);

  useEffect(() => {
    if (lastSyncTime) {
      loadDashboardData();
    }
  }, [lastSyncTime]);

  const checkBillingStatus = async () => {
    if (isAdminView || !effectiveUserId || profile?.role === 'admin') {
      return;
    }

    try {
      const { data: billingAccount } = await supabase
        .from('billing_accounts')
        .select('stripe_customer_id, billing_plan, wallet_cents')
        .eq('user_id', effectiveUserId)
        .maybeSingle();

      if (!billingAccount) {
        setShowBillingModal(true);
        return;
      }

      if (billingAccount.billing_plan === 'complimentary') {
        return;
      }

      if (!billingAccount.stripe_customer_id) {
        setShowBillingModal(true);
        return;
      }
    } catch (error) {
      console.error('Error checking billing status:', error);
    }
  };

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

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      if (!effectiveUserId) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('calls')
        .select('*')
        .eq('user_id', effectiveUserId)
        .eq('is_test_call', false);

      if (direction !== 'all') {
        query = query.eq('direction', direction);
      }

      if (selectedAgent !== 'all') {
        query = query.eq('agent_id', selectedAgent);
      }

      if (selectedPhoneNumber !== 'all') {
        query = query.or(`from_number.eq.${selectedPhoneNumber},to_number.eq.${selectedPhoneNumber}`);
      }

      if (dateRange.start) {
        const startDate = new Date(dateRange.start);
        startDate.setHours(0, 0, 0, 0);
        query = query.gte('call_started_at', startDate.toISOString());
      }

      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        query = query.lte('call_started_at', endDate.toISOString());
      }

      const { data: calls, error } = await query;

      if (error) throw error;

      if (calls) {
        const assignedAgentIds = availableAgents.map(agent => agent.id);

        let filteredCalls = calls;

        if (availableAgents.length > 0) {
          filteredCalls = selectedAgent === 'all'
            ? calls.filter(call => call.agent_id && assignedAgentIds.includes(call.agent_id))
            : calls;
        }

        const inbound = filteredCalls.filter((c) => c.direction === 'inbound');
        const outbound = filteredCalls.filter((c) => c.direction === 'outbound');
        const totalDuration = filteredCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
        const actionsTriggered = filteredCalls.filter((c) => c.action_triggered).length;

        setStats({
          totalCalls: filteredCalls.length,
          inboundCalls: inbound.length,
          outboundCalls: outbound.length,
          totalDuration,
          avgDuration: filteredCalls.length > 0 ? Math.round(totalDuration / filteredCalls.length) : 0,
          actionsTriggered,
        });
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      if (!effectiveUserId) return;

      const isViewingOwnCallsAsAdmin = profile?.role === 'admin' && !isAdminView;

      let agents = [];

      if (isViewingOwnCallsAsAdmin) {
        const { data, error } = await supabase
          .from('agents')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        agents = data || [];
      } else {
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

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const statCards = [
    {
      name: 'Total Calls',
      value: stats.totalCalls,
      icon: Phone,
      color: 'bg-blue-500',
    },
    {
      name: 'Actions Triggered',
      value: stats.actionsTriggered,
      icon: CheckCircle,
      color: 'bg-green-500',
    },
    {
      name: 'Avg Duration',
      value: formatDuration(stats.avgDuration),
      icon: Clock,
      color: 'bg-yellow-500',
    },
    {
      name: 'Total Duration',
      value: formatDuration(stats.totalDuration),
      icon: TrendingUp,
      color: 'bg-purple-500',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 dark:text-gray-100">
      {isAdminView && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                  Admin View: {viewingUserName || 'Loading...'}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400">You are viewing this user's dashboard</p>
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

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {isAdminView ? `Dashboard for ${viewingUserName || 'User'}` : `Welcome back, ${profile?.first_name}!`}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {isAdminView
            ? `Performance overview for ${viewingUserName || 'this user'}`
            : "Here's your voice AI performance overview"}
        </p>
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
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.name} className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
            <div className="flex items-center mb-4">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{stat.name}</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Call Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Call Distribution</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Inbound</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{stats.inboundCalls}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${stats.totalCalls > 0 ? (stats.inboundCalls / stats.totalCalls) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Outbound</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{stats.outboundCalls}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{
                    width: `${stats.totalCalls > 0 ? (stats.outboundCalls / stats.totalCalls) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
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

      {/* First Login Billing Modal */}
      {showBillingModal && user?.email && (
        <FirstLoginBillingModal
          onClose={() => setShowBillingModal(false)}
          userEmail={user.email}
        />
      )}
    </div>
  );
}
