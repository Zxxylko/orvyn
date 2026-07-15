import { useEffect, useState } from 'react';

export type SyncState = 'idle' | 'syncing' | 'saved' | 'offline' | 'error';

export function useSyncStatus() {
  const [state, setState] = useState<SyncState>(() => navigator.onLine ? 'idle' : 'offline');

  useEffect(() => {
    let savedTimer: number | undefined;
    const clearSavedTimer = () => {
      if (savedTimer) window.clearTimeout(savedTimer);
    };
    const setOnline = () => setState('idle');
    const setOffline = () => setState('offline');
    const setSyncing = () => {
      clearSavedTimer();
      setState(navigator.onLine ? 'syncing' : 'offline');
    };
    const setSaved = () => {
      clearSavedTimer();
      setState(navigator.onLine ? 'saved' : 'offline');
      savedTimer = window.setTimeout(() => setState(navigator.onLine ? 'idle' : 'offline'), 2200);
    };
    const setError = () => setState(navigator.onLine ? 'error' : 'offline');

    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    window.addEventListener('orvyn:sync-start', setSyncing);
    window.addEventListener('orvyn:sync-success', setSaved);
    window.addEventListener('orvyn:sync-error', setError);

    return () => {
      clearSavedTimer();
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
      window.removeEventListener('orvyn:sync-start', setSyncing);
      window.removeEventListener('orvyn:sync-success', setSaved);
      window.removeEventListener('orvyn:sync-error', setError);
    };
  }, []);

  return state;
}
