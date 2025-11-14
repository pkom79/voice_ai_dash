import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, User, Plug2, DollarSign, Phone, Activity, Loader2, Mail, Plus, Trash2, Send, Users, Link, X, AlertTriangle, RefreshCw, Calendar, Filter, Search, Download, TrendingUp, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { NotificationModal } from '../components/NotificationModal';
import { useNotification } from '../hooks/useNotification';
import { useAuth } from '../contexts/AuthContext';
import { oauthService } from '../services/oauth';

interface UserData {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  role: 'client' | 'admin';
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

interface NotificationEmail {
  id: string;
  email: string;
  is_primary: boolean;
  low_balance_enabled: boolean;
  insufficient_balance_enabled: boolean;
  service_interruption_enabled: boolean;
  weekly_summary_enabled: boolean;
  daily_summary_enabled: boolean;
}

interface BillingData {
  inbound_plan: string | null;
  outbound_plan: string | null;
}

type TabType = 'profile' | 'api' | 'billing' | 'call-analytics' | 'activity';

export function UserDetailsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');
  const { user: currentUser } = useAuth();

  const { notification, showError, showSuccess, hideNotification } = useNotification();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [saving, setSaving] = useState(false);
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false);
  const [agentCount, setAgentCount] = useState(0);
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [notificationEmails, setNotificationEmails] = useState<NotificationEmail[]>([]);

  // Form states for Profile tab
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [newEmailAddress, setNewEmailAddress] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState<string | null>(null);
  const [apiConnection, setApiConnection] = useState<any>(null);
  const [assignedAgents, setAssignedAgents] = useState<any[]>([]);
  const [loadingApiData, setLoadingApiData] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showAgentManagementModal, setShowAgentManagementModal] = useState(false);
  const [allAvailableAgents, setAllAvailableAgents] = useState<any[]>([]);
  const [loadingAllAgents, setLoadingAllAgents] = useState(false);
  const [assigningAgents, setAssigningAgents] = useState(false);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [showAddBalanceModal, setShowAddBalanceModal] = useState(false);
  const [showRemoveBalanceModal, setShowRemoveBalanceModal] = useState(false);
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceNote, setBalanceNote] = useState('');
  const [processingBalance, setProcessingBalance] = useState(false);
  const [selectedInboundPlan, setSelectedInboundPlan] = useState<string | null>(null);
  const [selectedOutboundPlan, setSelectedOutboundPlan] = useState<string | null>(null);
  const [inboundRate, setInboundRate] = useState('');
  const [outboundRate, setOutboundRate] = useState('');
  const [savingPlans, setSavingPlans] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [calls, setCalls] = useState<any[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [syncingCalls, setSyncingCalls] = useState(false);
  const [resettingCalls, setResettingCalls] = useState(false);
  const [showResyncModal, setShowResyncModal] = useState(false);
  const [resyncStartDate, setResyncStartDate] = useState('');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!userId) {
      navigate('/admin/users');
      return;
    }
    loadUser();
  }, [userId]);

  useEffect(() => {
    if (activeTab === 'api' && userId) {
      loadApiData();
    }
    if (activeTab === 'billing' && userId) {
      loadBillingData();
    }
    if (activeTab === 'call-analytics' && userId) {
      loadCalls();
    }
  }, [activeTab, userId]);

  useEffect(() => {
    if (showChangePlanModal && billingData) {
      setSelectedInboundPlan(billingData.inbound_plan || null);
      setSelectedOutboundPlan(billingData.outbound_plan || null);
      setInboundRate((billingData.inbound_rate_cents / 100).toFixed(2));
      setOutboundRate((billingData.outbound_rate_cents / 100).toFixed(2));
    }
  }, [showChangePlanModal, billingData]);

  const loadUser = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      setUser(data);
      setFirstName(data.first_name);
      setLastName(data.last_name);
      setBusinessName(data.business_name || '');

      // Load notification emails first to get email
      const { data: emails } = await supabase
        .from('user_notification_emails')
        .select('*')
        .eq('user_id', userId)
        .order('is_primary', { ascending: false });
      setNotificationEmails(emails || []);

      const primaryEmail = emails?.find(e => e.is_primary)?.email || '';
      setEmail(primaryEmail);

      // Load agent count
      const { count } = await supabase
        .from('user_agents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      setAgentCount(count || 0);

      // Load billing data
      const { data: billing } = await supabase
        .from('billing_accounts')
        .select('inbound_plan, outbound_plan')
        .eq('user_id', userId)
        .maybeSingle();
      setBillingData(billing);
    } catch (error) {
      console.error('Error loading user:', error);
      showError('Failed to load user details');
      navigate('/admin/users');
    } finally {
      setLoading(false);
    }
  };

  const loadApiData = async () => {
    if (!userId) return;

    setLoadingApiData(true);
    try {
      // Load HighLevel API connection
      const { data: apiKey } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userId)
        .eq('service', 'highlevel')
        .eq('is_active', true)
        .maybeSingle();

      setApiConnection(apiKey);

      // Load assigned agents (independent of API connection)
      const { data: userAgents, error: agentsError } = await supabase
        .from('user_agents')
        .select(`
          agent_id,
          agents:agent_id (
            id,
            name,
            description,
            is_active,
            inbound_phone_number
          )
        `)
        .eq('user_id', userId);

      if (agentsError) {
        console.error('Error loading assigned agents:', agentsError);
        setAssignedAgents([]);
      } else {
        const agents = userAgents?.map(ua => ua.agents).filter(Boolean) || [];
        setAssignedAgents(agents);
      }
    } catch (error) {
      console.error('Error loading API data:', error);
    } finally {
      setLoadingApiData(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!userId) return;

    setSaving(true);
    try {
      // Update user profile
      const { error: userError } = await supabase
        .from('users')
        .update({
          first_name: firstName,
          last_name: lastName,
          business_name: businessName,
        })
        .eq('id', userId);

      if (userError) throw userError;

      // Update notification preferences for each email
      for (const emailRecord of notificationEmails) {
        const { error: emailError } = await supabase
          .from('user_notification_emails')
          .update({
            low_balance_enabled: emailRecord.low_balance_enabled,
            insufficient_balance_enabled: emailRecord.insufficient_balance_enabled,
            service_interruption_enabled: emailRecord.service_interruption_enabled,
            weekly_summary_enabled: emailRecord.weekly_summary_enabled,
            daily_summary_enabled: emailRecord.daily_summary_enabled,
          })
          .eq('id', emailRecord.id);

        if (emailError) throw emailError;
      }

      await loadUser();
      showSuccess('Profile updated successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      showError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user) return;

    const primaryEmail = notificationEmails.find(e => e.is_primary)?.email || email;
    if (!primaryEmail) {
      showError('No email address found for this user');
      return;
    }

    setSendingPasswordReset(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email: primaryEmail }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send password reset email');
      }

      showSuccess(`Password reset link sent to ${primaryEmail}`);
    } catch (error) {
      console.error('Error sending password reset:', error);
      showError('Failed to send password reset link');
    } finally {
      setSendingPasswordReset(false);
    }
  };

  const handleAddEmail = async () => {
    if (!newEmailAddress || !newEmailAddress.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      showError('Please enter a valid email address');
      return;
    }

    if (notificationEmails.some(e => e.email.toLowerCase() === newEmailAddress.toLowerCase())) {
      showError('This email address is already added');
      return;
    }

    setAddingEmail(true);

    try {
      const { error: insertError } = await supabase
        .from('user_notification_emails')
        .insert({
          user_id: userId,
          email: newEmailAddress,
          is_primary: false,
          low_balance_enabled: true,
          insufficient_balance_enabled: true,
          service_interruption_enabled: true,
          weekly_summary_enabled: true,
          daily_summary_enabled: true,
        });

      if (insertError) throw insertError;

      await loadUser();
      setNewEmailAddress('');
      showSuccess('Email address added successfully');
    } catch (error: any) {
      console.error('Error adding email:', error);
      showError(error.message || 'Failed to add email address');
    } finally {
      setAddingEmail(false);
    }
  };

  const handleRemoveEmail = async (emailId: string) => {
    if (!window.confirm('Are you sure you want to remove this email address?')) {
      return;
    }

    setSaving(true);

    try {
      const { error: deleteError } = await supabase
        .from('user_notification_emails')
        .delete()
        .eq('id', emailId);

      if (deleteError) throw deleteError;

      await loadUser();
      showSuccess('Email address removed successfully');
    } catch (error: any) {
      console.error('Error removing email:', error);
      showError(error.message || 'Failed to remove email address');
    } finally {
      setSaving(false);
    }
  };

  const updateEmailPreference = (emailId: string, field: string, value: boolean) => {
    setNotificationEmails(emails =>
      emails.map(email =>
        email.id === emailId ? { ...email, [field]: value } : email
      )
    );
  };

  const handleSendTestEmail = async (emailAddress: string) => {
    setSendingTestEmail(emailAddress);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-test-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            userId: userId,
            email: emailAddress,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send test email');
      }

      showSuccess(`Test email sent to ${emailAddress}`);
    } catch (err: any) {
      showError(err.message || 'Failed to send test email');
    } finally {
      setSendingTestEmail(null);
    }
  };

  const handleDisconnectHighLevel = async () => {
    if (!apiConnection || !userId) return;

    setDisconnecting(true);
    try {
      // Deactivate the API key
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', apiConnection.id);

      if (error) throw error;

      showSuccess('HighLevel connection disconnected successfully');
      setShowDisconnectModal(false);
      await loadApiData();
    } catch (error: any) {
      console.error('Error disconnecting:', error);
      showError(error.message || 'Failed to disconnect HighLevel');
    } finally {
      setDisconnecting(false);
    }
  };


  const handleConnectHighLevel = async () => {
    if (!userId || !currentUser) {
      showError('Unable to initiate connection');
      return;
    }

    try {
      const authUrl = await oauthService.generateAuthorizationUrl(userId, currentUser.id);
      window.location.href = authUrl;
    } catch (error: any) {
      console.error('Error generating auth URL:', error);
      showError(error.message || 'Failed to initiate HighLevel connection');
    }
  };

  const loadAllAgents = async () => {
    setLoadingAllAgents(true);
    try {
      const { data: agents, error } = await supabase
        .from('agents')
        .select('id, name, description, is_active, inbound_phone_number')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAllAvailableAgents(agents || []);
    } catch (error: any) {
      console.error('Error loading agents:', error);
      showError(error.message || 'Failed to load agents');
    } finally {
      setLoadingAllAgents(false);
    }
  };

  const handleOpenAgentManagement = async () => {
    setShowAgentManagementModal(true);
    await loadAllAgents();
  };

  const handleToggleAgentAssignment = async (agentId: string, isCurrentlyAssigned: boolean) => {
    if (!userId) return;

    try {
      if (isCurrentlyAssigned) {
        const { error } = await supabase
          .from('user_agents')
          .delete()
          .eq('user_id', userId)
          .eq('agent_id', agentId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_agents')
          .insert({
            user_id: userId,
            agent_id: agentId,
          });

        if (error) throw error;
      }

      await loadApiData();
      await loadAllAgents();
    } catch (error: any) {
      console.error('Error toggling agent assignment:', error);
      showError(error.message || 'Failed to update agent assignment');
    }
  };

  const loadBillingData = async () => {
    if (!userId) return;

    setLoadingBilling(true);
    try {
      const { data, error } = await supabase
        .from('billing_accounts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      setBillingData(data);

      await loadTransactions();
    } catch (error: any) {
      console.error('Error loading billing data:', error);
      showError(error.message || 'Failed to load billing data');
    } finally {
      setLoadingBilling(false);
    }
  };

  const loadTransactions = async () => {
    if (!userId) return;

    setLoadingTransactions(true);
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error: any) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const loadCalls = async () => {
    if (!userId) return;

    setLoadingCalls(true);
    try {
      const { data: userAgents } = await supabase
        .from('user_agents')
        .select('agent_id')
        .eq('user_id', userId);

      if (!userAgents || userAgents.length === 0) {
        setCalls([]);
        return;
      }

      const agentIds = userAgents.map(ua => ua.agent_id);

      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .in('agent_id', agentIds)
        .eq('is_test_call', false)
        .order('call_started_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setCalls(data || []);
    } catch (error: any) {
      console.error('Error loading calls:', error);
    } finally {
      setLoadingCalls(false);
    }
  };

  const handleResetCalls = async () => {
    if (!userId) return;

    if (!confirm('Are you sure you want to delete all call data for this user? This action cannot be undone.')) {
      return;
    }

    setResettingCalls(true);
    try {
      const { data: userAgents } = await supabase
        .from('user_agents')
        .select('agent_id')
        .eq('user_id', userId);

      if (!userAgents || userAgents.length === 0) {
        showError('No agents found for this user');
        return;
      }

      const agentIds = userAgents.map(ua => ua.agent_id);

      const { error } = await supabase
        .from('calls')
        .delete()
        .in('agent_id', agentIds);

      if (error) throw error;

      showSuccess('Call data has been reset successfully');
      await loadCalls();
    } catch (error: any) {
      console.error('Error resetting calls:', error);
      showError(error.message || 'Failed to reset call data');
    } finally {
      setResettingCalls(false);
    }
  };

  const handleResyncCalls = async (startDate?: string) => {
    if (!userId) return;

    setSyncingCalls(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-highlevel-calls', {
        body: {
          user_id: userId,
          start_date: startDate || undefined
        }
      });

      if (error) throw error;

      showSuccess('Call sync initiated successfully');
      setShowResyncModal(false);
      setResyncStartDate('');

      setTimeout(() => loadCalls(), 2000);
    } catch (error: any) {
      console.error('Error syncing calls:', error);
      showError(error.message || 'Failed to sync calls');
    } finally {
      setSyncingCalls(false);
    }
  };

  const handleAddBalance = async () => {
    if (!userId || !balanceAmount) return;

    const amountCents = Math.round(parseFloat(balanceAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      showError('Please enter a valid amount');
      return;
    }

    if (!balanceNote.trim()) {
      showError('Please provide a note for this transaction');
      return;
    }

    setProcessingBalance(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id;

      const { data: currentBilling } = await supabase
        .from('billing_accounts')
        .select('wallet_cents')
        .eq('user_id', userId)
        .maybeSingle();

      const balanceBeforeCents = currentBilling?.wallet_cents || 0;
      const newWalletCents = balanceBeforeCents + amountCents;

      const { error: updateError } = await supabase
        .from('billing_accounts')
        .update({ wallet_cents: newWalletCents })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      const { error: transactionError } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          type: 'admin_credit',
          amount_cents: amountCents,
          balance_before_cents: balanceBeforeCents,
          balance_after_cents: newWalletCents,
          reason: balanceNote.trim(),
          admin_id: adminId,
        });

      if (transactionError) throw transactionError;

      showSuccess(`Added $${balanceAmount} to wallet`);
      setBalanceAmount('');
      setBalanceNote('');
      setShowAddBalanceModal(false);
      await loadBillingData();
    } catch (error: any) {
      console.error('Error adding balance:', error);
      showError(error.message || 'Failed to add balance');
    } finally {
      setProcessingBalance(false);
    }
  };

  const handleRemoveBalance = async () => {
    if (!userId || !balanceAmount) return;

    const amountCents = Math.round(parseFloat(balanceAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      showError('Please enter a valid amount');
      return;
    }

    if (!balanceNote.trim()) {
      showError('Please provide a note for this transaction');
      return;
    }

    setProcessingBalance(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id;

      const { data: currentBilling } = await supabase
        .from('billing_accounts')
        .select('wallet_cents')
        .eq('user_id', userId)
        .maybeSingle();

      const balanceBeforeCents = currentBilling?.wallet_cents || 0;
      const newWalletCents = Math.max(0, balanceBeforeCents - amountCents);

      const { error: updateError } = await supabase
        .from('billing_accounts')
        .update({ wallet_cents: newWalletCents })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      const { error: transactionError } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          type: 'admin_debit',
          amount_cents: -amountCents,
          balance_before_cents: balanceBeforeCents,
          balance_after_cents: newWalletCents,
          reason: balanceNote.trim(),
          admin_id: adminId,
        });

      if (transactionError) throw transactionError;

      showSuccess(`Removed $${balanceAmount} from wallet`);
      setBalanceAmount('');
      setBalanceNote('');
      setShowRemoveBalanceModal(false);
      await loadBillingData();
    } catch (error: any) {
      console.error('Error removing balance:', error);
      showError(error.message || 'Failed to remove balance');
    } finally {
      setProcessingBalance(false);
    }
  };

  const handleSavePlans = async () => {
    if (!userId) return;

    const inboundRateCents = Math.round(parseFloat(inboundRate) * 100);
    const outboundRateCents = Math.round(parseFloat(outboundRate) * 100);

    if (selectedInboundPlan === 'inbound_pay_per_use' && (isNaN(inboundRateCents) || inboundRateCents <= 0)) {
      showError('Please enter a valid inbound rate');
      return;
    }

    if (selectedOutboundPlan === 'outbound_pay_per_use' && (isNaN(outboundRateCents) || outboundRateCents <= 0)) {
      showError('Please enter a valid outbound rate');
      return;
    }

    if (!selectedInboundPlan && !selectedOutboundPlan) {
      showError('Please select at least one plan');
      return;
    }

    setSavingPlans(true);
    try {
      const { error } = await supabase
        .from('billing_accounts')
        .update({
          inbound_plan: selectedInboundPlan,
          outbound_plan: selectedOutboundPlan,
          inbound_rate_cents: selectedInboundPlan === 'inbound_pay_per_use' ? inboundRateCents : billingData?.inbound_rate_cents || 0,
          outbound_rate_cents: selectedOutboundPlan === 'outbound_pay_per_use' ? outboundRateCents : billingData?.outbound_rate_cents || 0,
        })
        .eq('user_id', userId);

      if (error) throw error;

      showSuccess('Plans updated successfully');
      setShowChangePlanModal(false);
      await loadBillingData();
    } catch (error: any) {
      console.error('Error saving plans:', error);
      showError(error.message || 'Failed to save plans');
    } finally {
      setSavingPlans(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const apiLabel = 'API';

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'api', label: apiLabel, icon: Plug2 },
    { id: 'billing', label: 'Billing', icon: DollarSign },
    { id: 'call-analytics', label: 'Call Analytics', icon: Phone },
    { id: 'activity', label: 'Activity', icon: Activity },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/admin/users')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to User Management
      </button>

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {user.first_name} {user.last_name}
          </h1>
          <p className="text-gray-600 mt-1">{user.business_name}</p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'profile' && (
          <>
            {/* Profile Settings Section */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Profile Settings</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                      <span className="uppercase font-medium text-gray-700">{user.role}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                      <span className={`font-medium ${user.is_active ? 'text-green-600' : 'text-red-600'}`}>
                        {user.is_active ? 'ACTIVE' : 'SUSPENDED'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
                    <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                      {format(new Date(user.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Login</label>
                    <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                      {user.last_login ? format(new Date(user.last_login), 'MMM d, yyyy h:mm a') : 'Never'}
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Notifications Section */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Notification Emails</h2>
              </div>
              <div className="p-6 space-y-6">
                {/* Add New Email Section */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Add Notification Email</h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        type="email"
                        value={newEmailAddress}
                        onChange={(e) => setNewEmailAddress(e.target.value)}
                        placeholder="email@example.com"
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddEmail}
                      disabled={addingEmail || !newEmailAddress}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {addingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Add
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Add additional email addresses to receive different types of notifications
                  </p>
                </div>

                {/* Notification Emails List */}
                <div className="space-y-4">
                  {notificationEmails.map((emailRecord) => (
                    <div
                      key={emailRecord.id}
                      className="bg-white rounded-lg shadow border border-gray-200 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{emailRecord.email}</span>
                          {emailRecord.is_primary && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSendTestEmail(emailRecord.email)}
                            disabled={sendingTestEmail === emailRecord.email}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                            title="Send test email"
                          >
                            {sendingTestEmail === emailRecord.email ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            {sendingTestEmail === emailRecord.email ? 'Sending...' : 'Test'}
                          </button>
                          {!emailRecord.is_primary ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(emailRecord.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Remove email"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <div className="w-9"></div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 ml-6">
                        {(billingData?.inbound_plan === 'inbound_pay_per_use' || billingData?.outbound_plan === 'outbound_pay_per_use') && (
                          <>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={emailRecord.low_balance_enabled}
                                onChange={(e) => updateEmailPreference(emailRecord.id, 'low_balance_enabled', e.target.checked)}
                                className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <span className="text-sm text-gray-700">Low Balance Alerts</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={emailRecord.insufficient_balance_enabled}
                                onChange={(e) => updateEmailPreference(emailRecord.id, 'insufficient_balance_enabled', e.target.checked)}
                                className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <span className="text-sm text-gray-700">Insufficient Balance Alerts</span>
                            </label>
                          </>
                        )}

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={emailRecord.service_interruption_enabled}
                            onChange={(e) => updateEmailPreference(emailRecord.id, 'service_interruption_enabled', e.target.checked)}
                            className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-sm text-gray-700">Service Interruption Warnings</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={emailRecord.weekly_summary_enabled}
                            onChange={(e) => updateEmailPreference(emailRecord.id, 'weekly_summary_enabled', e.target.checked)}
                            className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-sm text-gray-700">Weekly Summary Reports</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={emailRecord.daily_summary_enabled}
                            onChange={(e) => updateEmailPreference(emailRecord.id, 'daily_summary_enabled', e.target.checked)}
                            className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-sm text-gray-700">Daily Activity Summaries</span>
                        </label>
                      </div>
                    </div>
                  ))}

                  {notificationEmails.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No notification emails configured. Add one above to get started.
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Notifications'
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Security Section */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Security</h2>
              </div>
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-1">Password Reset</h3>
                    <p className="text-sm text-gray-600">
                      Send a password recovery link to{' '}
                      <span className="font-medium text-gray-900">
                        {notificationEmails.find(e => e.is_primary)?.email || email || user.email}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={handleSendPasswordReset}
                    disabled={sendingPasswordReset}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingPasswordReset ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Send Recovery Link
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'api' && (
          <>
            {loadingApiData ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <Loader2 className="h-8 w-8 text-blue-600 mx-auto mb-4 animate-spin" />
                <p className="text-gray-600">Loading API connections...</p>
              </div>
            ) : !apiConnection ? (
              <div className="bg-white rounded-lg shadow p-12">
                <div className="max-w-md mx-auto text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <Plug2 className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Not Connected</h3>
                  <p className="text-gray-600 mb-6">This user is not connected to any accounts yet</p>
                  <button
                    onClick={handleConnectHighLevel}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <Link className="h-5 w-5" />
                    Connect HighLevel
                  </button>
                  <p className="text-xs text-gray-500 mt-4">
                    Additional API integrations will be available here in the future
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: HighLevel Connection Info */}
                <div className="bg-white rounded-lg shadow">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">HighLevel Connected</h3>
                      <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Active
                      </div>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <div className="text-gray-900">
                        {apiConnection.location_name || 'Unknown Location'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location ID
                      </label>
                      <div className="text-sm text-gray-600 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                        {apiConnection.location_id || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Connected Since
                      </label>
                      <div className="text-gray-900">
                        {format(new Date(apiConnection.created_at), 'MMM d, yyyy h:mm a')}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last API Call
                      </label>
                      <div className="text-gray-900">
                        {apiConnection.last_used_at
                          ? format(new Date(apiConnection.last_used_at), 'MMM d, yyyy h:mm a')
                          : 'Never'}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Last time data was synced from HighLevel</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Token Expires
                      </label>
                      <div className="text-gray-900">
                        {apiConnection.token_expires_at
                          ? format(new Date(apiConnection.token_expires_at), 'MMM d, yyyy h:mm a')
                          : 'Unknown'}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {apiConnection.token_expires_at && new Date(apiConnection.token_expires_at) < new Date()
                          ? 'Token expired - will refresh on next use'
                          : 'Automatically refreshes when needed'}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-gray-200">
                      <button
                        onClick={() => setShowDisconnectModal(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                      >
                        <X className="h-4 w-4" />
                        Disconnect HighLevel
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: Assigned Agents */}
                <div className="bg-white rounded-lg shadow">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">Assigned Agents</h3>
                      <div className="text-sm text-gray-600">
                        {assignedAgents.length} {assignedAgents.length === 1 ? 'agent' : 'agents'}
                      </div>
                    </div>
                    <button
                      onClick={handleOpenAgentManagement}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                    >
                      <Users className="h-4 w-4" />
                      Manage Agents
                    </button>
                  </div>
                  <div className="p-6">
                    {assignedAgents.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                        <p>No agents assigned yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {assignedAgents.map((agent) => (
                          <div
                            key={agent.id}
                            className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900">{agent.name}</h4>
                                {agent.description && (
                                  <p className="text-sm text-gray-600 mt-1">{agent.description}</p>
                                )}
                              </div>
                              <div className={`px-2 py-1 rounded text-xs font-medium ${
                                agent.is_active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {agent.is_active ? 'Active' : 'Inactive'}
                              </div>
                            </div>
                            {agent.inbound_phone_number && (
                              <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                                <Phone className="h-4 w-4" />
                                {agent.inbound_phone_number}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6">
            {loadingBilling ? (
              <div className="bg-white rounded-lg shadow p-12 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
            ) : !billingData ? (
              <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p>No billing account found</p>
              </div>
            ) : (
              <>
                {/* Account Status Section */}
                <div className="bg-white rounded-lg shadow">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Account Status</h3>
                  </div>
                  <div className="p-6 grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Accrued Usage Cost
                      </label>
                      <div className="text-2xl font-bold text-gray-900">
                        ${(billingData.month_spent_cents / 100).toFixed(2)}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Total usage charges for current month
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <div className="flex items-center gap-2">
                        {billingData.wallet_cents < billingData.month_spent_cents ? (
                          <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded">
                            Insufficient Balance
                          </span>
                        ) : billingData.grace_until && new Date(billingData.grace_until) > new Date() ? (
                          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-medium rounded">
                            Grace Period
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Plans Section */}
                <div className="bg-white rounded-lg shadow">
                  <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Active Plans</h3>
                    <button
                      onClick={() => setShowChangePlanModal(true)}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Change Plans
                    </button>
                  </div>
                  <div className="p-6 grid md:grid-cols-2 gap-4">
                    {/* Inbound Plan */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900">Inbound Plan</h4>
                        {billingData.inbound_plan && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                            Active
                          </span>
                        )}
                      </div>
                      {billingData.inbound_plan ? (
                        <div className="space-y-2">
                          <div className="text-sm">
                            <span className="text-gray-600">Type: </span>
                            <span className="font-medium text-gray-900">
                              {billingData.inbound_plan === 'inbound_pay_per_use' ? 'Pay Per Use' : 'Unlimited'}
                            </span>
                          </div>
                          {billingData.inbound_plan === 'inbound_pay_per_use' && (
                            <div className="text-sm">
                              <span className="text-gray-600">Rate: </span>
                              <span className="font-medium text-gray-900">
                                ${(billingData.inbound_rate_cents / 100).toFixed(2)}/min
                              </span>
                            </div>
                          )}
                          {billingData.inbound_plan === 'inbound_unlimited' && (
                            <div className="text-sm">
                              <span className="text-gray-600">Subscription: </span>
                              <span className="font-medium text-gray-900">$500/month</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No inbound plan active</p>
                      )}
                    </div>

                    {/* Outbound Plan */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900">Outbound Plan</h4>
                        {billingData.outbound_plan && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                            Active
                          </span>
                        )}
                      </div>
                      {billingData.outbound_plan ? (
                        <div className="space-y-2">
                          <div className="text-sm">
                            <span className="text-gray-600">Type: </span>
                            <span className="font-medium text-gray-900">Pay Per Use</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-gray-600">Rate: </span>
                            <span className="font-medium text-gray-900">
                              ${(billingData.outbound_rate_cents / 100).toFixed(2)}/min
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No outbound plan active</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Wallet Section - Only show if user has PPU plan */}
                {(billingData.inbound_plan === 'inbound_pay_per_use' || billingData.outbound_plan === 'outbound_pay_per_use') && (
                  <div className="bg-white rounded-lg shadow">
                    <div className="p-6 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">Wallet Balance</h3>
                    </div>
                    <div className="p-6">
                      <div className="text-center mb-6">
                        <div className="text-4xl font-bold text-gray-900 mb-2">
                          ${(billingData.wallet_cents / 100).toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-600">
                          Spent this month: ${(billingData.month_spent_cents / 100).toFixed(2)}
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowAddBalanceModal(true)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <DollarSign className="h-4 w-4" />
                          Add Balance
                        </button>
                        <button
                          onClick={() => setShowRemoveBalanceModal(true)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <DollarSign className="h-4 w-4" />
                          Remove Balance
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Transaction History */}
                {(billingData.inbound_plan === 'inbound_pay_per_use' || billingData.outbound_plan === 'outbound_pay_per_use') && (
                  <div className="bg-white rounded-lg shadow">
                    <div className="p-6 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">Transaction History</h3>
                    </div>
                    <div className="overflow-x-auto">
                      {loadingTransactions ? (
                        <div className="p-12 text-center">
                          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto" />
                        </div>
                      ) : transactions.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                          No transactions yet
                        </div>
                      ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Date
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Type
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Reason
                              </th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Amount
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {transactions.map((transaction) => (
                              <tr key={transaction.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {new Date(transaction.created_at).toLocaleDateString()} {new Date(transaction.created_at).toLocaleTimeString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span
                                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                                      transaction.type === 'top_up' || transaction.type === 'admin_credit'
                                        ? 'bg-green-100 text-green-800'
                                        : transaction.type === 'deduction' || transaction.type === 'admin_debit'
                                        ? 'bg-red-100 text-red-800'
                                        : transaction.type === 'refund'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    {transaction.type?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900">
                                  {transaction.reason}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <span
                                    className={`text-sm font-medium ${
                                      transaction.type === 'top_up' || transaction.type === 'admin_credit' || transaction.type === 'refund'
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {transaction.type === 'top_up' || transaction.type === 'admin_credit' || transaction.type === 'refund'
                                      ? '+'
                                      : '-'}
                                    ${(Math.abs(transaction.amount_cents) / 100).toFixed(2)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'call-analytics' && (
          <div className="space-y-6">
            {/* Control Buttons */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleResetCalls}
                  disabled={resettingCalls}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {resettingCalls ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Reset All Call Data
                </button>
                <button
                  onClick={() => setShowResyncModal(true)}
                  disabled={syncingCalls}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {syncingCalls ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Resync from HighLevel
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => setDirection('inbound')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      direction === 'inbound'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Inbound
                  </button>
                  <button
                    onClick={() => setDirection('outbound')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      direction === 'outbound'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Outbound
                  </button>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by contact, number..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Calls Table */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Call History</h3>
              </div>
              <div className="overflow-x-auto">
                {loadingCalls ? (
                  <div className="p-12 text-center">
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto" />
                  </div>
                ) : calls.filter(call =>
                    call.direction === direction &&
                    (searchQuery === '' ||
                      call.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      call.from_number?.includes(searchQuery) ||
                      call.to_number?.includes(searchQuery))
                  ).length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    No {direction} calls found
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date/Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Number
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Duration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {calls
                        .filter(call =>
                          call.direction === direction &&
                          (searchQuery === '' ||
                            call.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            call.from_number?.includes(searchQuery) ||
                            call.to_number?.includes(searchQuery))
                        )
                        .map((call) => (
                          <tr key={call.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {format(new Date(call.call_started_at), 'MMM d, yyyy h:mm a')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {call.contact_name || 'Unknown'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {direction === 'inbound' ? call.from_number : call.to_number}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                call.status === 'completed' ? 'bg-green-100 text-green-800' :
                                call.status === 'missed' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {call.status || 'unknown'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                              ${call.cost.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Calls</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {calls.filter(c => c.direction === direction).length}
                    </p>
                  </div>
                  <Phone className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Duration</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {Math.floor(calls.filter(c => c.direction === direction).reduce((sum, c) => sum + c.duration_seconds, 0) / 60)}m
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Cost</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${calls.filter(c => c.direction === direction).reduce((sum, c) => sum + c.cost, 0).toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-purple-600" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Avg Duration</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {calls.filter(c => c.direction === direction).length > 0
                        ? Math.floor(calls.filter(c => c.direction === direction).reduce((sum, c) => sum + c.duration_seconds, 0) / calls.filter(c => c.direction === direction).length / 60)
                        : 0}m
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-orange-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p>Activity tab content coming soon</p>
          </div>
        )}
      </div>

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Disconnect HighLevel?</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to disconnect this HighLevel connection? This will deactivate the API key and stop syncing data.
              All assigned agents will remain in the system but will no longer sync.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnecting}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnectHighLevel}
                disabled={disconnecting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {disconnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  'Disconnect'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Management Modal */}
      {showAgentManagementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Manage Agent Assignments</h3>
              <button
                onClick={() => setShowAgentManagementModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingAllAgents ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                </div>
              ) : allAvailableAgents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p>No agents available in the system</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {allAvailableAgents.map((agent) => {
                    const isAssigned = assignedAgents.some(a => a.id === agent.id);
                    return (
                      <div
                        key={agent.id}
                        className={`border rounded-lg p-4 transition-all ${
                          isAssigned
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-gray-900 truncate">{agent.name}</h4>
                              {isAssigned && (
                                <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                                  Assigned
                                </span>
                              )}
                            </div>
                            {agent.description && (
                              <p className="text-sm text-gray-600 line-clamp-2">{agent.description}</p>
                            )}
                            {agent.inbound_phone_number && (
                              <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                                <Phone className="h-3 w-3" />
                                {agent.inbound_phone_number}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleToggleAgentAssignment(agent.id, isAssigned)}
                            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
                              isAssigned
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            {isAssigned ? 'Remove' : 'Assign'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowAgentManagementModal(false)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Balance Modal */}
      {showAddBalanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Add Balance</h3>
              <button
                onClick={() => {
                  setShowAddBalanceModal(false);
                  setBalanceAmount('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount to Add ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note (Required)
                </label>
                <textarea
                  value={balanceNote}
                  onChange={(e) => setBalanceNote(e.target.value)}
                  placeholder="Enter reason for adding balance (visible to client)..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <p className="text-sm text-gray-500 mt-2">
                  This note will be visible to the client in their transaction history
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  setShowAddBalanceModal(false);
                  setBalanceAmount('');
                  setBalanceNote('');
                }}
                disabled={processingBalance}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddBalance}
                disabled={processingBalance || !balanceAmount || !balanceNote.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processingBalance ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Balance'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Balance Modal */}
      {showRemoveBalanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Remove Balance</h3>
              <button
                onClick={() => {
                  setShowRemoveBalanceModal(false);
                  setBalanceAmount('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount to Remove ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note (Required)
                </label>
                <textarea
                  value={balanceNote}
                  onChange={(e) => setBalanceNote(e.target.value)}
                  placeholder="Enter reason for removing balance (visible to client)..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <p className="text-sm text-gray-500 mt-2">
                  This note will be visible to the client in their transaction history
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  setShowRemoveBalanceModal(false);
                  setBalanceAmount('');
                  setBalanceNote('');
                }}
                disabled={processingBalance}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveBalance}
                disabled={processingBalance || !balanceAmount || !balanceNote.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processingBalance ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  'Remove Balance'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {showChangePlanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-xl font-semibold text-gray-900">Change Plans</h3>
              <button
                onClick={() => setShowChangePlanModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Inbound Plan Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Inbound Plan
                </label>
                <div className="space-y-3">
                  <div
                    onClick={() => setSelectedInboundPlan('inbound_pay_per_use')}
                    className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedInboundPlan === 'inbound_pay_per_use'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">Inbound Pay Per Use</div>
                        <div className="text-sm text-gray-600 mt-1">Charged per minute for inbound calls</div>
                      </div>
                      {selectedInboundPlan === 'inbound_pay_per_use' && (
                        <div className="flex-shrink-0 ml-3">
                          <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    onClick={() => setSelectedInboundPlan('inbound_unlimited')}
                    className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedInboundPlan === 'inbound_unlimited'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">Inbound Unlimited</div>
                        <div className="text-sm text-gray-600 mt-1">$500/month subscription for unlimited inbound calls</div>
                      </div>
                      {selectedInboundPlan === 'inbound_unlimited' && (
                        <div className="flex-shrink-0 ml-3">
                          <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    onClick={() => setSelectedInboundPlan(null)}
                    className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedInboundPlan === null
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200 hover:border-red-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">No Inbound Plan</div>
                        <div className="text-sm text-gray-600 mt-1">Disable inbound calling</div>
                      </div>
                      {selectedInboundPlan === null && (
                        <div className="flex-shrink-0 ml-3">
                          <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inbound Rate Input */}
                {selectedInboundPlan === 'inbound_pay_per_use' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Inbound Rate ($/minute)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={inboundRate}
                      onChange={(e) => setInboundRate(e.target.value)}
                      placeholder="5.00"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Outbound Plan Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Outbound Plan
                </label>
                <div className="space-y-3">
                  <div
                    onClick={() => setSelectedOutboundPlan('outbound_pay_per_use')}
                    className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedOutboundPlan === 'outbound_pay_per_use'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">Outbound Pay Per Use</div>
                        <div className="text-sm text-gray-600 mt-1">Charged per minute for outbound calls</div>
                      </div>
                      {selectedOutboundPlan === 'outbound_pay_per_use' && (
                        <div className="flex-shrink-0 ml-3">
                          <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    onClick={() => setSelectedOutboundPlan(null)}
                    className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedOutboundPlan === null
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200 hover:border-red-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">No Outbound Plan</div>
                        <div className="text-sm text-gray-600 mt-1">Disable outbound calling</div>
                      </div>
                      {selectedOutboundPlan === null && (
                        <div className="flex-shrink-0 ml-3">
                          <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Outbound Rate Input */}
                {selectedOutboundPlan === 'outbound_pay_per_use' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Outbound Rate ($/minute)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={outboundRate}
                      onChange={(e) => setOutboundRate(e.target.value)}
                      placeholder="5.00"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Plan Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Inbound:</span>
                    <span className="font-medium text-gray-900">
                      {selectedInboundPlan === 'inbound_pay_per_use'
                        ? `Pay Per Use ($${inboundRate}/min)`
                        : selectedInboundPlan === 'inbound_unlimited'
                          ? 'Unlimited ($500/month)'
                          : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Outbound:</span>
                    <span className="font-medium text-gray-900">
                      {selectedOutboundPlan === 'outbound_pay_per_use'
                        ? `Pay Per Use ($${outboundRate}/min)`
                        : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowChangePlanModal(false)}
                disabled={savingPlans}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlans}
                disabled={savingPlans}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingPlans ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resync Modal */}
      {showResyncModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Resync Calls from HighLevel</h3>
              <button
                onClick={() => {
                  setShowResyncModal(false);
                  setResyncStartDate('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                This will fetch call data from HighLevel for this user. You can optionally specify a start date to sync from.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date (optional)
                </label>
                <input
                  type="date"
                  value={resyncStartDate}
                  onChange={(e) => setResyncStartDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to sync all available data
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  setShowResyncModal(false);
                  setResyncStartDate('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResyncCalls(resyncStartDate || undefined)}
                disabled={syncingCalls}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {syncingCalls ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Syncing...
                  </>
                ) : (
                  'Start Resync'
                )}
              </button>
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
