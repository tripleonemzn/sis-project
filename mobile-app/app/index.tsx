import { Redirect } from 'expo-router';
import { useAuth } from '../src/features/auth/AuthProvider';
import { AppLoadingScreen } from '../src/components/AppLoadingScreen';

export default function IndexScreen() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <AppLoadingScreen message="Memulihkan sesi..." />;
  }

  return isAuthenticated ? <Redirect href="/home" /> : <Redirect href="/welcome" />;
}
