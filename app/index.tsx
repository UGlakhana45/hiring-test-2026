import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';

/**
 * Root URL `/` must resolve to a screen; group routes alone do not.
 */
export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) return <Redirect href="/(app)/appointments" />;
  return <Redirect href="/(auth)/login" />;
}
