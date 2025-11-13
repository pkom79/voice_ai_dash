import { useState } from 'react';
import { X, CreditCard, Wallet, Zap, Check, Loader2 } from 'lucide-react';
import { createCheckoutSession, createPortalSession } from '../services/stripe';

interface FirstLoginBillingModalProps {
  onClose: () => void;
  userEmail: string;
}

export function FirstLoginBillingModal({ onClose, userEmail }: FirstLoginBillingModalProps) {
  const [selectedOption, setSelectedOption] = useState<'monthly' | 'wallet' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    if (!selectedOption) {
      setError('Please select a billing option');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (selectedOption === 'monthly') {
        const { url } = await createCheckoutSession('unlimited');
        if (url) {
          window.location.href = url;
        }
      } else {
        const { url } = await createCheckoutSession('pay_per_use', 5000);
        if (url) {
          window.location.href = url;
        }
      }
    } catch (err: any) {
      console.error('Error creating checkout session:', err);
      setError('Failed to proceed to payment. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
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
              Choose the billing option that works best for you
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Billing Options */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Monthly Subscription Option */}
            <button
              onClick={() => setSelectedOption('monthly')}
              disabled={loading}
              className={`relative p-6 rounded-xl border-2 transition-all text-left ${
                selectedOption === 'monthly'
                  ? 'border-blue-600 bg-blue-50 shadow-lg'
                  : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {selectedOption === 'monthly' && (
                <div className="absolute top-4 right-4">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">Unlimited Plan</h3>
                  <p className="text-sm text-gray-500">Monthly subscription</p>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-bold text-gray-900">$99</span>
                  <span className="text-gray-500">/month</span>
                </div>
                <p className="text-sm text-gray-600">Unlimited AI voice calls</p>
              </div>

              <ul className="space-y-2">
                {['Unlimited minutes', 'Priority support', 'Advanced analytics', 'No per-call charges'].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </button>

            {/* Pay-as-you-go Option */}
            <button
              onClick={() => setSelectedOption('wallet')}
              disabled={loading}
              className={`relative p-6 rounded-xl border-2 transition-all text-left ${
                selectedOption === 'wallet'
                  ? 'border-blue-600 bg-blue-50 shadow-lg'
                  : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {selectedOption === 'wallet' && (
                <div className="absolute top-4 right-4">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">Pay-as-you-go</h3>
                  <p className="text-sm text-gray-500">Flexible wallet credits</p>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-bold text-gray-900">$50</span>
                  <span className="text-gray-500">minimum</span>
                </div>
                <p className="text-sm text-gray-600">Only pay for what you use</p>
              </div>

              <ul className="space-y-2">
                {['$0.50 per minute', 'No monthly commitment', 'Refillable wallet', 'Perfect for testing'].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </button>
          </div>

          {/* Call to Action */}
          <div className="flex gap-4">
            <button
              onClick={handleContinue}
              disabled={!selectedOption || loading}
              className="flex-1 bg-blue-600 text-white py-4 px-6 rounded-lg hover:bg-blue-700 font-semibold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
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
          </div>

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
