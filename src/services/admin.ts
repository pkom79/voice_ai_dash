import { supabase } from '../lib/supabase';

export interface UserInvitation {
  id: string;
  invited_by: string;
  email: string;
  invitation_token: string;
  role: 'client' | 'admin';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  accepted_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ActiveSession {
  id: string;
  user_id: string;
  session_token: string;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  location_city: string | null;
  location_country: string | null;
  last_activity_at: string;
  created_at: string;
}

export interface BulkAssignmentResult {
  success: number;
  failed: number;
  errors: string[];
}

class AdminService {
  async generateInvitationToken(): Promise<string> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async createUserInvitation(
    email: string,
    role: 'client' | 'admin' = 'client',
    expiresInDays: number = 7
  ): Promise<UserInvitation | null> {
    try {
      const token = await this.generateInvitationToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const { data, error } = await supabase
        .from('user_invitations')
        .insert({
          email,
          invitation_token: token,
          role,
          expires_at: expiresAt.toISOString(),
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.rpc('log_admin_action', {
        p_action: 'invite_user',
        p_details: { email, role },
      });

      return data;
    } catch (error) {
      console.error('Error creating invitation:', error);
      return null;
    }
  }

  async getInvitationByToken(token: string): Promise<UserInvitation | null> {
    try {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('invitation_token', token)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching invitation:', error);
      return null;
    }
  }

  async acceptInvitation(token: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('invitation_token', token);

      return !error;
    } catch (error) {
      console.error('Error accepting invitation:', error);
      return false;
    }
  }

  async revokeInvitation(invitationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_invitations')
        .update({
          status: 'revoked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invitationId);

      return !error;
    } catch (error) {
      console.error('Error revoking invitation:', error);
      return false;
    }
  }

  async listInvitations(): Promise<UserInvitation[]> {
    try {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error listing invitations:', error);
      return [];
    }
  }

  async createUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    businessName?: string;
    phoneNumber?: string;
    role?: 'client' | 'admin';
  }): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user');
      }

      return { success: true, userId: result.userId };
    } catch (error: any) {
      console.error('Error creating user:', error);
      return { success: false, error: error.message };
    }
  }

  async suspendUser(userId: string, suspend: boolean): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !suspend, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;

      await supabase.rpc('log_admin_action', {
        p_action: suspend ? 'suspend_user' : 'unsuspend_user',
        p_target_user_id: userId,
      });

      return true;
    } catch (error) {
      console.error('Error suspending user:', error);
      return false;
    }
  }

  async bulkAssignAgents(
    userIds: string[],
    agentIds: string[]
  ): Promise<BulkAssignmentResult> {
    const result: BulkAssignmentResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const userId of userIds) {
      for (const agentId of agentIds) {
        try {
          const { error } = await supabase
            .from('user_agents')
            .upsert(
              {
                user_id: userId,
                agent_id: agentId,
              },
              { onConflict: 'user_id,agent_id' }
            );

          if (error) throw error;
          result.success++;
        } catch (error: any) {
          result.failed++;
          result.errors.push(`User ${userId}, Agent ${agentId}: ${error.message}`);
        }
      }
    }

    await supabase.rpc('log_admin_action', {
      p_action: 'bulk_assign_agents',
      p_details: {
        user_count: userIds.length,
        agent_count: agentIds.length,
        success: result.success,
        failed: result.failed,
      },
    });

    return result;
  }

  async bulkAssignPhoneNumbers(
    userIds: string[],
    phoneNumberIds: string[]
  ): Promise<BulkAssignmentResult> {
    const result: BulkAssignmentResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const userId of userIds) {
      for (const phoneNumberId of phoneNumberIds) {
        try {
          const { error } = await supabase
            .from('user_phone_numbers')
            .upsert(
              {
                user_id: userId,
                phone_number_id: phoneNumberId,
              },
              { onConflict: 'user_id,phone_number_id' }
            );

          if (error) throw error;
          result.success++;
        } catch (error: any) {
          result.failed++;
          result.errors.push(`User ${userId}, Phone ${phoneNumberId}: ${error.message}`);
        }
      }
    }

    await supabase.rpc('log_admin_action', {
      p_action: 'bulk_assign_phone_numbers',
      p_details: {
        user_count: userIds.length,
        phone_count: phoneNumberIds.length,
        success: result.success,
        failed: result.failed,
      },
    });

    return result;
  }

  async getUserSessions(userId: string): Promise<ActiveSession[]> {
    try {
      const { data, error } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      return [];
    }
  }

  async terminateSession(sessionId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('active_sessions')
        .delete()
        .eq('id', sessionId);

      return !error;
    } catch (error) {
      console.error('Error terminating session:', error);
      return false;
    }
  }

  async updateBillingModel(
    userId: string,
    paymentModel: 'flat_fee' | 'pay_per_use',
    customCostPerMinute?: number,
    adminNotes?: string
  ): Promise<boolean> {
    try {
      const updateData: any = {
        payment_model: paymentModel,
        updated_at: new Date().toISOString(),
      };

      if (customCostPerMinute !== undefined) {
        updateData.custom_cost_per_minute = customCostPerMinute;
      }

      if (adminNotes !== undefined) {
        updateData.admin_notes = adminNotes;
      }

      const { error } = await supabase
        .from('billing_accounts')
        .update(updateData)
        .eq('user_id', userId);

      if (error) throw error;

      await supabase.rpc('log_admin_action', {
        p_action: 'update_billing_model',
        p_target_user_id: userId,
        p_details: {
          payment_model: paymentModel,
          custom_cost_per_minute: customCostPerMinute,
        },
      });

      return true;
    } catch (error) {
      console.error('Error updating billing model:', error);
      return false;
    }
  }

  async getSystemHealth(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalConnections: number;
    activeConnections: number;
    failedSyncs: number;
    lastSync: string | null;
  }> {
    try {
      const [usersResult, connectionsResult, syncsResult] = await Promise.all([
        supabase.from('users').select('id, is_active', { count: 'exact', head: true }),
        supabase.from('api_keys').select('id, is_active', { count: 'exact', head: true }),
        supabase
          .from('sync_status')
          .select('last_sync_at, last_sync_status')
          .order('last_sync_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const { data: activeUsersData } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      const { data: activeConnectionsData } = await supabase
        .from('api_keys')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      const { data: failedSyncsData } = await supabase
        .from('sync_status')
        .select('id', { count: 'exact', head: true })
        .eq('last_sync_status', 'failure');

      return {
        totalUsers: usersResult.count || 0,
        activeUsers: activeUsersData?.length || 0,
        totalConnections: connectionsResult.count || 0,
        activeConnections: activeConnectionsData?.length || 0,
        failedSyncs: failedSyncsData?.length || 0,
        lastSync: syncsResult.data?.last_sync_at || null,
      };
    } catch (error) {
      console.error('Error fetching system health:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        totalConnections: 0,
        activeConnections: 0,
        failedSyncs: 0,
        lastSync: null,
      };
    }
  }

  async getAuditLogs(filters?: {
    adminId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    try {
      let query = supabase
        .from('audit_logs')
        .select(`
          *,
          admin:admin_user_id(first_name, last_name),
          target:target_user_id(first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.adminId) {
        query = query.eq('admin_user_id', filters.adminId);
      }

      if (filters?.action) {
        query = query.eq('action', filters.action);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }
  }
}

export const adminService = new AdminService();
