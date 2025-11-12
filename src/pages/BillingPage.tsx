import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet,
  CreditCard,
  TrendingUp,
  Download,
  Plus,
  AlertCircle,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';

interface BillingAccount {
  id: string;
  billing_plan: 'pay_per_use' | 'unlimited' | 'complimentary';
  wallet_cents: number;
  rate_per_minute_cents: number;
  month_spent_cents: number;
  month_added_cents: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  next_payment_at: string | null;
}

interface WalletTransaction {
  id: string;
  type?: 'top_up' | 'deduction' | 'admin_credit' | 'admin_debit' | 'refund';
  amount_cents: number;
  balance_before_cents: number;
  balance_after_cents: number;
  reason: string;
  created_at: string;
}

export function BillingPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [billingAccount, setBillingAccount] = useState<BillingAccount | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReplenishModal, setShowReplenishModal] = useState(false);
  const [replenishAmount, setReplenishAmount] = useState('50');
  const [processing, setProcessing] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showCancelAlert, setShowCancelAlert] = useState(false);

  useEffect(() => {
    loadBillingData();

    // Check for success or cancel query parameters
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');

    if (success === 'true') {
      setShowSuccessAlert(true);
      // Clear query params after 100ms to avoid confusion
      setTimeout(() => {
        setSearchParams({});
      }, 100);
      // Hide alert after 10 seconds
      setTimeout(() => {
        setShowSuccessAlert(false);
      }, 10000);
    }

    if (canceled === 'true') {
      setShowCancelAlert(true);
      // Clear query params after 100ms
      setTimeout(() => {
        setSearchParams({});
      }, 100);
      // Hide alert after 10 seconds
      setTimeout(() => {
        setShowCancelAlert(false);
      }, 10000);
    }
  }, [searchParams]);

  const loadBillingData = async () => {
    setLoading(true);
    try {
      const [billingResult, transactionsResult] = await Promise.all([
        supabase
          .from('billing_accounts')
          .select('*')
          .eq('user_id', profile?.id)
          .maybeSingle(),
        supabase
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', profile?.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (billingResult.error) throw billingResult.error;
      if (transactionsResult.error) throw transactionsResult.error;

      setBillingAccount(billingResult.data);
      setTransactions(transactionsResult.data || []);
    } catch (error) {
      console.error('Error loading billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReplenish = async () => {
    const amount = parseFloat(replenishAmount);

    if (isNaN(amount) || amount < 50) {
      alert('Minimum replenishment amount is $50');
      return;
    }

    setProcessing(true);

    try {
      // Call Stripe Checkout edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: profile?.id,
            amountCents: Math.round(amount * 100),
            type: 'wallet_topup',
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error('Error processing replenishment:', error);
      alert(error instanceof Error ? error.message : 'Failed to process replenishment');
      setProcessing(false);
    }
  };

  const handleUpgradeToUnlimited = async () => {
    setProcessing(true);

    try {
      // Call Stripe Checkout edge function for unlimited upgrade
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: profile?.id,
            type: 'unlimited_upgrade',
            walletCents: billingAccount?.wallet_cents || 0,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create upgrade session');
      }

      const { url } = await response.json();

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error('Error processing upgrade:', error);
      alert(error instanceof Error ? error.message : 'Failed to process upgrade');
      setProcessing(false);
    }
  };

  const exportTransactions = () => {
    const headers = ['Date', 'Type', 'Reason', 'Amount', 'Balance'];
    const rows = transactions.map((t) => [
      format(new Date(t.created_at), 'yyyy-MM-dd HH:mm:ss'),
      t.type,
      t.reason,
      `$${(t.amount_cents / 100).toFixed(2)}`,
      `$${(t.balance_after_cents / 100).toFixed(2)}`,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const thisMonthTransactions = transactions.filter(
    (t) =>
      new Date(t.created_at).getMonth() === new Date().getMonth() &&
      new Date(t.created_at).getFullYear() === new Date().getFullYear()
  );

  const thisMonthSpent = thisMonthTransactions
    .filter((t) => t.type === 'deduction')
    .reduce((sum, t) => sum + t.amount_cents, 0) / 100;

  const thisMonthReplenished = thisMonthTransactions
    .filter((t) => t.type === 'top_up' || t.type === 'admin_credit')
    .reduce((sum, t) => sum + t.amount_cents, 0) / 100;

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage your payments and wallet balance</p>
        </div>
      </div>

      {/* Success Alert */}
      {showSuccessAlert && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-900 dark:text-green-300">Payment Successful!</p>
            <p className="text-sm text-green-700 dark:text-green-400 mt-1">
              Your payment has been processed successfully. Your wallet balance will be updated shortly.
            </p>
          </div>
          <button
            onClick={() => setShowSuccessAlert(false)}
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Cancel Alert */}
      {showCancelAlert && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-300">Payment Canceled</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
              Your payment was canceled. No charges were made to your account.
            </p>
          </div>
          <button
            onClick={() => setShowCancelAlert(false)}
            className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-300"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Payment Model Badge */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-300">Payment Model</p>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              {billingAccount?.billing_plan === 'unlimited'
                ? 'Unlimited - $500/month'
                : billingAccount?.billing_plan === 'complimentary'
                ? 'Complimentary Plan'
                : `Pay Per Use - $${((billingAccount?.rate_per_minute_cents || 500) / 100).toFixed(2)}/minute`}
            </p>
          </div>
        </div>
        {billingAccount?.billing_plan === 'pay_per_use' && (
          <button
            onClick={() => {
              if (confirm('Upgrade to Unlimited plan for $500/month? Your wallet balance will be applied to the first month.')) {
                handleUpgradeToUnlimited();
              }
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium whitespace-nowrap"
          >
            Upgrade to Unlimited
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Wallet Balance - Only show for PPU */}
        {billingAccount?.billing_plan === 'pay_per_use' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
                <Wallet className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <button
                onClick={() => setShowReplenishModal(true)}
                className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                <Plus className="h-4 w-4" />
                Add Funds
              </button>
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Wallet Balance</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              ${((billingAccount?.wallet_cents || 0) / 100).toFixed(2)}
            </p>
            {(billingAccount?.wallet_cents || 0) < 1000 && (
              <div className="mt-3 flex items-start gap-2 text-sm text-orange-600 dark:text-orange-400">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 dark:text-orange-400" />
                <span>Low balance. Consider adding funds to avoid service interruption.</span>
              </div>
            )}
          </div>
        )}

        {/* Next Payment - Show for PPU and Unlimited */}
        {(billingAccount?.billing_plan === 'pay_per_use' || billingAccount?.billing_plan === 'unlimited') && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg mb-4 w-fit">
              <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Next Payment</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {billingAccount?.next_payment_at
                ? format(new Date(billingAccount.next_payment_at), 'MMM d, yyyy')
                : billingAccount?.billing_plan === 'unlimited'
                ? 'Active'
                : 'TBD'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {billingAccount?.billing_plan === 'unlimited' ? '$500/month' : 'Based on usage'}
            </p>
          </div>
        )}

        {/* This Month Spent */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
          <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-lg mb-4 w-fit">
            <TrendingUp className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">This Month Spent</h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">${thisMonthSpent.toFixed(2)}</p>
        </div>

        {/* This Month Replenished */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
          <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg mb-4 w-fit">
            <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">This Month Added</h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">${thisMonthReplenished.toFixed(2)}</p>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Transaction History</h2>
          <button
            onClick={exportTransactions}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No transactions yet
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {format(new Date(transaction.created_at), 'MMM d, yyyy')}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {format(new Date(transaction.created_at), 'h:mm a')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          transaction.type === 'top_up' || transaction.type === 'admin_credit'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : transaction.type === 'deduction' || transaction.type === 'admin_debit'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            : transaction.type === 'refund'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {transaction.type?.replace(/_/g, ' ') || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-gray-100">{transaction.reason}</div>
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
                        ${(transaction.amount_cents / 100).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-gray-900 dark:text-gray-100">
                      ${(transaction.balance_after_cents / 100).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Replenish Modal */}
      {showReplenishModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Add Funds to Wallet</h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Amount (minimum $50)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  min="50"
                  step="10"
                  value={replenishAmount}
                  onChange={(e) => setReplenishAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {[50, 100, 200, 500].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setReplenishAmount(amount.toString())}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-sm"
                  >
                    ${amount}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900 dark:text-blue-300">
                Manual payment processing is enabled. An administrator will process your payment
                request.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowReplenishModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReplenish}
                disabled={processing}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
