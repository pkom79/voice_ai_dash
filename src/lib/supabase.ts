import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          role: 'client' | 'admin';
          first_name: string;
          last_name: string;
          business_name: string | null;
          phone_number: string | null;
          is_active: boolean;
          last_login: string | null;
          notification_preferences: {
            low_balance_alerts: boolean;
            weekly_summaries: boolean;
          };
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: 'client' | 'admin';
          first_name: string;
          last_name: string;
          business_name?: string | null;
          phone_number?: string | null;
          is_active?: boolean;
          last_login?: string | null;
          notification_preferences?: {
            low_balance_alerts: boolean;
            weekly_summaries: boolean;
          };
        };
        Update: Partial<{
          role: 'client' | 'admin';
          first_name: string;
          last_name: string;
          business_name: string | null;
          phone_number: string | null;
          is_active: boolean;
          last_login: string | null;
          notification_preferences: {
            low_balance_alerts: boolean;
            weekly_summaries: boolean;
          };
        }>;
      };
    };
  };
};
