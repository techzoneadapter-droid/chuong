import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { xianxia } from '../../constants/xianxia';
import { ArtIcon } from '../../components/Artwork';
import { artwork } from '../../constants/artwork';

function TabIcon({ name, color, size, focused }: { name: keyof typeof Ionicons.glyphMap; color: string; size: number; focused: boolean }) {
  const source = name === 'home-outline' ? artwork.home : name === 'compass-outline' ? artwork.discover : name === 'brush-outline' ? artwork.write : name === 'library-outline' ? artwork.library : artwork.profile;
  return <View style={[styles.iconShell, focused && styles.iconShellActive]}>
    <ArtIcon source={source} size={focused ? 34 : 30} />
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
          height: 80,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: '#FFF8EA',
          borderTopColor: xianxia.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
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
  iconShell: { width: 44, height: 38, alignItems: 'center', justifyContent: 'center' },
  iconShellActive: { borderBottomWidth: 2, borderColor: xianxia.gold },
});
