import { supabase } from '../lib/supabase';

export type EventType = 'user_action' | 'connection_event' | 'integration_error' | 'system_event' | 'admin_action';
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ConnectionEventType = 'connected' | 'disconnected' | 'token_refreshed' | 'token_expired' | 'refresh_failed' | 'connection_attempted';

export interface ActivityLogEntry {
  userId: string;
  eventType: EventType;
  eventCategory: string;
  eventName: string;
  description: string;
  metadata?: Record<string, any>;
  severity?: EventSeverity;
  createdBy?: string;
}

export interface ConnectionEventEntry {
  userId: string;
  eventType: ConnectionEventType;
  locationId?: string;
  locationName?: string;
  tokenExpiresAt?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdBy?: string;
}

export interface IntegrationErrorEntry {
  userId: string;
  errorType: string;
  errorSource: string;
  errorMessage: string;
  errorCode?: string;
  requestData?: Record<string, any>;
  responseData?: Record<string, any>;
  stackTrace?: string;
  retryCount?: number;
}

class ActivityLoggerService {
  async logActivity(entry: ActivityLogEntry): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('log_user_activity', {
        p_user_id: entry.userId,
        p_event_type: entry.eventType,
        p_event_category: entry.eventCategory,
        p_event_name: entry.eventName,
        p_description: entry.description,
        p_metadata: entry.metadata || {},
        p_severity: entry.severity || 'info',
        p_created_by: entry.createdBy || null,
      });

      if (error) {
        console.error('Error logging activity:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error logging activity:', error);
      return null;
    }
  }

  async logConnectionEvent(entry: ConnectionEventEntry): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('log_connection_event', {
        p_user_id: entry.userId,
        p_event_type: entry.eventType,
        p_location_id: entry.locationId || null,
        p_location_name: entry.locationName || null,
        p_token_expires_at: entry.tokenExpiresAt || null,
        p_error_message: entry.errorMessage || null,
        p_metadata: entry.metadata || {},
        p_created_by: entry.createdBy || null,
      });

      if (error) {
        console.error('Error logging connection event:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error logging connection event:', error);
      return null;
    }
  }

  async logIntegrationError(entry: IntegrationErrorEntry): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('log_integration_error', {
        p_user_id: entry.userId,
        p_error_type: entry.errorType,
        p_error_source: entry.errorSource,
        p_error_message: entry.errorMessage,
        p_error_code: entry.errorCode || null,
        p_request_data: entry.requestData || {},
        p_response_data: entry.responseData || {},
        p_stack_trace: entry.stackTrace || null,
        p_retry_count: entry.retryCount || 0,
      });

      if (error) {
        console.error('Error logging integration error:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error logging integration error:', error);
      return null;
    }
  }

  async getUserActivityLogs(userId: string, limit: number = 50, offset: number = 0) {
    try {
      const { data, error } = await supabase
        .from('user_activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      return [];
    }
  }

  async getUserConnectionEvents(userId: string, limit: number = 50, offset: number = 0) {
    try {
      const { data, error } = await supabase
        .from('user_connection_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching connection events:', error);
      return [];
    }
  }

  async getUserIntegrationErrors(userId: string, limit: number = 50, offset: number = 0, includeResolved: boolean = false) {
    try {
      let query = supabase
        .from('user_integration_errors')
        .select('*')
        .eq('user_id', userId);

      if (!includeResolved) {
        query = query.eq('resolved', false);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching integration errors:', error);
      return [];
    }
  }

  async markErrorResolved(errorId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_integration_errors')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString()
        })
        .eq('id', errorId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error marking error as resolved:', error);
      return false;
    }
  }

  async getActivityLogStats(userId: string) {
    try {
      const { data: activityCount } = await supabase
        .from('user_activity_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { data: connectionCount } = await supabase
        .from('user_connection_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { data: unresolvedErrorCount } = await supabase
        .from('user_integration_errors')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('resolved', false);

      const { data: errorCount } = await supabase
        .from('user_activity_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('severity', ['error', 'critical']);

      return {
        totalActivities: activityCount?.length || 0,
        totalConnectionEvents: connectionCount?.length || 0,
        unresolvedErrors: unresolvedErrorCount?.length || 0,
        criticalEvents: errorCount?.length || 0,
      };
    } catch (error) {
      console.error('Error fetching activity stats:', error);
      return {
        totalActivities: 0,
        totalConnectionEvents: 0,
        unresolvedErrors: 0,
        criticalEvents: 0,
      };
    }
  }
}

export const activityLogger = new ActivityLoggerService();
