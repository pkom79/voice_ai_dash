import { useState, useEffect } from 'react';
import { CreditCard, Wallet, Zap, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseFunctionUrl } from '../utils/supabaseFunctions';

interface FirstLoginBillingModalProps {
  onClose: () => void;
  userEmail: string;
}

export function FirstLoginBillingModal({ onClose, userEmail }: FirstLoginBillingModalProps) {
  const { profile } = useAuth();
  const [inboundPlan, setInboundPlan] = useState<string | null>(null);
  const [outboundPlan, setOutboundPlan] = useState<string | null>(null);
  const [inboundRate, setInboundRate] = useState<number>(0);
  const [outboundRate, setOutboundRate] = useState<number>(0);
  const [walletCents, setWalletCents] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBillingInfo();
  }, [profile]);

  const loadBillingInfo = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('billing_accounts')
        .select('inbound_plan, outbound_plan, inbound_rate_cents, outbound_rate_cents, wallet_cents')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setInboundPlan(data.inbound_plan);
        setOutboundPlan(data.outbound_plan);
        setInboundRate(data.inbound_rate_cents || 100);
        setOutboundRate(data.outbound_rate_cents || 100);
        setWalletCents(data.wallet_cents || 0);
      }
    } catch (err) {
      console.error('Error loading billing info:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalPayment = () => {
    let walletRequired = 0;
    let subscriptionRequired = 0;

    if (inboundPlan === 'inbound_pay_per_use' || outboundPlan === 'outbound_pay_per_use') {
      if (walletCents < 5000) {
        walletRequired = 5000 - walletCents;
      }
    }

    if (inboundPlan === 'inbound_unlimited') {
      subscriptionRequired = 50000;
    }

    return { walletRequired, subscriptionRequired, total: walletRequired + subscriptionRequired };
  };

  const handleContinue = async () => {
    if (!profile?.id || (!inboundPlan && !outboundPlan)) {
      setError('Unable to proceed. Please try again.');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const payment = calculateTotalPayment();

      if (payment.total === 0) {
        await supabase
          .from('billing_accounts')
          .update({ first_login_billing_completed: true })
          .eq('user_id', profile.id);

        onClose();
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const apiUrl = getSupabaseFunctionUrl('stripe-checkout');

      const requestBody = {
        userId: profile.id,
        type: 'first_login_billing',
        inboundPlan,
        outboundPlan,
        walletTopupCents: payment.walletRequired,
        subscriptionRequired: payment.subscriptionRequired > 0,
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create checkout session');
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      console.error('Error creating checkout session:', err);
      setError(err.message || 'Failed to proceed to payment. Please try again.');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-10">
          <div className="flex items-center justify-center gap-3 text-gray-900">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm font-medium tracking-wide">Loading billing details…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!inboundPlan && !outboundPlan) {
    return null;
  }

  const payment = calculateTotalPayment();

  if (payment.total === 0) {
    onClose();
    return null;
  }

  const hasInboundUnlimited = inboundPlan === 'inbound_unlimited';
  const hasInboundPPU = inboundPlan === 'inbound_pay_per_use';
  const hasOutboundPPU = outboundPlan === 'outbound_pay_per_use';
  const hasPPU = hasInboundPPU || hasOutboundPPU;

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center px-3 py-4 z-[1000]">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col z-[1001]">
        <div className="bg-blue-700 text-white px-6 py-4">
          <p className="text-xs text-white/80">Account: {userEmail}</p>
          <h2 className="mt-1 text-xl font-semibold">Complete your billing setup</h2>
          <p className="mt-1 text-sm text-white/80">
            Your Voice AI Dash workspace will be unlocked when your initial payment is processed.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          <div className="rounded-xl border border-gray-200 p-5 bg-white space-y-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500">Plan Overview</p>
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                <CreditCard className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Inbound calls</p>
                <p className="text-base font-semibold text-gray-900">Pay per use</p>
                <p className="text-sm text-gray-600 mt-1">Rate: ${(inboundRate / 100).toFixed(2)} per minute</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-5 bg-white space-y-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500">Payment Summary</p>
            <div className="flex items-center justify-between text-sm text-gray-900">
              <span>Required wallet credit</span>
              <span className="font-semibold">${(payment.walletRequired / 100).toFixed(2)}</span>
            </div>
            <div className="pt-3 border-t border-gray-200">
              <p className="text-[11px] uppercase tracking-wider text-gray-500">Total due today</p>
              <p className="text-2xl font-bold text-gray-900">${(payment.total / 100).toFixed(2)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-5 bg-white space-y-3">
            <p className="text-sm font-semibold text-gray-900">Wallet requirement</p>
            <p className="text-sm text-gray-600">
              Start with a $50 wallet top-up to enable pay-per-use.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-gray-900" />
                Current wallet balance: ${(walletCents / 100).toFixed(2)}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-gray-900" />
                Amount to add today: ${(payment.walletRequired / 100).toFixed(2)}
              </li>
            </ul>
          </div>
        </div>

        <div className="px-10 py-6 bg-gray-50 border-t border-gray-200">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            onClick={handleContinue}
            disabled={processing}
            className="w-full inline-flex items-center justify-center gap-3 rounded-2xl bg-blue-700 text-white py-4 text-lg font-semibold hover:bg-blue-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {processing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                Pay ${(payment.total / 100).toFixed(2)}
              </>
            )}
          </button>
          <p className="mt-3 text-center text-xs text-gray-500">
            Payments are securely processed by Stripe.
          </p>
        </div>
      </div>
    </div>
  );
}
