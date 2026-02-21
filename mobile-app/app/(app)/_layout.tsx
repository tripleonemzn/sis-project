import { Redirect, Stack } from 'expo-router';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { useAuth } from '../../src/features/auth/AuthProvider';

export default function AppProtectedLayout() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <AppLoadingScreen message="Memulihkan sesi..." />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
