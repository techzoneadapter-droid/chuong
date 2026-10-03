import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { xianxia } from '../../constants/xianxia';

function TabIcon({ name, color, size, focused }: { name: keyof typeof Ionicons.glyphMap; color: string; size: number; focused: boolean }) {
  return <View style={[styles.iconShell, focused && styles.iconShellActive]}>
    <Ionicons name={name} color={focused ? xianxia.goldSoft : color} size={focused ? size - 1 : size} />
  </View>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: xianxia.jadeDeep,
        tabBarInactiveTintColor: '#827B71',
        tabBarStyle: {
          height: 72,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: '#FBF7EF',
          borderTopColor: xianxia.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '800',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Trang chủ', tabBarIcon: ({ color, size, focused }) => <TabIcon name="home-outline" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="discover" options={{ title: 'Tàng Kinh', tabBarIcon: ({ color, size, focused }) => <TabIcon name="compass-outline" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="write" options={{ title: 'Khai bút', tabBarIcon: ({ color, size, focused }) => <TabIcon name="brush-outline" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="library" options={{ title: 'Tủ sách', tabBarIcon: ({ color, size, focused }) => <TabIcon name="library-outline" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Ta', tabBarIcon: ({ color, size, focused }) => <TabIcon name="person-outline" color={color} size={size} focused={focused} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconShell: { width: 32, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  iconShellActive: { backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: '#496A61' },
});
