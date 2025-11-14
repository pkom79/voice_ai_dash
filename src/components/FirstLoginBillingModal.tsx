import { useState, useEffect } from 'react';
import { X, CreditCard, Wallet, Zap, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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

  const handleClose = async () => {
    // When user closes the modal, mark billing as completed so they don't see it again
    if (profile?.id) {
      await supabase
        .from('billing_accounts')
        .update({ first_login_billing_completed: true })
        .eq('user_id', profile.id);
    }
    onClose();
  };

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
        setInboundRate(data.inbound_rate_cents || 500);
        setOutboundRate(data.outbound_rate_cents || 500);
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

    // Check if PPU wallet is needed ($50 = 5000 cents)
    if (inboundPlan === 'inbound_pay_per_use' || outboundPlan === 'outbound_pay_per_use') {
      if (walletCents < 5000) {
        walletRequired = 5000 - walletCents;
      }
    }

    // Check if Unlimited subscription is needed ($500 = 50000 cents)
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

      // If no payment is required, mark billing as completed and close
      if (payment.total === 0) {
        await supabase
          .from('billing_accounts')
          .update({ first_login_billing_completed: true })
          .eq('user_id', profile.id);

        onClose();
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`;

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
          'Authorization': `Bearer ${session?.access_token}`,
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!inboundPlan && !outboundPlan) {
    return null;
  }

  const payment = calculateTotalPayment();

  // If no payment is required, don't show the modal
  if (payment.total === 0) {
    onClose();
    return null;
  }

  const hasInboundUnlimited = inboundPlan === 'inbound_unlimited';
  const hasInboundPPU = inboundPlan === 'inbound_pay_per_use';
  const hasOutboundPPU = outboundPlan === 'outbound_pay_per_use';
  const hasPPU = hasInboundPPU || hasOutboundPPU;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-white">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white bg-opacity-20 rounded-full mb-4">
              <CreditCard className="h-8 w-8" />
            </div>
            <h2 className="text-3xl font-bold mb-2">Welcome to Voice AI Dash!</h2>
            <p className="text-blue-100 text-lg">
              To get started, please set up your billing method
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="text-center mb-8">
            <p className="text-gray-600">
              Your assigned billing plan
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Billing Plan Summary */}
          <div className="mb-8 space-y-4">
            <div className="text-center mb-4">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Your Plan Configuration</h3>
              <p className="text-sm text-gray-600">Initial payment required to activate your account</p>
            </div>

            {/* Inbound Plan Card */}
            {inboundPlan && (
              <div className={`relative p-6 rounded-xl border-2 ${
                hasInboundUnlimited ? 'border-blue-600 bg-blue-50' : 'border-green-600 bg-green-50'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    hasInboundUnlimited ? 'bg-blue-100' : 'bg-green-100'
                  }`}>
                    {hasInboundUnlimited ? (
                      <Zap className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Wallet className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-lg text-gray-900">
                      {hasInboundUnlimited ? 'Inbound Unlimited' : 'Inbound Pay Per Use'}
                    </h4>
                    <p className="text-xs text-gray-500">Incoming AI Voice Calls</p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {hasInboundUnlimited ? (
                    <>
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>Unlimited inbound minutes</span>
                      </li>
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>$500/month subscription</span>
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>${(inboundRate / 100).toFixed(2)} per minute</span>
                      </li>
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>Charged from wallet balance</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            )}

            {/* Outbound Plan Card */}
            {outboundPlan && (
              <div className="relative p-6 rounded-xl border-2 border-green-600 bg-green-50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg text-gray-900">Outbound Pay Per Use</h4>
                    <p className="text-xs text-gray-500">Outgoing AI Voice Calls</p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  <li className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>${(outboundRate / 100).toFixed(2)} per minute</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Charged from wallet balance</span>
                  </li>
                </ul>
              </div>
            )}

            {/* Payment Summary */}
            <div className="p-6 rounded-xl border-2 border-gray-300 bg-gray-50">
              <h4 className="font-bold text-lg text-gray-900 mb-3">Payment Summary</h4>
              <div className="space-y-2">
                {hasPPU && payment.walletRequired > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Wallet Credit (minimum $50)</span>
                    <span className="font-semibold text-gray-900">${(payment.walletRequired / 100).toFixed(2)}</span>
                  </div>
                )}
                {hasInboundUnlimited && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Unlimited Subscription (first month)</span>
                    <span className="font-semibold text-gray-900">${(payment.subscriptionRequired / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 mt-2 border-t border-gray-300 flex justify-between">
                  <span className="font-bold text-gray-900">Total Due Today</span>
                  <span className="font-bold text-xl text-blue-600">${(payment.total / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <button
            onClick={handleContinue}
            disabled={processing}
            className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg hover:bg-blue-700 font-semibold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Continue to Payment
                <CreditCard className="h-5 w-5" />
              </>
            )}
          </button>

          {/* Security Badge */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Secure payment powered by Stripe
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
