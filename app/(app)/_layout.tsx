import { View } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { DowngradePendingBanner } from '@/components/DowngradePendingBanner';

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <View style={{ flex: 1 }}>
      <DowngradePendingBanner />
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: '#3b82f6',
            headerShown: true,
          }}
        >
          <Tabs.Screen
            name="appointments"
            options={{ title: 'Appointments', tabBarLabel: 'Appointments' }}
          />
          <Tabs.Screen
            name="staff"
            options={{ title: 'Staff', tabBarLabel: 'Staff' }}
          />
          <Tabs.Screen
            name="billing"
            options={{ title: 'Billing', tabBarLabel: 'Billing' }}
          />
          <Tabs.Screen
            name="settings"
            options={{ title: 'Settings', tabBarLabel: 'Settings' }}
          />
        </Tabs>
      </View>
    </View>
  );
}
