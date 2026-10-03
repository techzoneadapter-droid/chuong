import { Platform } from 'react-native';

export type ConnectivityState = {
  connected: boolean;
  reachable: boolean;
};

export async function getConnectivityState(): Promise<ConnectivityState> {
  try {
    if (Platform.OS === 'web') {
      const connected = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
      return { connected, reachable: connected };
    }

    const Network = await import('expo-network');
    const state = await Network.getNetworkStateAsync();
    const connected = state.isConnected !== false;
    const reachable = state.isInternetReachable !== false && connected;
    return { connected, reachable };
  } catch {
    // Unknown connectivity should not block a request that may still succeed.
    return { connected: true, reachable: true };
  }
}

export async function isInternetReachable() {
  return (await getConnectivityState()).reachable;
}

export function addConnectivityListener(listener: (state: ConnectivityState) => void) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return { remove: () => undefined };
    const emit = () => listener({ connected: navigator.onLine !== false, reachable: navigator.onLine !== false });
    window.addEventListener('online', emit);
    window.addEventListener('offline', emit);
    return {
      remove: () => {
        window.removeEventListener('online', emit);
        window.removeEventListener('offline', emit);
      },
    };
  }

  let disposed = false;
  let subscription: { remove: () => void } | null = null;

  void import('expo-network').then((Network) => {
    if (disposed) return;
    subscription = Network.addNetworkStateListener((state) => {
      const connected = state.isConnected !== false;
      listener({
        connected,
        reachable: state.isInternetReachable !== false && connected,
      });
    });
  }).catch(() => undefined);

  return {
    remove: () => {
      disposed = true;
      subscription?.remove();
    },
  };
}
