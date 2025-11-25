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

// Unified audit log interface that combines all log sources
export interface UnifiedAuditLog {
  id: string;
  timestamp: string;
  eventType: 'admin_action' | 'connection_event' | 'activity' | 'integration_error';
  category: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: 'manual' | 'auto' | 'github_action';
  user?: { id: string; name: string } | null;
  targetUser?: { id: string; name: string } | null;
  metadata: Record<string, any>;
  resolved?: boolean;
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
    expiresInDays: number = 7,
    billingConfig?: {
      inboundPlan: string | null;
      outboundPlan: string | null;
      inboundRateCents: number;
      outboundRateCents: number;
    }
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
          inbound_plan: billingConfig?.inboundPlan,
          outbound_plan: billingConfig?.outboundPlan,
          inbound_rate_cents: billingConfig?.inboundRateCents,
          outbound_rate_cents: billingConfig?.outboundRateCents,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.rpc('log_admin_action', {
        p_action: 'invite_user',
        p_details: { email, role, billingConfig },
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
    firstName: string;
    lastName: string;
    businessName: string;
    phoneNumber?: string;
    role?: 'client' | 'admin';
    inboundPlan?: string | null;
    outboundPlan?: string | null;
    inboundRateCents?: number;
    outboundRateCents?: number;
    adminNotes?: string;
    sendInvite?: boolean;
    stripeCustomerId?: string;
  }): Promise<{ success: boolean; userId?: string; invitationLink?: string; error?: string }> {
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

      return {
        success: true,
        userId: result.userId,
        invitationLink: result.invitationLink || undefined
      };
    } catch (error: any) {
      console.error('Error creating user:', error);
      return { success: false, error: error.message };
    }
  }

  async sendInvitationToUser(userId: string): Promise<{ success: boolean; invitationLink?: string; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-user-invitation`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      return {
        success: true,
        invitationLink: result.invitationLink
      };
    } catch (error: any) {
      console.error('Error sending invitation:', error);
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

  async deleteUser(userId: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }

      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
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
      // Calculate 30 minutes ago for active session check
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

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

      // Active users: count distinct users with recent session activity (last 30 minutes)
      const { data: activeSessionsData, error: sessionsError } = await supabase
        .from('active_sessions')
        .select('user_id')
        .gte('last_activity_at', thirtyMinutesAgo);

      const activeUsers = activeSessionsData
        ? new Set(activeSessionsData.map(s => s.user_id)).size
        : 0;

      // Active connections: count OAuth connections for client users only (not admins)
      // with valid tokens (not expired) and is_active = true
      const { data: activeConnectionsData, error: connectionsError } = await supabase
        .from('api_keys')
        .select(`
          id,
          user_id,
          users!inner(role)
        `)
        .eq('is_active', true)
        .not('user_id', 'is', null)
        .gt('token_expires_at', new Date().toISOString())
        .eq('users.role', 'client');

      const { data: failedSyncsData } = await supabase
        .from('sync_status')
        .select('id', { count: 'exact', head: true })
        .eq('last_sync_status', 'failure');

      return {
        totalUsers: usersResult.count || 0,
        activeUsers,
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

  async getOAuthConnections(statusFilter: 'all' | 'active' | 'expired' | 'errors' = 'all') {
    try {
      let query = supabase
        .from('api_keys')
        .select(`
          id,
          location_name,
          location_id,
          token_expires_at,
          is_active,
          created_at,
          updated_at,
          last_used_at,
          user_id,
          users!inner(
            id,
            first_name,
            last_name,
            business_name,
            role
          )
        `)
        .not('user_id', 'is', null)
        .eq('users.role', 'client')
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Calculate status for each connection
      const connectionsWithStatus = (data || []).map(conn => {
        const now = new Date();
        const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
        const isExpired = expiresAt ? expiresAt < now : false;
        const isExpiringSoon = expiresAt ? expiresAt < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) && !isExpired : false;

        let status: 'healthy' | 'expiring_soon' | 'expired' | 'inactive' = 'healthy';
        if (!conn.is_active) {
          status = 'inactive';
        } else if (isExpired) {
          status = 'expired';
        } else if (isExpiringSoon) {
          status = 'expiring_soon';
        }

        return {
          ...conn,
          status,
          isExpired,
          isExpiringSoon,
        };
      });

      // Apply status filter
      if (statusFilter === 'active') {
        return connectionsWithStatus.filter(c => c.is_active && !c.isExpired);
      } else if (statusFilter === 'expired') {
        return connectionsWithStatus.filter(c => c.isExpired);
      } else if (statusFilter === 'errors') {
        return connectionsWithStatus.filter(c => !c.is_active || c.isExpired);
      }

      return connectionsWithStatus;
    } catch (error) {
      console.error('Error fetching OAuth connections:', error);
      return [];
    }
  }

  async getAuditLogs(filters?: {
    adminId?: string;
    targetUserId?: string;
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

      if (filters?.targetUserId) {
        query = query.eq('target_user_id', filters.targetUserId);
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

  async getUnifiedAuditLogs(filters?: {
    category?: 'all' | 'connections' | 'errors' | 'admin';
    source?: 'all' | 'manual' | 'auto' | 'github_action';
    severity?: string;
    userId?: string;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<{ logs: UnifiedAuditLog[]; counts: { all: number; connections: number; errors: number } }> {
    try {
      const limit = filters?.limit || 100;
      const logs: UnifiedAuditLog[] = [];

      // 1. Fetch audit_logs (admin actions and system events)
      if (!filters?.category || filters.category === 'all' || filters.category === 'admin') {
        let auditQuery = supabase
          .from('audit_logs')
          .select(`
            id, action, details, created_at, source, severity,
            admin:admin_user_id(id, first_name, last_name),
            target:target_user_id(id, first_name, last_name)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (filters?.source && filters.source !== 'all') {
          auditQuery = auditQuery.eq('source', filters.source);
        }
        if (filters?.startDate) {
          auditQuery = auditQuery.gte('created_at', filters.startDate.toISOString());
        }
        if (filters?.endDate) {
          auditQuery = auditQuery.lte('created_at', filters.endDate.toISOString());
        }

        const { data: auditData } = await auditQuery;
        
        if (auditData) {
          for (const log of auditData) {
            const adminName = log.admin ? `${log.admin.first_name || ''} ${log.admin.last_name || ''}`.trim() : 'System';
            const targetName = log.target ? `${log.target.first_name || ''} ${log.target.last_name || ''}`.trim() : null;
            
            logs.push({
              id: log.id,
              timestamp: log.created_at,
              eventType: 'admin_action',
              category: 'admin',
              title: this.formatActionTitle(log.action),
              description: this.formatActionDescription(log.action, adminName, targetName, log.details),
              severity: (log.severity as 'info' | 'warning' | 'error' | 'critical') || 'info',
              source: (log.source as 'manual' | 'auto' | 'github_action') || 'manual',
              user: log.admin ? { id: log.admin.id, name: adminName } : null,
              targetUser: log.target ? { id: log.target.id, name: targetName || '' } : null,
              metadata: log.details || {},
            });
          }
        }
      }

      // 2. Fetch user_connection_events
      if (!filters?.category || filters.category === 'all' || filters.category === 'connections') {
        let connQuery = supabase
          .from('user_connection_events')
          .select(`
            id, event_type, location_id, location_name, token_expires_at, 
            error_message, metadata, created_at, source,
            user:user_id(id, first_name, last_name)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (filters?.source && filters.source !== 'all') {
          connQuery = connQuery.eq('source', filters.source);
        }
        if (filters?.userId) {
          connQuery = connQuery.eq('user_id', filters.userId);
        }
        if (filters?.startDate) {
          connQuery = connQuery.gte('created_at', filters.startDate.toISOString());
        }
        if (filters?.endDate) {
          connQuery = connQuery.lte('created_at', filters.endDate.toISOString());
        }

        const { data: connData } = await connQuery;
        
        if (connData) {
          for (const event of connData) {
            const userName = event.user ? `${event.user.first_name || ''} ${event.user.last_name || ''}`.trim() : 'Unknown';
            
            logs.push({
              id: event.id,
              timestamp: event.created_at,
              eventType: 'connection_event',
              category: 'connections',
              title: this.formatConnectionTitle(event.event_type),
              description: this.formatConnectionDescription(event.event_type, userName, event.location_name, event.error_message),
              severity: event.error_message ? 'error' : 'info',
              source: (event.source as 'manual' | 'auto' | 'github_action') || 'manual',
              user: event.user ? { id: event.user.id, name: userName } : null,
              targetUser: null,
              metadata: { 
                ...event.metadata, 
                location_id: event.location_id, 
                location_name: event.location_name,
                token_expires_at: event.token_expires_at 
              },
            });
          }
        }
      }

      // 3. Fetch user_activity_logs (sync events, etc.)
      if (!filters?.category || filters.category === 'all') {
        let activityQuery = supabase
          .from('user_activity_logs')
          .select(`
            id, event_type, event_category, event_name, description, 
            metadata, severity, created_at, source,
            user:user_id(id, first_name, last_name)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (filters?.source && filters.source !== 'all') {
          activityQuery = activityQuery.eq('source', filters.source);
        }
        if (filters?.severity) {
          activityQuery = activityQuery.eq('severity', filters.severity);
        }
        if (filters?.userId) {
          activityQuery = activityQuery.eq('user_id', filters.userId);
        }
        if (filters?.startDate) {
          activityQuery = activityQuery.gte('created_at', filters.startDate.toISOString());
        }
        if (filters?.endDate) {
          activityQuery = activityQuery.lte('created_at', filters.endDate.toISOString());
        }

        const { data: activityData } = await activityQuery;
        
        if (activityData) {
          for (const log of activityData) {
            const userName = log.user ? `${log.user.first_name || ''} ${log.user.last_name || ''}`.trim() : 'Unknown';
            
            logs.push({
              id: log.id,
              timestamp: log.created_at,
              eventType: 'activity',
              category: log.event_category || 'activity',
              title: this.formatActivityTitle(log.event_name),
              description: log.description,
              severity: (log.severity as 'info' | 'warning' | 'error' | 'critical') || 'info',
              source: (log.source as 'manual' | 'auto' | 'github_action') || 'manual',
              user: log.user ? { id: log.user.id, name: userName } : null,
              targetUser: null,
              metadata: log.metadata || {},
            });
          }
        }
      }

      // 4. Fetch user_integration_errors
      if (!filters?.category || filters.category === 'all' || filters.category === 'errors') {
        let errorQuery = supabase
          .from('user_integration_errors')
          .select(`
            id, error_type, error_source, error_message, error_code,
            request_data, response_data, resolved, resolved_at, created_at,
            user:user_id(id, first_name, last_name)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (filters?.userId) {
          errorQuery = errorQuery.eq('user_id', filters.userId);
        }
        if (filters?.startDate) {
          errorQuery = errorQuery.gte('created_at', filters.startDate.toISOString());
        }
        if (filters?.endDate) {
          errorQuery = errorQuery.lte('created_at', filters.endDate.toISOString());
        }

        const { data: errorData } = await errorQuery;
        
        if (errorData) {
          for (const err of errorData) {
            const userName = err.user ? `${err.user.first_name || ''} ${err.user.last_name || ''}`.trim() : 'Unknown';
            
            logs.push({
              id: err.id,
              timestamp: err.created_at,
              eventType: 'integration_error',
              category: 'errors',
              title: `${err.error_type}${err.error_code ? ` (${err.error_code})` : ''}`,
              description: err.error_message,
              severity: 'error',
              source: 'auto', // Errors are typically from automated processes
              user: err.user ? { id: err.user.id, name: userName } : null,
              targetUser: null,
              metadata: { 
                error_source: err.error_source,
                request_data: err.request_data, 
                response_data: err.response_data 
              },
              resolved: err.resolved,
            });
          }
        }
      }

      // Sort all logs by timestamp (newest first)
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply search filter if provided
      let filteredLogs = logs;
      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        filteredLogs = logs.filter(log => 
          log.title.toLowerCase().includes(searchLower) ||
          log.description.toLowerCase().includes(searchLower) ||
          log.user?.name.toLowerCase().includes(searchLower) ||
          log.targetUser?.name.toLowerCase().includes(searchLower)
        );
      }

      // Calculate counts
      const counts = {
        all: filteredLogs.length,
        connections: filteredLogs.filter(l => l.category === 'connections').length,
        errors: filteredLogs.filter(l => l.category === 'errors').length,
      };

      // Apply limit
      const limitedLogs = filteredLogs.slice(0, limit);

      return { logs: limitedLogs, counts };
    } catch (error) {
      console.error('Error fetching unified audit logs:', error);
      return { logs: [], counts: { all: 0, connections: 0, errors: 0 } };
    }
  }

  // Helper methods for formatting log entries
  private formatActionTitle(action: string): string {
    const titles: Record<string, string> = {
      'login': 'User Login',
      'logout': 'User Logout',
      'create_user': 'User Created',
      'update_user': 'User Updated',
      'delete_user': 'User Deleted',
      'invite_user': 'User Invited',
      'revoke_invitation': 'Invitation Revoked',
      'impersonate_user': 'Impersonation Started',
      'view_user_details': 'User Details Viewed',
      'export_data': 'Data Exported',
      'system_config_change': 'System Config Changed',
      'batch_sync_started': 'Batch Sync Started',
      'batch_sync_completed': 'Batch Sync Completed',
    };
    return titles[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private formatActionDescription(action: string, adminName: string, targetName: string | null, details: any): string {
    if (action === 'batch_sync_started') {
      return `Automated batch sync started (batch ${details?.batch || '?'})`;
    }
    if (action === 'batch_sync_completed') {
      return `Batch ${details?.batch || '?'} completed: ${details?.successCount || 0} success, ${details?.failureCount || 0} failed`;
    }
    if (targetName) {
      return `${adminName} performed ${action.replace(/_/g, ' ')} on ${targetName}`;
    }
    return `${adminName} performed ${action.replace(/_/g, ' ')}`;
  }

  private formatConnectionTitle(eventType: string): string {
    const titles: Record<string, string> = {
      'connected': 'HighLevel Connected',
      'disconnected': 'HighLevel Disconnected',
      'token_refreshed': 'Token Refreshed',
      'token_expired': 'Token Expired',
      'refresh_failed': 'Token Refresh Failed',
      'connection_attempted': 'Connection Attempted',
    };
    return titles[eventType] || eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private formatConnectionDescription(eventType: string, userName: string, locationName: string | null, errorMessage: string | null): string {
    const location = locationName ? ` (${locationName})` : '';
    
    if (errorMessage) {
      return `${userName}${location}: ${errorMessage}`;
    }
    
    const descriptions: Record<string, string> = {
      'connected': `${userName} connected to HighLevel${location}`,
      'disconnected': `${userName} disconnected from HighLevel${location}`,
      'token_refreshed': `Token refreshed for ${userName}${location}`,
      'token_expired': `Token expired for ${userName}${location}`,
      'refresh_failed': `Token refresh failed for ${userName}${location}`,
      'connection_attempted': `${userName} attempted to connect${location}`,
    };
    return descriptions[eventType] || `${userName}: ${eventType.replace(/_/g, ' ')}`;
  }

  private formatActivityTitle(eventName: string): string {
    const titles: Record<string, string> = {
      'sync_started': 'Call Sync Started',
      'sync_completed': 'Call Sync Completed',
      'sync_failed': 'Call Sync Failed',
      'oauth_connect': 'OAuth Connected',
      'oauth_disconnect': 'OAuth Disconnected',
    };
    return titles[eventName] || eventName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  async getConnectionsStatus(): Promise<any[]> {
    try {
      const { data, error } = await supabase.rpc('get_admin_connections_status');
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching connections status:', error);
      return [];
    }
  }
}

export const adminService = new AdminService();
