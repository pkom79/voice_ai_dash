import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { oauthService } from '../services/oauth';
import { highLevelService } from '../services/highlevel';
import { adminService } from '../services/admin';
import {
  Users,
  Search,
  Link2,
  Unlink,
  Cpu,
  XCircle,
  Loader2,
  AlertCircle,
  UserPlus,
  Mail,
  Eye,
  DollarSign,
  Ban,
  CheckCircle2,
  List,
  Phone,
  BarChart3,
} from 'lucide-react';
import { CreateUserModal } from '../components/admin/CreateUserModal';
import { BulkOperationsModal } from '../components/admin/BulkOperationsModal';
import { UserSessionsModal } from '../components/admin/UserSessionsModal';
import { BillingConfigModal } from '../components/admin/BillingConfigModal';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { format } from 'date-fns';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string | null;
  role: 'client' | 'admin';
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

interface UserWithStatus extends User {
  hasConnection?: boolean;
  hasAgents?: boolean;
  hasPhoneNumbers?: boolean;
  inboundPlan?: string | null;
  outboundPlan?: string | null;
  walletCents?: number;
  monthSpentCents?: number;
  billingStatus?: string;
}

interface OAuthConnection {
  id: string;
  location_id: string | null;
  location_name: string | null;
  token_expires_at: string;
  is_active: boolean;
}

interface HighLevelAgent {
  id: string;
  name: string;
  description?: string;
}

