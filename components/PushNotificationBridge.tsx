import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { getNotificationPreferences } from '../services/notifications';
import {
  addPushResponseListener,
  addPushTokenRefreshListener,
  configureForegroundNotificationHandler,
  getInitialPushActionRoute,
  syncCurrentPushDeviceIfPermitted,
} from '../services/pushNotifications';

export function PushNotificationBridge() {
  const router = useRouter();
  const { user } = useAuth();
  const pushEnabledRef = useRef(false);
  const handledInitialRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    configureForegroundNotificationHandler();

    const responseSubscription = addPushResponseListener((route) => {
      if (route) router.push(route as never);
    });

    if (!handledInitialRef.current) {
      handledInitialRef.current = true;
      void getInitialPushActionRoute()
        .then((route) => {
          if (route) router.push(route as never);
        })
        .catch(() => undefined);
    }

    return () => responseSubscription.remove();
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web' || !user) {
      pushEnabledRef.current = false;
      return;
    }

    let active = true;

    const sync = async () => {
      try {
        const preferences = await getNotificationPreferences();
        if (!active) return;
        pushEnabledRef.current = preferences.pushEnabled;
        if (preferences.pushEnabled) await syncCurrentPushDeviceIfPermitted();
      } catch {
        // Push sync is best-effort and must never block app startup/auth.
      }
    };

    void sync();

    const tokenSubscription = addPushTokenRefreshListener(() => {
      if (pushEnabledRef.current) {
        void syncCurrentPushDeviceIfPermitted().catch(() => undefined);
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pushEnabledRef.current) {
        void syncCurrentPushDeviceIfPermitted().catch(() => undefined);
      }
    });

    return () => {
      active = false;
      tokenSubscription.remove();
      appStateSubscription.remove();
    };
  }, [user?.id]);

  return null;
}
