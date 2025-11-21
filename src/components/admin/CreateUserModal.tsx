import { useState } from 'react';
import { X, Loader2, UserPlus, Mail, Check, Copy } from 'lucide-react';
import { adminService } from '../../services/admin';
import { DualPlanSelector } from './DualPlanSelector';

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    businessName: '',
    phoneNumber: '',
    role: 'client' as 'client' | 'admin',
    inboundPlan: null as string | null,
    outboundPlan: null as string | null,
    inboundRate: '100',
    outboundRate: '100',
    adminNotes: '',
    stripeCustomerId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const formatPhoneNumber = (value: string) => {
    const phoneNumber = value.replace(/\D/g, '');

    if (phoneNumber.length === 0) return '';
    if (phoneNumber.length <= 3) return `(${phoneNumber}`;
    if (phoneNumber.length <= 6) return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData({ ...formData, phoneNumber: formatted });
  };

  const handleSubmit = async (sendInvite: boolean) => {
    setLoading(true);
    setError(null);

    try {
      // Validation
      if (!formData.businessName.trim()) {
        setError('Business name is required');
        setLoading(false);
        return;
      }

      if (!formData.inboundPlan && !formData.outboundPlan) {
        setError('Please select at least one plan (Inbound or Outbound)');
        setLoading(false);
        return;
      }

      const inboundRateCents = parseInt(formData.inboundRate);
      const outboundRateCents = parseInt(formData.outboundRate);

      if (formData.inboundPlan === 'inbound_pay_per_use' && (isNaN(inboundRateCents) || inboundRateCents < 0)) {
        setError('Invalid inbound rate per minute value');
        setLoading(false);
        return;
      }

      if (formData.outboundPlan === 'outbound_pay_per_use' && (isNaN(outboundRateCents) || outboundRateCents < 0)) {
        setError('Invalid outbound rate per minute value');
        setLoading(false);
        return;
      }

      const result = await adminService.createUser({
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        businessName: formData.businessName,
        phoneNumber: formData.phoneNumber,
        role: formData.role,
        inboundPlan: formData.inboundPlan,
        outboundPlan: formData.outboundPlan,
        inboundRateCents: inboundRateCents,
        outboundRateCents: outboundRateCents,
        adminNotes: formData.adminNotes || undefined,
        stripeCustomerId: formData.stripeCustomerId || undefined,
        sendInvite,
      });

      if (result.success) {
        if (sendInvite && result.invitationLink) {
          setInvitationLink(result.invitationLink);
        } else {
          onSuccess();
          onClose();
        }
      } else {
        setError(result.error || 'Failed to create user');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (invitationLink) {
      await navigator.clipboard.writeText(invitationLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {showErrorModal && error && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Action needed</h3>
                <p className="mt-2 text-sm text-gray-700">{error}</p>
              </div>
              <button
                onClick={() => setShowErrorModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close error"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Create New User</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-600">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="john.doe@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Acme Corp"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={handlePhoneChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="(123) 456-7890"
                maxLength={14}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role <span className="text-red-600">*</span>
              </label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value as 'client' | 'admin' })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="client">Client</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {formData.role === 'client' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Plans <span className="text-red-600">*</span>
                  </label>
                  <DualPlanSelector
                    inboundPlan={formData.inboundPlan}
                    outboundPlan={formData.outboundPlan}
                    inboundRate={formData.inboundRate}
                    outboundRate={formData.outboundRate}
                    onInboundPlanChange={(plan) => setFormData({ ...formData, inboundPlan: plan })}
                    onOutboundPlanChange={(plan) => setFormData({ ...formData, outboundPlan: plan })}
                    onInboundRateChange={(rate) => setFormData({ ...formData, inboundRate: rate })}
                    onOutboundRateChange={(rate) => setFormData({ ...formData, outboundRate: rate })}
                    showRates={true}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stripe Customer ID <span className="text-xs font-normal text-gray-500">(Optional - Overrides email lookup)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.stripeCustomerId}
                    onChange={(e) => setFormData({ ...formData, stripeCustomerId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="cus_..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Admin Notes <span className="text-xs font-normal text-gray-500">(Optional)</span>
                  </label>
                  <textarea
                    value={formData.adminNotes}
                    onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Add any billing notes or special instructions..."
                  />
                </div>
              </>
            )}
          </div>

          {!invitationLink ? (
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => handleSubmit(false)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Save Account
                  </>
                )}
              </button>
              <button
                onClick={() => handleSubmit(true)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Save & Send Invite
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-900 mb-1">User Created & Invitation Sent!</p>
                <p className="text-sm text-green-700">
                  An invitation email has been sent to {formData.email}. Share the link below if needed.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invitation Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={invitationLink}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  onClose();
                  onSuccess();
                }}
                className="w-full px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
