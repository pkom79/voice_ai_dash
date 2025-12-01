import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import { NotificationModal } from '../components/NotificationModal';
import { useNotification } from '../hooks/useNotification';
import { getSupabaseFunctionUrl } from '../utils/supabaseFunctions';
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
  Package,
  Activity,
  Shield,
  ExternalLink,
} from 'lucide-react';
import { formatDateEST } from '../utils/formatting';

interface BillingAccount {
  id: string;
  inbound_plan: string | null;
  outbound_plan: string | null;
  wallet_cents: number;
  inbound_rate_cents: number;
  outbound_rate_cents: number;
  month_spent_cents: number;
  month_added_cents: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  next_payment_at: string | null;
  grace_until: string | null;
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

interface BillingInvoice {
  id: string;
  billing_cycle_start: string;
  billing_cycle_end: string;
  total_charged_cents: number;
  status: 'draft' | 'finalized' | 'paid' | 'failed' | 'cancelled';
  stripe_invoice_url: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

type CombinedTransactionRecord = {
  id: string;
  kind: 'wallet' | 'invoice' | 'stripe_payment';
  date: string;
  label: string;
  description: string;
  amount_cents: number;
  isCredit: boolean;
  walletType?: WalletTransaction['type'];
  status?: BillingInvoice['status'] | string;
  link?: string | null;
};

interface StripePayment {
  id: string;
  amount: number;
  amount_received: number;
  currency: string;
  status: string;
  description: string | null;
  created: number;
  receipt_url: string | null;
}

export function BillingPage() {
  const { notification, showError, showWarning, hideNotification } = useNotification();
  const { profile, session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [billingAccount, setBillingAccount] = useState<BillingAccount | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [stripePayments, setStripePayments] = useState<StripePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReplenishModal, setShowReplenishModal] = useState(false);
  const [replenishAmount, setReplenishAmount] = useState('50');
  const [processing, setProcessing] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showCancelAlert, setShowCancelAlert] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const portalLoginUrl = import.meta.env.VITE_STRIPE_PORTAL_LOGIN_URL || 'https://billing.stripe.com/p/login/cNieV5ey2edpad5gd75gc00';
  const combinedTransactions = useMemo<CombinedTransactionRecord[]>(() => {
    const walletEntries = transactions.map((transaction) => ({
      id: `wallet-${transaction.id}`,
      kind: 'wallet' as const,
      date: transaction.created_at,
      label: (transaction.type || 'wallet').replace(/_/g, ' '),
      description: transaction.reason,
      amount_cents: transaction.amount_cents,
      isCredit: transaction.type === 'top_up' || transaction.type === 'admin_credit' || transaction.type === 'refund',
      walletType: transaction.type,
    }));

    const invoiceEntries = invoices.map((invoice) => {
      const billingReason = invoice.metadata?.billing_reason || invoice.metadata?.reason;
      const description =
        billingReason === 'subscription_cycle' || billingReason === 'subscription_create'
          ? 'Unlimited subscription payment'
          : billingReason === 'manual'
            ? 'Manual invoice payment'
            : 'Stripe invoice';

      const invoiceDate = invoice.billing_cycle_end || invoice.billing_cycle_start || invoice.created_at;

      return {
        id: `invoice-${invoice.id}`,
        kind: 'invoice' as const,
        date: invoiceDate,
        label: `Invoice ${invoice.status}`,
        description,
        amount_cents: invoice.total_charged_cents || 0,
        isCredit: false,
        status: invoice.status,
        link: invoice.stripe_invoice_url,
      };
    });

    const stripeEntries = stripePayments.map((payment) => ({
      id: `stripe-${payment.id}`,
      kind: 'stripe_payment' as const,
      date: new Date(payment.created * 1000).toISOString(),
      label: 'Stripe Payment',
      description: payment.description || 'Stripe payment',
      amount_cents: payment.amount_received || payment.amount || 0,
      isCredit: true,
      status: payment.status as BillingInvoice['status'],
      link: payment.receipt_url,
    }));

    return [...walletEntries, ...invoiceEntries, ...stripeEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [transactions, invoices, stripePayments]);

  const getTypeBadgeClass = (entry: CombinedTransactionRecord) => {
    if (entry.kind === 'invoice') {
      if (entry.status === 'paid') {
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      }
      if (entry.status === 'failed') {
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      }
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
    if (entry.kind === 'stripe_payment') {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }

    if (entry.walletType === 'top_up' || entry.walletType === 'admin_credit' || entry.walletType === 'refund') {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    }
    if (entry.walletType === 'deduction' || entry.walletType === 'admin_debit') {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  };

  const getTypeLabel = (entry: CombinedTransactionRecord) => {
    if (entry.kind === 'invoice') {
      return entry.status ? `INVOICE · ${entry.status.toUpperCase()}` : 'INVOICE';
    }
    if (entry.kind === 'stripe_payment') {
      return 'STRIPE PAYMENT';
    }
    return (entry.walletType || 'wallet').replace(/_/g, ' ').toUpperCase();
  };

  useEffect(() => {
    loadBillingData();

    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');

    if (success === 'true') {
      setShowSuccessAlert(true);
      setTimeout(() => {
        setSearchParams({});
      }, 100);
      setTimeout(() => {
        setShowSuccessAlert(false);
      }, 10000);
    }

    if (canceled === 'true') {
      setShowCancelAlert(true);
      setTimeout(() => {
        setSearchParams({});
      }, 100);
      setTimeout(() => {
        setShowCancelAlert(false);
      }, 10000);
    }
  }, [searchParams]);

  const loadBillingData = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const [billingResult, transactionsResult, invoiceResult] = await Promise.all([
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
        supabase
          .from('billing_invoices')
          .select('id, billing_cycle_start, billing_cycle_end, total_charged_cents, status, stripe_invoice_url, metadata, created_at')
          .eq('user_id', profile?.id)
          .order('billing_cycle_start', { ascending: false })
          .limit(50),
      ]);

      if (billingResult.error) throw billingResult.error;
      if (transactionsResult.error) throw transactionsResult.error;
      if (invoiceResult.error) throw invoiceResult.error;

      setBillingAccount(billingResult.data);
      setTransactions(transactionsResult.data || []);
      setInvoices(invoiceResult.data || []);

      if (profile?.id && session?.access_token) {
        const stripeResponse = await fetch(getSupabaseFunctionUrl('stripe-list-payments'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: profile.id, limit: 20 }),
        });

        if (stripeResponse.ok) {
          const stripeData = await stripeResponse.json();
          setStripePayments(stripeData.payments || []);
        } else {
          setStripePayments([]);
        }
      } else {
        setStripePayments([]);
      }
    } catch (error) {
      console.error('Error loading billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReplenish = async () => {
    const amount = parseFloat(replenishAmount);

    if (isNaN(amount) || amount < 50) {
      showWarning('Minimum replenishment amount is $50');
      return;
    }

    setProcessing(true);

    try {
      const response = await fetch(getSupabaseFunctionUrl('stripe-checkout'), {
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
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error processing replenishment:', error);
      showError(error instanceof Error ? error.message : 'Failed to process replenishment');
      setProcessing(false);
    }
  };

  const handleUpgradeToUnlimited = async () => {
    setProcessing(true);

    try {
      const response = await fetch(getSupabaseFunctionUrl('stripe-checkout'), {
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
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create upgrade session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error processing upgrade:', error);
      showError(error instanceof Error ? error.message : 'Failed to process upgrade');
      setProcessing(false);
    }
  };

  const handleOpenStripePortal = async () => {
    const hasPaymentHistory = combinedTransactions.length > 0;

    if (!billingAccount?.stripe_customer_id && !hasPaymentHistory) {
      showWarning('To access payment management, please make a payment first by adding funds to your wallet or upgrading to an Unlimited plan. This will create your payment profile.');
      return;
    }

    setLoadingPortal(true);

    try {
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(getSupabaseFunctionUrl('stripe-portal'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: profile?.id,
          returnUrl: window.location.href,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to create portal session';

        if (errorMessage.includes('No Stripe customer found') || response.status === 404) {
          if (portalLoginUrl) {
            window.location.href = portalLoginUrl;
            return;
          }
          throw new Error('To access payment management, please make a payment first by adding funds to your wallet or upgrading to an Unlimited plan.');
        }
        throw new Error(errorMessage);
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      if (portalLoginUrl) {
        window.location.href = portalLoginUrl;
        return;
      }
      console.error('Error opening portal:', error);
      showError(error instanceof Error ? error.message : 'Unable to open billing portal. Please try again later.');
      setLoadingPortal(false);
    }
  };

  const exportTransactions = () => {
    const headers = ['Date', 'Type', 'Reason', 'Amount'];
    const rows = combinedTransactions.map((t) => [
      formatDateEST(new Date(t.date), 'yyyy-MM-dd HH:mm:ss'),
      t.kind === 'invoice' ? `invoice_${t.status}` : (t.walletType || 'wallet'),
      t.description,
      `${t.isCredit ? '+' : '-'}$${(Math.abs(t.amount_cents) / 100).toFixed(2)}`,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${formatDateEST(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const isPastDue = billingAccount?.grace_until && new Date(billingAccount.grace_until) < new Date();
  const gracePeriodEnd = billingAccount?.grace_until
    ? new Date(new Date(billingAccount.grace_until).getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Billing</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Manage your account and payments</p>
      </div>

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

      {billingAccount?.inbound_plan === 'inbound_unlimited' && isPastDue && gracePeriodEnd && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900 dark:text-red-300">Payment Past Due</p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">
              Payment is required by {formatDateEST(gracePeriodEnd, 'MMMM d, yyyy')} to avoid service interruption.
            </p>
          </div>
        </div>
      )}

      {/* Active Plans Section */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Active Plans</h3>
          {billingAccount?.stripe_customer_id && (
            <button
              onClick={handleOpenStripePortal}
              disabled={loadingPortal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <ExternalLink className="h-4 w-4" />
              {loadingPortal ? 'Loading...' : 'Manage Payment Methods'}
            </button>
          )}
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-4">
          {/* Inbound Plan */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900 dark:text-white">Inbound Plan</h4>
              {billingAccount?.inbound_plan && (
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                  Active
                </span>
              )}
            </div>
            {billingAccount?.inbound_plan ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Type: </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {billingAccount.inbound_plan === 'inbound_pay_per_use' ? 'Pay Per Use' : 'Unlimited'}
                  </span>
                </div>
                {billingAccount.inbound_plan === 'inbound_pay_per_use' && (
                  <div className="text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Rate: </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      ${(billingAccount.inbound_rate_cents / 100).toFixed(2)}/min
                    </span>
                  </div>
                )}
                {billingAccount.inbound_plan === 'inbound_unlimited' && (
                  <div className="text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Subscription: </span>
                    <span className="font-medium text-gray-900 dark:text-white">$500/month</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No inbound plan active</p>
            )}
          </div>

          {/* Outbound Plan */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900 dark:text-white">Outbound Plan</h4>
              {billingAccount?.outbound_plan && (
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                  Active
                </span>
              )}
            </div>
            {billingAccount?.outbound_plan ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Type: </span>
                  <span className="font-medium text-gray-900 dark:text-white">Pay Per Use</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Rate: </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${(billingAccount.outbound_rate_cents / 100).toFixed(2)}/min
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No outbound plan active</p>
            )}
          </div>
        </div>
      </div>

      {(billingAccount?.inbound_plan === 'inbound_pay_per_use' || billingAccount?.outbound_plan === 'outbound_pay_per_use') && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Usage & Balances</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Monitor wallet funds and current usage.</p>
          </div>
          <div className="p-5 grid md:grid-cols-3 gap-4">
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
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
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Low balance. Consider adding funds to avoid service interruption.</span>
                </div>
              )}
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg mb-4 w-fit">
                <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Outstanding Balance</h3>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                $0.00
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Unpaid usage across all periods</p>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg mb-4 w-fit">
                <Activity className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Current Usage</h3>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                ${Math.max(0, (billingAccount?.month_spent_cents || 0) / 100).toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Usage this period (not reduced by payments)</p>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
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
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {combinedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No transactions yet
                  </td>
                </tr>
              ) : (
                combinedTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {formatDateEST(new Date(transaction.date), 'MMM d, yyyy')}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDateEST(new Date(transaction.date), 'h:mm a')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadgeClass(transaction)}`}
                      >
                        {getTypeLabel(transaction)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <span>{transaction.description}</span>
                        {transaction.link && (
                          <a
                            href={transaction.link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 dark:text-blue-400 text-xs font-medium hover:underline"
                          >
                            View
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span
                        className={`text-sm font-medium ${transaction.isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}
                      >
                        {transaction.isCredit ? '+' : '-'}
                        ${(Math.abs(transaction.amount_cents) / 100).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                {processing ? 'Processing...' : 'Add Funds'}
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
