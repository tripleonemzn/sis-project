import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { QueryProvider } from '../src/providers/QueryProvider';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { AppUpdateManager } from '../src/features/appUpdate/AppUpdateManager';
import { AppAlertHost } from '../src/components/AppAlertHost';
import { AppNoticeHost } from '../src/components/AppNoticeHost';
import { PushPermissionManager } from '../src/features/pushNotifications/PushPermissionManager';
import { installMobileWebRedirectGuard } from '../src/lib/navigation/mobileWebGuard';
import { NotificationRealtimeBridge } from '../src/features/notifications/NotificationRealtimeBridge';
import { installAppAlertOverride } from '../src/lib/ui/appAlert';
import { AppThemeProvider, useAppTheme } from '../src/theme/AppThemeProvider';

installAppAlertOverride();

function RootStack() {
  const { resolvedTheme } = useAppTheme();
  return (
    <>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
      <PushPermissionManager />
      <AppUpdateManager />
      <NotificationRealtimeBridge />
      <AppAlertHost />
      <AppNoticeHost />
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    installMobileWebRedirectGuard();
  }, []);

  return (
    <QueryProvider>
      <AuthProvider>
        <AppThemeProvider>
          <RootStack />
        </AppThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
