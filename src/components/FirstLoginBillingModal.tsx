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
  const [billingPlan, setBillingPlan] = useState<'pay_per_use' | 'unlimited' | null>(null);
  const [ratePerMinute, setRatePerMinute] = useState<number>(0);
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
        .select('billing_plan, rate_per_minute_cents')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setBillingPlan(data.billing_plan === 'complimentary' ? null : data.billing_plan);
        setRatePerMinute(data.rate_per_minute_cents || 500);
      }
    } catch (err) {
      console.error('Error loading billing info:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!profile?.id || !billingPlan) {
      setError('Unable to proceed. Please try again.');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`;

      const requestBody = billingPlan === 'unlimited'
        ? { userId: profile.id, type: 'unlimited_upgrade' }
        : { userId: profile.id, type: 'wallet_topup', amountCents: 5000 };

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

  if (!billingPlan) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-white">
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

          {/* Billing Plan */}
          <div className="mb-8">
            {billingPlan === 'unlimited' ? (
              <div className="relative p-8 rounded-xl border-2 border-blue-600 bg-blue-50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Zap className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-gray-900">Unlimited Plan</h3>
                    <p className="text-sm text-gray-500">Monthly subscription</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold text-gray-900">$500</span>
                    <span className="text-gray-500">/month</span>
                  </div>
                  <p className="text-sm text-gray-600">Unlimited AI Voice Inbound Calls</p>
                </div>

                <ul className="space-y-2">
                  {['Unlimited inbound minutes', 'Priority support', 'Advanced analytics', 'No per-call charges'].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="relative p-8 rounded-xl border-2 border-blue-600 bg-blue-50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-gray-900">Pay Per Use</h3>
                    <p className="text-sm text-gray-500">Flexible wallet credits</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold text-gray-900">$50</span>
                    <span className="text-gray-500">minimum credit</span>
                  </div>
                  <p className="text-sm text-gray-600">Only pay for what you use</p>
                </div>

                <ul className="space-y-2">
                  {[
                    `$${(ratePerMinute / 100).toFixed(2)} per minute`,
                    'No monthly commitment',
                    'Refillable wallet',
                    'Perfect for flexible usage'
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
