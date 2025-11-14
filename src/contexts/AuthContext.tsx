import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { highLevelService } from '../services/highlevel';

interface UserProfile {
  id: string;
  role: 'client' | 'admin';
  first_name: string;
  last_name: string;
  business_name: string | null;
  phone_number: string | null;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    businessName?: string;
    phoneNumber?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadUserProfile(session.user.id);
          await updateLastLogin(session.user.id);

          if (event === 'SIGNED_IN') {
            triggerAutoSync(session.user.id);
          }
        } else {
          setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const triggerAutoSync = async (userId: string) => {
    try {
      // Check if user has an OAuth connection before attempting sync
      const { data: connection } = await supabase
        .from('api_keys')
        .select('id, is_active')
        .eq('user_id', userId)
        .eq('service', 'highlevel')
        .eq('is_active', true)
        .maybeSingle();

      if (!connection) {
        console.log('No OAuth connection found, skipping auto-sync');
        return;
      }

      await highLevelService.syncCalls(userId);

      await supabase.from('sync_status').upsert(
        {
          service: 'highlevel',
          user_id: userId,
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
          last_sync_message: 'Auto-sync on login completed',
          sync_type: 'auto',
          records_synced: 0,
        },
        { onConflict: 'service,user_id' }
      );
    } catch (error) {
      console.error('Auto-sync failed:', error);
    }
  };

  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateLastLogin = async (userId: string) => {
    try {
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', userId);
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    businessName?: string;
    phoneNumber?: string;
  }) => {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('User creation failed');

    const { error: profileError } = await supabase.from('users').insert({
      id: authData.user.id,
      first_name: data.firstName,
      last_name: data.lastName,
      business_name: data.businessName || null,
      phone_number: data.phoneNumber || null,
      role: 'client',
    });

    if (profileError) throw profileError;

    const { error: billingError } = await supabase.from('billing_accounts').insert({
      user_id: authData.user.id,
      payment_model: 'pay_per_use',
      wallet_balance: 0,
    });

    if (billingError) throw billingError;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send password reset email');
    }
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