export function AdminUsersPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [usersWithStatus, setUsersWithStatus] = useState<UserWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userConnection, setUserConnection] = useState<OAuthConnection | null>(null);
  const [availableAgents, setAvailableAgents] = useState<HighLevelAgent[]>([]);
  const [assignedAgents, setAssignedAgents] = useState<any[]>([]);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadUserStatuses();
  }, [users]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserStatuses = async () => {
    if (users.length === 0) {
      setUsersWithStatus([]);
      return;
    }

    try {
      const statusPromises = users.map(async (user) => {
        try {
          const connection = await oauthService.getUserConnection(user.id);
          const agents = await highLevelService.getUserAgents(user.id);

          const { count: phoneCount } = await supabase
            .from('user_phone_numbers')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

          // Load billing information
          const { data: billing } = await supabase
            .from('billing_accounts')
            .select('inbound_plan, outbound_plan, wallet_cents, month_spent_cents')
            .eq('user_id', user.id)
            .maybeSingle();

          let billingStatus = 'ACTIVE';
          if (billing) {
            const hasPPU = billing.inbound_plan === 'inbound_pay_per_use' || billing.outbound_plan === 'outbound_pay_per_use';
            if (hasPPU && billing.wallet_cents < billing.month_spent_cents) {
              billingStatus = 'LOW BALANCE';
            }
          }

          return {
            ...user,
            hasConnection: !!connection,
            hasAgents: agents.length > 0,
            hasPhoneNumbers: (phoneCount || 0) > 0,
            inboundPlan: billing?.inbound_plan,
            outboundPlan: billing?.outbound_plan,
            walletCents: billing?.wallet_cents || 0,
            monthSpentCents: billing?.month_spent_cents || 0,
            billingStatus,
          };
        } catch (error) {
          console.error(`Error loading status for user ${user.id}:`, error);
          return {
            ...user,
            hasConnection: false,
            hasAgents: false,
            hasPhoneNumbers: false,
          };
        }
      });

      const usersWithStatusData = await Promise.all(statusPromises);
      setUsersWithStatus(usersWithStatusData);
    } catch (error) {
      console.error('Error loading user statuses:', error);
      setUsersWithStatus(users.map(user => ({ ...user, hasConnection: false, hasAgents: false, hasPhoneNumbers: false })));
    }
  };

  const filteredUsers = usersWithStatus.filter(
    (user) =>
      user.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.business_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectUser = async (user: User) => {
    setSelectedUser(user);
    setLoadingConnection(true);

    try {
      const connection = await oauthService.getUserConnection(user.id);
      setUserConnection(connection);

      if (connection) {
        const agents = await highLevelService.getUserAgents(user.id);
        setAssignedAgents(agents);
      } else {
        setAssignedAgents([]);
      }
    } catch (error) {
      console.error('Error loading user connection:', error);
    } finally {
      setLoadingConnection(false);
    }
  };

  const handleConnectHighLevel = async () => {
    if (!selectedUser || !profile) return;

    try {
      const authUrl = await oauthService.generateAuthorizationUrl(selectedUser.id, profile.id);
      console.log('Generated OAuth URL:', authUrl);
      console.log('Environment AUTH_URL:', import.meta.env.VITE_HIGHLEVEL_AUTH_URL);
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating OAuth:', error);
      alert('Failed to initiate HighLevel connection');
    }
  };

  const handleDisconnect = async () => {
    if (!selectedUser) return;

    setConfirmModal({
      isOpen: true,
      title: 'Disconnect HighLevel',
      message: 'Are you sure you want to disconnect this user from HighLevel? This will remove their connection and agent assignments.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await oauthService.disconnectUser(selectedUser.id);
          setUserConnection(null);
          setAssignedAgents([]);
          await loadUserStatuses();
          setConfirmModal({ ...confirmModal, isOpen: false });
          alert('Successfully disconnected from HighLevel');
        } catch (error) {
          console.error('Error disconnecting:', error);
          alert('Failed to disconnect from HighLevel');
          setConfirmModal({ ...confirmModal, isOpen: false });
        }
      },
    });
  };

  const handleManageAgents = async () => {
    if (!selectedUser || !userConnection) return;

    setLoadingAgents(true);
    setShowAgentModal(true);

    try {
      const agents = await highLevelService.fetchAgents(selectedUser.id);
      setAvailableAgents(agents);
    } catch (error) {
      console.error('Error fetching agents:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to fetch agents from HighLevel: ${errorMessage}\n\nPlease check the browser console for more details.`);
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleAssignAgent = async (agentId: string, agentName: string, description?: string) => {
    if (!selectedUser) return;

    try {
      const success = await highLevelService.assignAgentToUser(
        selectedUser.id,
        agentId,
        agentName,
        description
      );

      if (success) {
        const agents = await highLevelService.getUserAgents(selectedUser.id);
        setAssignedAgents(agents);
        loadUserStatuses();
      } else {
        alert('Failed to assign agent');
      }
    } catch (error) {
      console.error('Error assigning agent:', error);
      alert('Failed to assign agent');
    }
  };

  const handleUnassignAgent = async (agentId: string, agentName: string) => {
    if (!selectedUser) return;

    setConfirmModal({
      isOpen: true,
      title: 'Unassign Agent',
      message: `Are you sure you want to unassign "${agentName}" from this user?`,
      type: 'warning',
      onConfirm: async () => {
        try {
          const success = await highLevelService.unassignAgentFromUser(
            selectedUser.id,
            agentId
          );

          if (success) {
            const agents = await highLevelService.getUserAgents(selectedUser.id);
            setAssignedAgents(agents);
            loadUserStatuses();
            setConfirmModal({ ...confirmModal, isOpen: false });
            alert('Agent unassigned successfully');
          } else {
            setConfirmModal({ ...confirmModal, isOpen: false });
            alert('Failed to unassign agent');
          }
        } catch (error) {
          console.error('Error unassigning agent:', error);
          setConfirmModal({ ...confirmModal, isOpen: false });
          alert('Failed to unassign agent');
        }
      },
    });
  };

  const handleSendInvite = async (userId: string) => {
    setSendingInvite(userId);

    try {
      const result = await adminService.sendInvitationToUser(userId);

      if (result.success) {
        alert('Invitation sent successfully! The user will receive an email to set up their password.');
      } else {
        alert(`Failed to send invitation: ${result.error}`);
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      alert('Failed to send invitation');
    } finally {
      setSendingInvite(null);
    }
  };

  const handleSuspendUser = async (suspend: boolean) => {
    if (!selectedUser) return;

    const action = suspend ? 'suspend' : 'unsuspend';

    setConfirmModal({
      isOpen: true,
      title: `${suspend ? 'Suspend' : 'Unsuspend'} User`,
      message: `Are you sure you want to ${action} this user? ${suspend ? 'This will prevent them from accessing the system.' : 'This will restore their access to the system.'}`,
      type: suspend ? 'danger' : 'info',
      onConfirm: async () => {
        const success = await adminService.suspendUser(selectedUser.id, suspend);
        if (success) {
          await loadUsers();
          if (selectedUser.id === selectedUser.id) {
            handleSelectUser({ ...selectedUser, is_active: !suspend });
          }
          setConfirmModal({ ...confirmModal, isOpen: false });
          alert(`User ${action}ed successfully`);
        } else {
          setConfirmModal({ ...confirmModal, isOpen: false });
          alert(`Failed to ${action} user`);
        }
      },
    });
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAllUsers = () => {
    if (selectedUserIds.length === filteredUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map(u => u.id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">Manage users, connections, agents, and billing</p>
        </div>
        <button
          onClick={() => setShowCreateUserModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Create New User
        </button>
      </div>

      {selectedUserIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <List className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-blue-900">
                {selectedUserIds.length} user{selectedUserIds.length !== 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Bulk Assign
              </button>
              <button
                onClick={() => setSelectedUserIds([])}
                className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Users ({filteredUsers.length})</h2>
              </div>
              {filteredUsers.length > 0 && (
                <button
                  onClick={selectAllUsers}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {selectedUserIds.length === filteredUsers.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center">
                <Loader2 className="h-8 w-8 text-blue-600 mx-auto mb-2 animate-spin" />
                <p className="text-gray-600">Loading users...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No users found</div>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={`p-4 transition-colors ${
                    selectedUser?.id === user.id
                      ? 'bg-blue-50 border-l-4 border-blue-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0"
                    />
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handleSelectUser(user)}
                    >
                      {/* Business Name - Prominent Display */}
                      {user.business_name && (
                        <h3 className="font-semibold text-gray-900 text-base mb-0.5">
                          {user.business_name}
                        </h3>
                      )}

                      {/* User Name - Secondary */}
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-sm text-gray-600">
                          {user.first_name} {user.last_name}
                        </p>
                        <span className="text-xs text-gray-400 uppercase font-medium">
                          {user.role}
                        </span>
                      </div>

                      {/* Comprehensive Status Tags - ALL CAPS */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {/* Account Status */}
                        {!user.is_active ? (
                          <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded uppercase">
                            SUSPENDED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded uppercase">
                            ACTIVE
                          </span>
                        )}

                        {/* Billing Plan Tags */}
                        {user.inboundPlan === 'inbound_unlimited' && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded uppercase">
                            INBOUND UNL
                          </span>
                        )}
                        {user.inboundPlan === 'inbound_pay_per_use' && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-cyan-100 text-cyan-700 rounded uppercase">
                            INBOUND PPU
                          </span>
                        )}
                        {user.outboundPlan === 'outbound_pay_per_use' && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-teal-100 text-teal-700 rounded uppercase">
                            OUTBOUND PPU
                          </span>
                        )}

                        {/* Billing Status */}
                        {user.billingStatus === 'LOW BALANCE' && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-orange-100 text-orange-700 rounded uppercase">
                            LOW BALANCE
                          </span>
                        )}

                        {/* Integration Status */}
                        {user.hasConnection && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-700 rounded uppercase">
                            HL CONNECTED
                          </span>
                        )}
                        {user.hasAgents && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded uppercase">
                            AGENT
                          </span>
                        )}
                        {user.hasPhoneNumbers && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 rounded uppercase">
                            PHONE
                          </span>
                        )}
                      </div>

                      {/* Last Login */}
                      {user.last_login && (
                        <p className="text-xs text-gray-500 mt-2">
                          Last login: {format(new Date(user.last_login), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          {!selectedUser ? (
            <div className="p-12 text-center text-gray-500">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p>Select a user to view their HighLevel connection</p>
            </div>
          ) : (
            <>
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-1">
                      {selectedUser.first_name} {selectedUser.last_name}
                    </h2>
                    <p className="text-sm text-gray-600">{selectedUser.business_name || 'No business name'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.location.href = `/calls?userId=${selectedUser.id}`}
                      className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                      title="View Calls"
                    >
                      <Phone className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => window.location.href = `/dashboard?userId=${selectedUser.id}`}
                      className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="View Dashboard"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setShowSessionsModal(true)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="View Sessions"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setShowBillingModal(true)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Billing Config"
                    >
                      <DollarSign className="h-4 w-4" />
                    </button>
                    {!selectedUser.last_login && (
                      <button
                        onClick={() => handleSendInvite(selectedUser.id)}
                        disabled={sendingInvite === selectedUser.id}
                        className="p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
                        title="Send Invitation"
                      >
                        {sendingInvite === selectedUser.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleSuspendUser(!selectedUser.is_active)}
                      className={`p-2 rounded-lg transition-colors ${
                        selectedUser.is_active
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                      title={selectedUser.is_active ? 'Suspend User' : 'Unsuspend User'}
                    >
                      {selectedUser.is_active ? (
                        <Ban className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {loadingConnection ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 text-blue-600 mx-auto mb-2 animate-spin" />
                    <p className="text-gray-600">Loading connection status...</p>
                  </div>
                ) : userConnection ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                          <Link2 className="h-5 w-5 text-green-600" />
                          HighLevel Connected
                        </h3>
                        <button
                          onClick={handleDisconnect}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Unlink className="h-4 w-4" />
                          Disconnect
                        </button>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                        {userConnection.location_id && (
                          <div>
                            <span className="font-medium text-gray-700">Location:</span>
                            <span className="ml-2 text-gray-900">
                              {userConnection.location_name || userConnection.location_id}
                            </span>
                            {!userConnection.location_name && (
                              <span className="ml-2 text-xs text-gray-500">(ID)</span>
                            )}
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-gray-700">Token Expires:</span>
                          <span className="ml-2 text-gray-900">
                            {format(new Date(userConnection.token_expires_at), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Status:</span>
                          <span className={`ml-2 ${userConnection.is_active ? 'text-green-600' : 'text-red-600'}`}>
                            {userConnection.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                          <Cpu className="h-5 w-5 text-blue-600" />
                          Assigned Agents
                        </h3>
                        <button
                          onClick={handleManageAgents}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Manage Agents
                        </button>
                      </div>

                      {assignedAgents.length === 0 ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-yellow-900">No agents assigned</p>
                            <p className="text-xs text-yellow-700 mt-1">
                              Click "Manage Agents" to assign HighLevel agents to this user
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {assignedAgents.map((assignment: any) => (
                            <div
                              key={assignment.agent_id}
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">{assignment.agents.name}</p>
                                {assignment.agents.description && (
                                  <p className="text-sm text-gray-600">{assignment.agents.description}</p>
                                )}
                              </div>
                              <button
                                onClick={() => handleUnassignAgent(assignment.agents.id, assignment.agents.name)}
                                className="ml-3 p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Unassign agent"
                              >
                                <XCircle className="h-5 w-5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                      <Unlink className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="font-semibold text-gray-900 mb-2">Not Connected</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        This user hasn't connected their HighLevel account yet
                      </p>
                      <button
                        onClick={handleConnectHighLevel}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Link2 className="h-4 w-4" />
                        Connect HighLevel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showCreateUserModal && (
        <CreateUserModal
          onClose={() => setShowCreateUserModal(false)}
          onSuccess={() => {
            loadUsers();
          }}
        />
      )}


      {showBulkModal && selectedUserIds.length > 0 && (
        <BulkOperationsModal
          selectedUserIds={selectedUserIds}
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => {
            loadUsers();
            setSelectedUserIds([]);
          }}
        />
      )}

      {showSessionsModal && selectedUser && (
        <UserSessionsModal
          userId={selectedUser.id}
          userName={`${selectedUser.first_name} ${selectedUser.last_name}`}
          onClose={() => setShowSessionsModal(false)}
        />
      )}

      {showBillingModal && selectedUser && (
        <BillingConfigModal
          userId={selectedUser.id}
          userName={`${selectedUser.first_name} ${selectedUser.last_name}`}
          onClose={() => setShowBillingModal(false)}
          onSuccess={() => {}}
        />
      )}

      {showAgentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Manage Agents</h2>
              <p className="text-sm text-gray-600 mt-1">
                Assign HighLevel agents to {selectedUser?.first_name} {selectedUser?.last_name}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingAgents ? (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 text-blue-600 mx-auto mb-2 animate-spin" />
                  <p className="text-gray-600">Loading agents from HighLevel...</p>
                </div>
              ) : availableAgents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Cpu className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="mb-2">No agents found in HighLevel</p>
                  <p className="text-sm text-gray-400">Check the browser console for API details</p>
                  <button
                    onClick={() => handleManageAgents()}
                    className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableAgents.map((agent) => {
                    const isAssigned = assignedAgents.some(
                      (a: any) => a.agents.highlevel_agent_id === agent.id
                    );

                    return (
                      <div
                        key={agent.id}
                        className={`p-4 border rounded-lg transition-colors ${
                          isAssigned
                            ? 'bg-green-50 border-green-300'
                            : 'bg-white border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">{agent.name}</h3>
                            {agent.description && (
                              <p className="text-sm text-gray-600 mt-1">{agent.description}</p>
                            )}
                          </div>
                          {isAssigned ? (
                            <button
                              onClick={() => {
                                const assignment = assignedAgents.find(
                                  (a: any) => a.agents.highlevel_agent_id === agent.id
                                );
                                if (assignment) {
                                  handleUnassignAgent(assignment.agents.id, assignment.agents.name);
                                }
                              }}
                              className="px-4 py-2 rounded-lg font-medium transition-colors bg-red-100 text-red-700 hover:bg-red-200"
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAssignAgent(agent.id, agent.name, agent.description)}
                              className="px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
                            >
                              Assign
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowAgentModal(false)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
}
