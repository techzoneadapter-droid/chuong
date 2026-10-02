import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const brand = '#8F1D3F';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand,
        tabBarInactiveTintColor: '#8B8185',
        tabBarStyle: {
          height: 68,
          paddingTop: 7,
          paddingBottom: 9,
          backgroundColor: '#FFFDFC',
          borderTopColor: '#E9DDD6'
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700'
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trang chủ',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Khám phá',
          tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="write"
        options={{
          title: 'Viết',
          tabBarIcon: ({ color, size }) => <Ionicons name="create-outline" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Tủ sách',
          tabBarIcon: ({ color, size }) => <Ionicons name="library-outline" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Tôi',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />
        }}
      />
    </Tabs>
  );
}
