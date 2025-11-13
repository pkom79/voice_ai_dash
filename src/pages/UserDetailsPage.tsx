import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, User, Plug2, DollarSign, Phone, Activity, Loader2, Mail, Plus, Trash2, Send, Users, Link, X, AlertTriangle } from 'lucide-react';
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
  const [unassigningAgent, setUnassigningAgent] = useState<string | null>(null);

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
  }, [activeTab, userId]);

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

      // If connected, load assigned agents
      if (apiKey) {
        const { data: userAgents } = await supabase
          .from('user_agents')
          .select(`
            agent_id,
            agents (
              id,
              name,
              description,
              is_active,
              inbound_phone_number,
              agent_phone_numbers (
                phone_number_id,
                phone_numbers (
                  number,
                  friendly_name
                )
              )
            )
          `)
          .eq('user_id', userId);

        const agents = userAgents?.map(ua => ua.agents).filter(Boolean) || [];
        setAssignedAgents(agents);
      } else {
        setAssignedAgents([]);
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

  const handleUnassignAgent = async (agentId: string) => {
    if (!userId) return;

    setUnassigningAgent(agentId);
    try {
      // Remove from user_agents junction table
      const { error } = await supabase
        .from('user_agents')
        .delete()
        .eq('user_id', userId)
        .eq('agent_id', agentId);

      if (error) throw error;

      showSuccess('Agent unassigned successfully');
      await loadApiData();
    } catch (error: any) {
      console.error('Error unassigning agent:', error);
      showError(error.message || 'Failed to unassign agent');
    } finally {
      setUnassigningAgent(null);
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
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Assigned Agents</h3>
                      <div className="text-sm text-gray-600">
                        {assignedAgents.length} {assignedAgents.length === 1 ? 'agent' : 'agents'}
                      </div>
                    </div>
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
                            {agent.agent_phone_numbers && agent.agent_phone_numbers.length > 0 && (
                              <div className="mt-2 text-xs text-gray-500">
                                {agent.agent_phone_numbers.length} phone {agent.agent_phone_numbers.length === 1 ? 'number' : 'numbers'} assigned
                              </div>
                            )}
                            <button
                              onClick={() => handleUnassignAgent(agent.id)}
                              disabled={unassigningAgent === agent.id}
                              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {unassigningAgent === agent.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Unassigning...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-4 w-4" />
                                  Unassign Agent
                                </>
                              )}
                            </button>
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
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p>Billing tab content coming soon</p>
          </div>
        )}

        {activeTab === 'call-analytics' && (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p>Call Analytics tab content coming soon</p>
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
