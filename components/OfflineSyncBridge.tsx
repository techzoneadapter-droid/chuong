import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { addConnectivityListener } from '../services/connectivity';
import { flushOfflineSyncQueue } from '../services/offlineSync';

export function OfflineSyncBridge() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    const flush = () => {
      void flushOfflineSyncQueue(user.id);
    };

    flush();

    const networkSubscription = addConnectivityListener((state) => {
      if (state.reachable) flush();
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') flush();
    });

    const timer = setInterval(flush, 30_000);

    return () => {
      clearInterval(timer);
      networkSubscription.remove();
      appStateSubscription.remove();
    };
  }, [user?.id]);

  return null;
}
