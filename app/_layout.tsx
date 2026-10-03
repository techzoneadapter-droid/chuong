import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../contexts/AuthContext';
import { PushNotificationBridge } from '../components/PushNotificationBridge';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);

  // Expo web may time out while FontFaceObserver checks the icon font inside
  // remote/cloud previews. Keep the app usable even if the icon font fails;
  // matching expo-font to SDK 54 handles the normal path.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushNotificationBridge />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
