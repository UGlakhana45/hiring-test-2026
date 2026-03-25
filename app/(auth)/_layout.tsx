import { Stack, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

export default function AuthLayout() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Redirect href="/(app)/appointments" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
