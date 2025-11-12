import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { highLevelService } from '../services/highlevel';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';

interface SyncContextType {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  lastSyncMessage: string | null;
  syncData: () => Promise<void>;
  getLastSyncDisplay: () => string;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadLastSyncStatus();
    }
  }, [profile?.id]);

  const loadLastSyncStatus = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('sync_status')
        .select('*')
        .eq('service', 'highlevel')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.last_sync_at) {
        setLastSyncTime(new Date(data.last_sync_at));
        setLastSyncMessage(data.last_sync_message);
      }
    } catch (error) {
      console.error('Error loading sync status:', error);
    }
  };

  const syncData = async () => {
    if (!profile?.id || isSyncing) return;

    setIsSyncing(true);
    setLastSyncMessage('Syncing...');

    try {
      // Check if user has an OAuth connection before attempting sync
      const { data: connection } = await supabase
        .from('api_keys')
        .select('id, is_active')
        .eq('user_id', profile.id)
        .eq('service', 'highlevel')
        .eq('is_active', true)
        .maybeSingle();

      if (!connection) {
        throw new Error('No active OAuth connection found. Please connect your account first.');
      }

      // Sync calls first
      await highLevelService.syncCalls(profile.id);

      // Then sync phone numbers for the user's agents
      const phoneNumberResult = await highLevelService.syncPhoneNumbersForUser(profile.id);
      console.log('Phone number sync result:', phoneNumberResult);

      const now = new Date();
      setLastSyncTime(now);
      setLastSyncMessage('Sync completed successfully');

      // Upsert sync status record (auto-detects unique constraint)
      await supabase
        .from('sync_status')
        .upsert({
          service: 'highlevel',
          user_id: profile.id,
          last_sync_at: now.toISOString(),
          last_sync_status: 'success',
          last_sync_message: 'Sync completed successfully',
          records_synced: 0,
        });

      setTimeout(() => {
        setLastSyncMessage(null);
      }, 3000);
    } catch (error) {
      console.error('Error syncing data:', error);
      setLastSyncMessage('Sync failed. Please try again.');

      if (profile?.id) {
        // Upsert sync status record with error info (auto-detects unique constraint)
        await supabase
          .from('sync_status')
          .upsert({
            service: 'highlevel',
            user_id: profile.id,
            last_sync_at: new Date().toISOString(),
            last_sync_status: 'failure',
            last_sync_message: error instanceof Error ? error.message : 'Sync failed',
            records_synced: 0,
          });
      }

      setTimeout(() => {
        setLastSyncMessage(null);
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const getLastSyncDisplay = (): string => {
    if (isSyncing) return 'Syncing...';
    if (lastSyncMessage && lastSyncMessage !== 'Sync completed successfully') {
      return lastSyncMessage;
    }
    if (!lastSyncTime) return 'Never synced';

    try {
      return `Synced ${formatDistanceToNow(lastSyncTime, { addSuffix: true })}`;
    } catch {
      return 'Never synced';
    }
  };

  return (
    <SyncContext.Provider
      value={{
        isSyncing,
        lastSyncTime,
        lastSyncMessage,
        syncData,
        getLastSyncDisplay,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
