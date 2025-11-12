import { useState, useEffect } from 'react';
import { X, Loader2, Users, Cpu, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminService } from '../../services/admin';
import { highLevelService } from '../../services/highlevel';

interface BulkOperationsModalProps {
  selectedUserIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

interface Agent {
  id: string;
  name: string;
  description: string | null;
}

interface PhoneNumber {
  id: string;
  phone_number: string;
  label: string | null;
}

export function BulkOperationsModal({
  selectedUserIds,
  onClose,
  onSuccess,
}: BulkOperationsModalProps) {
  const [operation, setOperation] = useState<'agents' | 'phones'>('agents');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [selectedPhoneIds, setSelectedPhoneIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [agentsResult, phonesResult] = await Promise.all([
        supabase.from('agents').select('*').eq('is_active', true),
        supabase.from('phone_numbers').select('*').eq('is_active', true),
      ]);

      if (agentsResult.data) setAgents(agentsResult.data);
      if (phonesResult.data) setPhoneNumbers(phonesResult.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      let result;
      if (operation === 'agents') {
        if (selectedAgentIds.length === 0) {
          setError('Please select at least one agent');
          setLoading(false);
          return;
        }
        result = await adminService.bulkAssignAgents(selectedUserIds, selectedAgentIds);
      } else {
        if (selectedPhoneIds.length === 0) {
          setError('Please select at least one phone number');
          setLoading(false);
          return;
        }
        result = await adminService.bulkAssignPhoneNumbers(selectedUserIds, selectedPhoneIds);
      }

      if (result.success > 0) {
        onSuccess();
        onClose();
      } else {
        setError(`Failed to assign. Errors: ${result.errors.join(', ')}`);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string, type: 'agent' | 'phone') => {
    if (type === 'agent') {
      setSelectedAgentIds((prev) =>
        prev.includes(id) ? prev.filter((aid) => aid !== id) : [...prev, id]
      );
    } else {
      setSelectedPhoneIds((prev) =>
        prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Bulk Operations ({selectedUserIds.length} users)
            </h2>
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

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Operation Type
            </label>
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setOperation('agents')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  operation === 'agents' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                }`}
              >
                <Cpu className="h-4 w-4" />
                Assign Agents
              </button>
              <button
                onClick={() => setOperation('phones')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  operation === 'phones' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                }`}
              >
                <Phone className="h-4 w-4" />
                Assign Phone Numbers
              </button>
            </div>
          </div>

          {loadingData ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 text-blue-600 mx-auto mb-2 animate-spin" />
              <p className="text-gray-600">Loading...</p>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Select {operation === 'agents' ? 'Agents' : 'Phone Numbers'} to Assign
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {operation === 'agents' ? (
                  agents.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No active agents available</p>
                  ) : (
                    agents.map((agent) => (
                      <label
                        key={agent.id}
                        className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAgentIds.includes(agent.id)}
                          onChange={() => toggleSelection(agent.id, 'agent')}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{agent.name}</p>
                          {agent.description && (
                            <p className="text-sm text-gray-600">{agent.description}</p>
                          )}
                        </div>
                      </label>
                    ))
                  )
                ) : phoneNumbers.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No active phone numbers available</p>
                ) : (
                  phoneNumbers.map((phone) => (
                    <label
                      key={phone.id}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPhoneIds.includes(phone.id)}
                        onChange={() => toggleSelection(phone.id, 'phone')}
                        className="flex-shrink-0"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 font-mono">{phone.phone_number}</p>
                        {phone.label && <p className="text-sm text-gray-600">{phone.label}</p>}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>Selected:</strong>{' '}
              {operation === 'agents'
                ? `${selectedAgentIds.length} agent(s)`
                : `${selectedPhoneIds.length} phone number(s)`}{' '}
              will be assigned to {selectedUserIds.length} user(s)
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={loading || loadingData}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign to Selected Users'
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
        </div>
      </div>
    </div>
  );
}
