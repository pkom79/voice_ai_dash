import { AlertCircle } from 'lucide-react';

interface DualPlanSelectorProps {
  inboundPlan: string | null;
  outboundPlan: string | null;
  inboundRate: string;
  outboundRate: string;
  onInboundPlanChange: (plan: string | null) => void;
  onOutboundPlanChange: (plan: string | null) => void;
  onInboundRateChange: (rate: string) => void;
  onOutboundRateChange: (rate: string) => void;
  showRates?: boolean;
  disabled?: boolean;
}

export function DualPlanSelector({
  inboundPlan,
  outboundPlan,
  inboundRate,
  outboundRate,
  onInboundPlanChange,
  onOutboundPlanChange,
  onInboundRateChange,
  onOutboundRateChange,
  showRates = true,
  disabled = false,
}: DualPlanSelectorProps) {
  const hasNoPlan = !inboundPlan && !outboundPlan;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Inbound Plan Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Inbound Plan
          </label>
          <select
            value={inboundPlan || 'none'}
            onChange={(e) => onInboundPlanChange(e.target.value === 'none' ? null : e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="none">None</option>
            <option value="inbound_pay_per_use">Inbound Pay Per Use</option>
            <option value="inbound_unlimited">Inbound Unlimited</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {inboundPlan === 'inbound_pay_per_use' && 'Charged per minute from wallet'}
            {inboundPlan === 'inbound_unlimited' && '$500/month subscription'}
            {!inboundPlan && 'No inbound plan selected'}
          </p>
        </div>

        {/* Outbound Plan Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Outbound Plan
          </label>
          <select
            value={outboundPlan || 'none'}
            onChange={(e) => onOutboundPlanChange(e.target.value === 'none' ? null : e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="none">None</option>
            <option value="outbound_pay_per_use">Outbound Pay Per Use</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {outboundPlan === 'outbound_pay_per_use' && 'Charged per minute from wallet'}
            {!outboundPlan && 'No outbound plan selected'}
          </p>
        </div>
      </div>

      {/* Validation Warning */}
      {hasNoPlan && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-900">At least one plan required</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Please select at least one plan (Inbound or Outbound) for this user.
            </p>
          </div>
        </div>
      )}

      {/* Rate Configuration */}
      {showRates && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Inbound Rate */}
          {inboundPlan === 'inbound_pay_per_use' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inbound Rate (cents/minute)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={inboundRate}
                onChange={(e) => onInboundRateChange(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="100"
              />
              <p className="mt-1 text-xs text-gray-500">
                Default: 100 cents ($1.00/min). Example: 50 = $0.50/min, 150 = $1.50/min
              </p>
            </div>
          )}

          {/* Outbound Rate */}
          {outboundPlan === 'outbound_pay_per_use' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Outbound Rate (cents/minute)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={outboundRate}
                onChange={(e) => onOutboundRateChange(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="100"
              />
              <p className="mt-1 text-xs text-gray-500">
                Default: 100 cents ($1.00/min). Example: 50 = $0.50/min, 150 = $1.50/min
              </p>
            </div>
          )}
        </div>
      )}

      {/* Plan Combination Summary */}
      {(inboundPlan || outboundPlan) && (
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <p className="text-sm font-medium text-gray-900 mb-2">Plan Summary</p>
          <div className="text-sm text-gray-700 space-y-1">
            {inboundPlan === 'inbound_pay_per_use' && (
              <p>• Inbound Pay Per Use: ${(parseInt(inboundRate) / 100).toFixed(2)}/minute</p>
            )}
            {inboundPlan === 'inbound_unlimited' && (
              <p>• Inbound Unlimited: $500/month subscription</p>
            )}
            {outboundPlan === 'outbound_pay_per_use' && (
              <p>• Outbound Pay Per Use: ${(parseInt(outboundRate) / 100).toFixed(2)}/minute</p>
            )}
            {(inboundPlan === 'inbound_pay_per_use' || outboundPlan === 'outbound_pay_per_use') && (
              <p className="mt-2 font-medium text-gray-900">Initial wallet requirement: $50.00</p>
            )}
            {inboundPlan === 'inbound_unlimited' && (
              <p className="mt-2 font-medium text-gray-900">Initial subscription charge: $500.00</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
