import { useState, useEffect } from 'react';
import { X, Loader2, DollarSign, Plus, Minus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminService } from '../../services/admin';
import { useAuth } from '../../contexts/AuthContext';

interface BillingConfigModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface BillingAccount {
  billing_plan: 'pay_per_use' | 'unlimited' | 'complimentary';
  wallet_cents: number;
  rate_per_minute_cents: number;
  admin_notes: string | null;
}

export function BillingConfigModal({
  userId,
  userName,
  onClose,
  onSuccess,
}: BillingConfigModalProps) {
  const [billing, setBilling] = useState<BillingAccount | null>(null);
  const [billingPlan, setBillingPlan] = useState<'pay_per_use' | 'unlimited' | 'complimentary'>('pay_per_use');
  const [ratePerMinuteCents, setRatePerMinuteCents] = useState('500');
  const [adminNotes, setAdminNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWalletAdjust, setShowWalletAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');
  const { profile } = useAuth();

  useEffect(() => {
    loadBilling();
  }, [userId]);

  const loadBilling = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('billing_accounts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setBilling(data);
        setBillingPlan(data.billing_plan || 'pay_per_use');
        setRatePerMinuteCents(String(data.rate_per_minute_cents || 500));
        setAdminNotes(data.admin_notes || '');
      }
    } catch (err) {
      console.error('Error loading billing:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const rateCents = parseInt(ratePerMinuteCents);

      if (isNaN(rateCents) || rateCents < 0) {
        setError('Invalid rate per minute value');
        setSaving(false);
        return;
      }

      // Update billing account
      const { error: updateError } = await supabase
        .from('billing_accounts')
        .update({
          billing_plan: billingPlan,
          rate_per_minute_cents: rateCents,
          admin_notes: adminNotes,
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // Log admin action
      await supabase.from('audit_logs').insert({
        action: 'update_billing_config',
        target_user_id: userId,
        details: {
          billing_plan: billingPlan,
          rate_per_minute_cents: rateCents,
        },
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleWalletAdjust = async () => {
    const amount = parseFloat(adjustAmount);

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!adjustReason.trim()) {
      alert('Please provide a reason for this adjustment');
      return;
    }

    if (!profile?.id) {
      alert('Admin user not found');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const amountCents = Math.round(amount * 100);
      const currentWallet = billing?.wallet_cents || 0;

      if (adjustType === 'add') {
        // Add credits
        const balanceAfter = currentWallet + amountCents;

        await supabase.from('wallet_transactions').insert({
          user_id: userId,
          type: 'admin_credit',
          amount_cents: amountCents,
          balance_before_cents: currentWallet,
          balance_after_cents: balanceAfter,
          reason: adjustReason,
          admin_id: profile.id,
        });

        await supabase
          .from('billing_accounts')
          .update({
            wallet_cents: balanceAfter,
            month_added_cents: (billing?.month_added_cents || 0) + amountCents,
          })
          .eq('user_id', userId);
      } else {
        // Deduct credits
        const balanceAfter = Math.max(0, currentWallet - amountCents);

        await supabase.from('wallet_transactions').insert({
          user_id: userId,
          type: 'admin_debit',
          amount_cents: amountCents,
          balance_before_cents: currentWallet,
          balance_after_cents: balanceAfter,
          reason: adjustReason,
          admin_id: profile.id,
        });

        await supabase
          .from('billing_accounts')
          .update({ wallet_cents: balanceAfter })
          .eq('user_id', userId);
      }

      // Log admin action
      await supabase.from('audit_logs').insert({
        action: adjustType === 'add' ? 'add_wallet_credits' : 'deduct_wallet_credits',
        target_user_id: userId,
        details: {
          amount_cents: amountCents,
          reason: adjustReason,
        },
      });

      // Reload billing data
      await loadBilling();
      setShowWalletAdjust(false);
      setAdjustAmount('');
      setAdjustReason('');
      alert(`Successfully ${adjustType === 'add' ? 'added' : 'removed'} $${amount.toFixed(2)}`);
    } catch (err: any) {
      console.error('Error adjusting wallet:', err);
      alert(err.message || 'Failed to adjust wallet');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Billing Configuration</h2>
            </div>
            <p className="text-sm text-gray-600 mt-1">{userName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 text-blue-600 mx-auto mb-2 animate-spin" />
              <p className="text-gray-600">Loading billing information...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {billing && (
                <div className="p-4 bg-gray-50 rounded-lg space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">Current Wallet Balance:</span>
                    <span className="text-lg font-semibold text-gray-900">
                      ${(billing.wallet_cents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">Current Plan:</span>
                    <span className="text-gray-900 capitalize">{billing.billing_plan.replace('_', ' ')}</span>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setAdjustType('add'); setShowWalletAdjust(true); }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Add Credits
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAdjustType('deduct'); setShowWalletAdjust(true); }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                    >
                      <Minus className="h-4 w-4" />
                      Remove Credits
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Billing Plan
                </label>
                <select
                  value={billingPlan}
                  onChange={(e) => setBillingPlan(e.target.value as 'pay_per_use' | 'unlimited' | 'complimentary')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="pay_per_use">Pay Per Use - Charges deducted from wallet based on usage</option>
                  <option value="unlimited">Unlimited ($500/month) - Fixed monthly subscription</option>
                  <option value="complimentary">Complimentary - Free account (Admin-only)</option>
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  {billingPlan === 'pay_per_use' && 'Charges deducted from wallet based on usage. Invoiced monthly on the 1st. Rate is customizable per user.'}
                  {billingPlan === 'unlimited' && 'Fixed monthly subscription with unlimited usage. Charged immediately.'}
                  {billingPlan === 'complimentary' && 'Free account with unlimited usage. No billing or charges. Admin-only option.'}
                </p>
              </div>

              {billingPlan === 'pay_per_use' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rate Per Minute (in cents)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={ratePerMinuteCents}
                      onChange={(e) => setRatePerMinuteCents(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="500"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Rate in cents. Default is 500 cents ($5.00/minute). Example: 50 = $0.50/min, 100 = $1.00/min
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Notes
                  <span className="ml-1 text-xs font-normal text-gray-500">(Optional)</span>
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Add any billing notes or special instructions..."
                />
                <p className="mt-1 text-xs text-gray-500">
                  Internal notes about billing configuration or payment arrangements.
                </p>
              </div>
            </div>
          )}
        </form>

        <div className="p-6 border-t border-gray-200">
          <div className="flex gap-3">
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={loading || saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            <button
              onClick={onClose}
              disabled={saving}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Wallet Adjustment Modal */}
      {showWalletAdjust && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {adjustType === 'add' ? 'Add Wallet Credits' : 'Remove Wallet Credits'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Explain why you are adjusting the wallet balance..."
                />
                <p className="mt-1 text-xs text-gray-500">
                  This will be logged in the audit trail and visible to the user in their transaction history.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowWalletAdjust(false);
                  setAdjustAmount('');
                  setAdjustReason('');
                }}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleWalletAdjust}
                disabled={saving}
                className={`flex-1 px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50 ${
                  adjustType === 'add'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {saving ? 'Processing...' : adjustType === 'add' ? 'Add Credits' : 'Remove Credits'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
