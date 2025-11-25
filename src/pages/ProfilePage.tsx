import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { User, Building, Phone, Mail, Bell, Lock, Save, Plus, Trash2, Check, Send, Loader2 } from 'lucide-react';

export function ProfilePage() {
  const { profile, user, updatePassword } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security'>('profile');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const isAdmin = profile?.role === 'admin';
  const [didSeedAdminEmail, setDidSeedAdminEmail] = useState(false);
  const [billingPlan, setBillingPlan] = useState<{ inbound_plan: string | null; outbound_plan: string | null } | null>(null);
  const [notificationEmails, setNotificationEmails] = useState<Array<{
    id: string;
    email: string;
    is_primary: boolean;
    low_balance_enabled: boolean;
    insufficient_balance_enabled: boolean;
    service_interruption_enabled: boolean;
    weekly_summary_enabled: boolean;
    daily_summary_enabled: boolean;
    admin_user_accepted_invite?: boolean;
    admin_token_expired?: boolean;
    admin_hl_disconnected?: boolean;
    admin_payment_failed?: boolean;
  }>>([]);
  const [newEmailAddress, setNewEmailAddress] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState<string | null>(null);
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false);

  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    business_name: '',
    phone_number: '',
  });

  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;

    setError('');
    setSuccess('');
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
          body: JSON.stringify({ email: user.email }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send password reset email');
      }

      setSuccess(`Password reset link sent to ${user.email}`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      console.error('Error sending password reset:', err);
      setError(err.message || 'Failed to send password reset link');
      setTimeout(() => setError(''), 5000);
    } finally {
      setSendingPasswordReset(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setProfileData({
        first_name: profile.first_name,
        last_name: profile.last_name,
        business_name: profile.business_name || '',
        phone_number: profile.phone_number || '',
      });

      if (profile.role !== 'admin') {
        loadBillingPlan();
      }

      loadNotificationEmails();
    }
  }, [profile]);

  const loadBillingPlan = async () => {
    try {
      const { data, error } = await supabase
        .from('billing_accounts')
        .select('inbound_plan, outbound_plan')
        .eq('user_id', profile?.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setBillingPlan(data);
      }
    } catch (err) {
      console.error('Error loading billing plan:', err);
    }
  };

  const loadNotificationEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('user_notification_emails')
        .select('*')
        .eq('user_id', profile?.id)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      const rows = data || [];

      // Auto-create a primary admin notification email if missing
      if (isAdmin && rows.length === 0 && user?.email && !didSeedAdminEmail) {
        setDidSeedAdminEmail(true);
        const insertPayload: Record<string, any> = {
          user_id: profile?.id,
          email: user.email,
          is_primary: true,
          low_balance_enabled: false,
          insufficient_balance_enabled: false,
          service_interruption_enabled: false,
          weekly_summary_enabled: false,
          daily_summary_enabled: false,
          admin_user_accepted_invite: true,
          admin_token_expired: true,
          admin_hl_disconnected: true,
          admin_payment_failed: true,
        };
        const { error: insertError } = await supabase
          .from('user_notification_emails')
          .insert(insertPayload);
        if (insertError) {
          console.error('Error seeding admin notification email:', insertError);
        } else {
          const { data: seededEmails } = await supabase
            .from('user_notification_emails')
            .select('*')
            .eq('user_id', profile?.id)
            .order('is_primary', { ascending: false });
          setNotificationEmails(seededEmails || []);
          return;
        }
      }

      setNotificationEmails(rows);
    } catch (err) {
      console.error('Error loading notification emails:', err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({
          first_name: profileData.first_name,
          last_name: profileData.last_name,
          business_name: profileData.business_name || null,
          phone_number: profileData.phone_number || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile?.id);

      if (updateError) throw updateError;

      setSuccess('Profile updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      for (const email of notificationEmails) {
        const updatePayload: Record<string, any> = {
          low_balance_enabled: email.low_balance_enabled,
          insufficient_balance_enabled: email.insufficient_balance_enabled,
          service_interruption_enabled: email.service_interruption_enabled,
          weekly_summary_enabled: email.weekly_summary_enabled,
          daily_summary_enabled: email.daily_summary_enabled,
        };

        if (isAdmin) {
          updatePayload.admin_user_accepted_invite = !!email.admin_user_accepted_invite;
          updatePayload.admin_token_expired = !!email.admin_token_expired;
          updatePayload.admin_hl_disconnected = !!email.admin_hl_disconnected;
          updatePayload.admin_payment_failed = !!email.admin_payment_failed;
        }

        const { error: updateError } = await supabase
          .from('user_notification_emails')
          .update(updatePayload)
          .eq('id', email.id);

        if (updateError) throw updateError;
      }

      setSuccess('Notification preferences updated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmail = async () => {
    if (!newEmailAddress || !newEmailAddress.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError('Please enter a valid email address');
      return;
    }

    if (notificationEmails.some(e => e.email.toLowerCase() === newEmailAddress.toLowerCase())) {
      setError('This email address is already added');
      return;
    }

    setAddingEmail(true);
    setError('');

    try {
      const insertPayload: Record<string, any> = {
        user_id: profile?.id,
        email: newEmailAddress,
        is_primary: false,
        low_balance_enabled: !isAdmin,
        insufficient_balance_enabled: !isAdmin,
        service_interruption_enabled: !isAdmin,
        weekly_summary_enabled: !isAdmin,
        daily_summary_enabled: !isAdmin,
      };

      if (isAdmin) {
        insertPayload.admin_user_accepted_invite = true;
        insertPayload.admin_token_expired = true;
        insertPayload.admin_hl_disconnected = true;
        insertPayload.admin_payment_failed = true;
      }

      const { error: insertError } = await supabase
        .from('user_notification_emails')
        .insert(insertPayload);

      if (insertError) throw insertError;

      await loadNotificationEmails();
      setNewEmailAddress('');
      setSuccess('Email address added successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add email address');
    } finally {
      setAddingEmail(false);
    }
  };

  const handleRemoveEmail = async (emailId: string) => {
    if (!window.confirm('Are you sure you want to remove this email address?')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: deleteError } = await supabase
        .from('user_notification_emails')
        .delete()
        .eq('id', emailId);

      if (deleteError) throw deleteError;

      await loadNotificationEmails();
      setSuccess('Email address removed successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to remove email address');
    } finally {
      setLoading(false);
    }
  };

  const updateEmailPreference = (emailId: string, field: string, value: boolean) => {
    setNotificationEmails(emails =>
      emails.map(email =>
        email.id === emailId ? { ...email, [field]: value } : email
      )
    );
  };

  const hasPPUPlan = billingPlan && (billingPlan.inbound_plan === 'inbound_pay_per_use' || billingPlan.outbound_plan === 'outbound_pay_per_use');

  const handleSendTestEmail = async (emailAddress: string) => {
    setSendingTestEmail(emailAddress);
    setError('');
    setSuccess('');

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
            userId: profile?.id,
            email: emailAddress,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send test email');
      }

      setSuccess(`Test email sent to ${emailAddress}`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to send test email');
      setTimeout(() => setError(''), 5000);
    } finally {
      setSendingTestEmail(null);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await updatePassword(passwordData.newPassword);
      setSuccess('Password updated successfully');
      setPasswordData({ newPassword: '', confirmPassword: '' });
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your account information and preferences</p>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'profile'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile
              </div>
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'notifications'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                {isAdmin ? 'Admin Notifications' : 'Notifications'}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'security'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Security
              </div>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {success && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    First Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={profileData.first_name}
                      onChange={(e) =>
                        setProfileData({ ...profileData, first_name: e.target.value })
                      }
                      required
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Last Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={profileData.last_name}
                      onChange={(e) =>
                        setProfileData({ ...profileData, last_name: e.target.value })
                      }
                      required
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Business Name
                </label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    value={profileData.business_name}
                    onChange={(e) =>
                      setProfileData({ ...profileData, business_name: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
                  />
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Email cannot be changed</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                  <input
                    type="tel"
                    value={profileData.phone_number}
                    onChange={(e) =>
                      setProfileData({ ...profileData, phone_number: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleUpdateNotifications} className="space-y-6">
              <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                    {isAdmin ? 'Admin notification emails' : 'Add Notification Email'}
                  </h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        type="email"
                        value={newEmailAddress}
                        onChange={(e) => setNewEmailAddress(e.target.value)}
                        placeholder="email@example.com"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddEmail}
                      disabled={addingEmail || !newEmailAddress}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Add additional email addresses to receive {isAdmin ? 'admin system' : 'account'} alerts.
                  </p>
                </div>

                <div className="space-y-4">
                  {notificationEmails.map((email) => (
                    <div
                      key={email.id}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4"
                    >
                      {/* Email header - stacks on mobile */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                          <span className="font-medium text-gray-900 dark:text-white truncate">{email.email}</span>
                          {email.is_primary && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full flex-shrink-0">
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSendTestEmail(email.email)}
                            disabled={sendingTestEmail === email.email}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                            title="Send test email"
                          >
                            <Send className="h-3.5 w-3.5" />
                            {sendingTestEmail === email.email ? 'Sending...' : 'Test'}
                          </button>
                          {!email.is_primary ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(email.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
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
                        {isAdmin ? (
                          <>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!email.admin_user_accepted_invite}
                                onChange={(e) => updateEmailPreference(email.id, 'admin_user_accepted_invite', e.target.checked)}
                                className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">User accepted invite</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!email.admin_token_expired}
                                onChange={(e) => updateEmailPreference(email.id, 'admin_token_expired', e.target.checked)}
                                className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">Token expired</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!email.admin_hl_disconnected}
                                onChange={(e) => updateEmailPreference(email.id, 'admin_hl_disconnected', e.target.checked)}
                                className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">HL disconnected</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!email.admin_payment_failed}
                                onChange={(e) => updateEmailPreference(email.id, 'admin_payment_failed', e.target.checked)}
                                className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">Payment failed</span>
                            </label>
                          </>
                        ) : (
                          <>
                            {hasPPUPlan && (
                              <>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={email.low_balance_enabled}
                                    onChange={(e) => updateEmailPreference(email.id, 'low_balance_enabled', e.target.checked)}
                                    className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                                  />
                                  <span className="text-sm text-gray-700 dark:text-gray-300">Low Balance Alerts</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={email.insufficient_balance_enabled}
                                    onChange={(e) => updateEmailPreference(email.id, 'insufficient_balance_enabled', e.target.checked)}
                                    className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                                  />
                                  <span className="text-sm text-gray-700 dark:text-gray-300">Insufficient Balance Alerts</span>
                                </label>
                              </>
                            )}

                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={email.service_interruption_enabled}
                                onChange={(e) => updateEmailPreference(email.id, 'service_interruption_enabled', e.target.checked)}
                                className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">Service Interruption Warnings</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={email.weekly_summary_enabled}
                                onChange={(e) => updateEmailPreference(email.id, 'weekly_summary_enabled', e.target.checked)}
                                className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">Weekly Summary Reports</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={email.daily_summary_enabled}
                                onChange={(e) => updateEmailPreference(email.id, 'daily_summary_enabled', e.target.checked)}
                                className="h-4 w-4 text-blue-600 bg-white focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">Daily Activity Summaries</span>
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {notificationEmails.length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No notification emails configured. Add one above to get started.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {loading ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </form>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-8">
              <form onSubmit={handleUpdatePassword} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, newPassword: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter new password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Confirm new password"
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-300">
                    Password must be at least 6 characters long
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <Lock className="h-4 w-4" />
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">Password Reset</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Send a password recovery link to{' '}
                      <span className="font-medium text-gray-900 dark:text-white">{user?.email}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendPasswordReset}
                    disabled={sendingPasswordReset || !user?.email}
                    className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start sm:self-auto shrink-0"
                  >
                    {sendingPasswordReset ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        <span className="hidden sm:inline">Send Recovery</span> Link
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
