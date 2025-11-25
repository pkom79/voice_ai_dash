import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { supabase } from '../lib/supabase';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Phone, TrendingUp, Heart, CheckCircle, Clock, DollarSign, User, ArrowLeft, Calendar, X, Search } from 'lucide-react';
import DateRangePicker from '../components/DateRangePicker';
import { formatDateEST } from '../utils/formatting';
import { FirstLoginBillingModal } from '../components/FirstLoginBillingModal';
import { getSupabaseFunctionUrl } from '../utils/supabaseFunctions';

export function Dashboard() {
  const { profile, user, isImpersonating } = useAuth();
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
    totalCost: 0,
  });
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('inbound');
  // Default to Month to Date
  const getMonthStart = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  };
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: getMonthStart(),
    end: new Date()
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableAgents, setAvailableAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [billingInfo, setBillingInfo] = useState<{
    inbound_plan: string | null;
    outbound_plan: string | null;
    stripe_customer_id: string | null;
    wallet_cents: number | null;
  } | null>(null);

  useEffect(() => {
    loadDashboardData();
    loadAgents();
    if (isAdminView && viewingUserId) {
      loadViewingUserName(viewingUserId);
    }
    checkBillingStatus();
  }, [viewingUserId]);

  // Ensure billing check runs once the profile/effective user ID is available (first login scenario)
  useEffect(() => {
    if (!profile?.id) return;
    checkBillingStatus();
  }, [profile?.id, viewingUserId]);

  useEffect(() => {
    loadDashboardData();
  }, [direction, dateRange, selectedAgent, availableAgents, searchQuery]);

  useEffect(() => {
    if (lastSyncTime) {
      loadDashboardData();
    }
  }, [lastSyncTime]);

  // Close billing modal if we stop impersonating or become admin
  useEffect(() => {
    if (profile?.role === 'admin' && !isImpersonating) {
      setShowBillingModal(false);
    }
  }, [profile, isImpersonating]);

  const checkBillingStatus = async () => {
    if (isAdminView || !effectiveUserId || profile?.role === 'admin') {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data: billingAccount } = await supabase
        .from('billing_accounts')
        .select('stripe_customer_id, inbound_plan, outbound_plan, wallet_cents, first_login_billing_completed')
        .eq('user_id', effectiveUserId)
        .maybeSingle();

      if (!billingAccount) {
        setBillingInfo(null);
        return;
      }

      setBillingInfo({
        inbound_plan: billingAccount.inbound_plan,
        outbound_plan: billingAccount.outbound_plan,
        stripe_customer_id: billingAccount.stripe_customer_id,
        wallet_cents: billingAccount.wallet_cents,
      });

      const walletBalance = billingAccount.wallet_cents || 0;
      const hasInboundPPU = billingAccount.inbound_plan === 'inbound_pay_per_use';
      const hasOutboundPPU = billingAccount.outbound_plan === 'outbound_pay_per_use';
      const hasInboundUnlimited = billingAccount.inbound_plan === 'inbound_unlimited';
      const hasPaymentProfile = !!billingAccount.stripe_customer_id || walletBalance >= 5000;

      const hasAnyPaymentRecord = async (): Promise<boolean> => {
        const [{ data: walletData }, { data: invoiceData }] = await Promise.all([
          supabase
            .from('wallet_transactions')
            .select('id')
            .eq('user_id', effectiveUserId)
            .limit(1),
          supabase
            .from('billing_invoices')
            .select('id')
            .eq('user_id', effectiveUserId)
            .limit(1),
        ]);

        if ((walletData && walletData.length > 0) || (invoiceData && invoiceData.length > 0)) {
          return true;
        }

        if (billingAccount.stripe_customer_id && session?.access_token) {
          try {
            const paymentResponse = await fetch(getSupabaseFunctionUrl('stripe-list-payments'), {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ userId: effectiveUserId, limit: 5 }),
            });

            if (paymentResponse.ok) {
              const paymentResult = await paymentResponse.json();
              return Array.isArray(paymentResult.payments)
                && paymentResult.payments.some(
                  (p: any) => p.status === 'succeeded' && (p.amount_received || p.amount) > 0
                );
            }
          } catch (err) {
            console.error('Failed to verify Stripe payments:', err);
          }
        }

        return false;
      };

      if (!billingAccount.first_login_billing_completed && (await hasAnyPaymentRecord())) {
        await supabase
          .from('billing_accounts')
          .update({ first_login_billing_completed: true })
          .eq('user_id', effectiveUserId);
        setShowBillingModal(false);
        return;
      }

      if (billingAccount.first_login_billing_completed) {
        setShowBillingModal(false);
        return;
      }

      const needsWalletTopup = (hasInboundPPU || hasOutboundPPU) && walletBalance < 5000;
      const needsSubscription = hasInboundUnlimited && !billingAccount.stripe_customer_id;

      const shouldShowModal = (needsWalletTopup || needsSubscription) && !hasPaymentProfile;
      setShowBillingModal(shouldShowModal);
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

        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filteredCalls = filteredCalls.filter(
            (call) =>
              call.contact_name?.toLowerCase().includes(query) ||
              call.from_number?.includes(query) ||
              call.to_number?.includes(query)
          );
        }

        const inbound = filteredCalls.filter((c) => c.direction === 'inbound');
        const outbound = filteredCalls.filter((c) => c.direction === 'outbound');
        const totalDuration = filteredCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
        // Calculate total cost (exclude INCLUDED calls)
        const totalCost = filteredCalls
          .filter((c) => c.display_cost !== 'INCLUDED')
          .reduce((sum, c) => sum + (c.cost || 0), 0);

        setStats({
          totalCalls: filteredCalls.length,
          inboundCalls: inbound.length,
          outboundCalls: outbound.length,
          totalDuration,
          avgDuration: filteredCalls.length > 0 ? Math.round(totalDuration / filteredCalls.length) : 0,
          totalCost,
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

  const isInboundUnlimitedOnly = billingInfo?.inbound_plan === 'inbound_unlimited' && !billingInfo?.outbound_plan;
  const totalCostLabel = isInboundUnlimitedOnly ? 'N/A' : `$${stats.totalCost.toFixed(2)}`;

  const statCards = [
    {
      name: 'Total Calls',
      value: stats.totalCalls,
      icon: Phone,
      color: 'bg-blue-500',
    },
    {
      name: 'Total Cost',
      value: totalCostLabel,
      icon: DollarSign,
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
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:py-2 text-sm bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors self-start sm:self-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Users
            </button>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          {isAdminView ? `Dashboard for ${viewingUserName || 'User'}` : `Welcome back, ${profile?.first_name}!`}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {isAdminView
            ? `Performance overview for ${viewingUserName || 'this user'}`
            : "Here's your voice AI performance overview"}
        </p>
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.name} className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
            <div className="flex items-center mb-4">
              <div className={`${stat.color} p-3 rounded-lg hidden sm:block`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{stat.name}</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
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
