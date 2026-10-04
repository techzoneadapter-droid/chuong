import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../contexts/AuthContext';
import { PushNotificationBridge } from '../components/PushNotificationBridge';
import { OfflineSyncBridge } from '../components/OfflineSyncBridge';
import { AdsBridge } from '../components/AdsBridge';
import { DataCleanupBridge } from '../components/DataCleanupBridge';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'chuong-readable-fonts';
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = `
      html, body, #root {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Helvetica Neue", Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      input, textarea, button, select {
        font-family: inherit;
      }
    `;
    return () => { style?.remove(); };
  }, []);

  // Expo web may time out while FontFaceObserver checks the icon font inside
  // remote/cloud previews. Keep the app usable even if the icon font fails;
  // matching expo-font to SDK 54 handles the normal path.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushNotificationBridge />
        <OfflineSyncBridge />
        <AdsBridge />
        <DataCleanupBridge />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
