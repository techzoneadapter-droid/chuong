import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { getNotificationPreferences } from '../services/notifications';
import { scheduleIdle } from '../lib/scheduleIdle';

export function PushNotificationBridge() {
  const router = useRouter();
  const { user } = useAuth();
  const pushEnabledRef = useRef(false);
  const handledInitialRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    let responseSubscription: { remove: () => void } | undefined;
    void import('../services/pushNotifications').then((push) => {
      if (!active) return;
      push.configureForegroundNotificationHandler();
      responseSubscription = push.addPushResponseListener((route) => {
        if (route && active) router.push(route as never);
      });
      if (!handledInitialRef.current) {
        handledInitialRef.current = true;
        void push.getInitialPushActionRoute().then((route) => {
          if (route && active) router.push(route as never);
        }).catch(() => undefined);
      }
    }).catch(() => undefined);
    return () => { active = false; responseSubscription?.remove(); };
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web' || !user) {
      pushEnabledRef.current = false;
      return;
    }

    let active = true;
    let syncing = false;
    const syncDevice = async () => {
      if (!active || syncing) return;
      syncing = true;
      try {
        const push = await import('../services/pushNotifications');
        if (active) await push.syncCurrentPushDeviceIfPermitted();
      } finally { syncing = false; }
    };

    const sync = async () => {
      try {
        const preferences = await getNotificationPreferences();
        if (!active) return;
        pushEnabledRef.current = preferences.pushEnabled;
        if (preferences.pushEnabled) await syncDevice();
      } catch {
        // Push sync is best-effort and must never block app startup/auth.
      }
    };

    const cancelSync = scheduleIdle(() => { void sync(); });

    let tokenSubscription: { remove: () => void } | undefined;
    void import('../services/pushNotifications').then((push) => {
      if (!active) return;
      tokenSubscription = push.addPushTokenRefreshListener(() => {
        if (pushEnabledRef.current) void syncDevice().catch(() => undefined);
      });
    }).catch(() => undefined);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pushEnabledRef.current) {
        void syncDevice().catch(() => undefined);
      }
    });

    return () => {
      active = false;
      cancelSync();
      tokenSubscription?.remove();
      appStateSubscription.remove();
    };
  }, [user?.id]);

  return null;
}
