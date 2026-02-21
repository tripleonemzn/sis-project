import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { QueryProvider } from '../src/providers/QueryProvider';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { AppUpdateManager } from '../src/features/appUpdate/AppUpdateManager';
import { AppNoticeHost } from '../src/components/AppNoticeHost';
import { PushPermissionManager } from '../src/features/pushNotifications/PushPermissionManager';
import { installMobileWebRedirectGuard } from '../src/lib/navigation/mobileWebGuard';

export default function RootLayout() {
  useEffect(() => {
    installMobileWebRedirectGuard();
  }, []);

  return (
    <QueryProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
        <PushPermissionManager />
        <AppUpdateManager />
        <AppNoticeHost />
      </AuthProvider>
    </QueryProvider>
  );
}
