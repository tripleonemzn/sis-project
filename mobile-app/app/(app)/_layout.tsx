import { useState } from 'react';
import { Redirect, Stack, useRouter } from 'expo-router';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useMobileRealtimeSync } from '../../src/features/realtime/useMobileRealtimeSync';
import { View, Pressable, Text, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { BRAND_COLORS } from '../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../src/lib/ui/feedback';
import { useUnreadNotificationsQuery } from '../../src/features/notifications/useUnreadNotificationsQuery';

export default function AppProtectedLayout() {
  const { isLoading, isAuthenticated, user, logout } = useAuth();
  const shouldEnableRealtime =
    isAuthenticated &&
    !['STUDENT', 'CALON_SISWA', 'UMUM'].includes(String(user?.role || '').trim().toUpperCase());
  useMobileRealtimeSync(shouldEnableRealtime);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isLogoutConfirmVisible, setIsLogoutConfirmVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Global footer dinonaktifkan pada halaman menu agar navigasi bawah hanya muncul di home screen.
  const showGlobalFooter = false;
  const unreadNotificationsQuery = useUnreadNotificationsQuery(isAuthenticated && showGlobalFooter);
  const unreadCount = unreadNotificationsQuery.data ?? 0;

  if (isLoading) {
    return <AppLoadingScreen message="Memulihkan sesi..." />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  const handleNotificationPress = () => {
    router.push('/notifications');
  };

  const handleLogout = () => {
    if (isLoggingOut) return;
    setIsLogoutConfirmVisible(true);
  };

  const confirmLogout = () => {
    if (isLoggingOut) return;
    void (async () => {
      try {
        setIsLoggingOut(true);
        setIsLogoutConfirmVisible(false);
        await logout();
        router.replace('/welcome');
        notifySuccess('Logout berhasil');
        setIsLoggingOut(false);
      } catch (error: unknown) {
        setIsLoggingOut(false);
        notifyApiError(error, 'Gagal logout.');
      }
    })();
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />

      {showGlobalFooter ? (
        <>
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 14 + insets.bottom,
            }}
          >
            <View
              style={{
                backgroundColor: BRAND_COLORS.navy,
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-around',
                shadowColor: '#0b1b42',
                shadowOffset: { width: 0, height: 7 },
                shadowOpacity: 0.2,
                shadowRadius: 10,
                elevation: 10,
              }}
            >
              <Pressable onPress={() => router.push('/profile')} style={{ alignItems: 'center', width: 64 }}>
                <Feather name="user" size={17} color={BRAND_COLORS.white} />
                <Text style={{ color: BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>Profil</Text>
              </Pressable>

              <Pressable onPress={handleNotificationPress} style={{ alignItems: 'center', width: 64 }}>
                <View style={{ position: 'relative' }}>
                  <Feather name="bell" size={17} color={BRAND_COLORS.white} />
                  {unreadCount > 0 ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -10,
                        minWidth: 17,
                        height: 17,
                        borderRadius: 999,
                        backgroundColor: '#ef4444',
                        borderWidth: 1,
                        borderColor: BRAND_COLORS.navy,
                        paddingHorizontal: 4,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>Notifikasi</Text>
              </Pressable>

              <Pressable onPress={handleLogout} disabled={isLoggingOut} style={{ alignItems: 'center', width: 64 }}>
                <Feather name="log-out" size={17} color={BRAND_COLORS.white} />
                <Text style={{ color: BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>
                  {isLoggingOut ? 'Proses' : 'Logout'}
                </Text>
              </Pressable>
            </View>
          </View>

          <Modal
            visible={isLogoutConfirmVisible}
            transparent
            animationType="fade"
            onRequestClose={() => {
              if (isLoggingOut) return;
              setIsLogoutConfirmVisible(false);
            }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(15, 23, 42, 0.5)',
                justifyContent: 'center',
                paddingHorizontal: 22,
              }}
            >
              <View
                style={{
                  backgroundColor: BRAND_COLORS.white,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: '#c7d7f7',
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  shadowColor: '#0f172a',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.24,
                  shadowRadius: 18,
                  elevation: 14,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    backgroundColor: '#eff6ff',
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Feather name="log-out" size={18} color={BRAND_COLORS.blue} />
                </View>
                <Text style={{ color: BRAND_COLORS.textDark, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>
                  Konfirmasi Logout
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 14, marginBottom: 14 }}>
                  Anda akan keluar dari sesi saat ini. Lanjutkan logout?
                </Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    disabled={isLoggingOut}
                    onPress={() => setIsLogoutConfirmVisible(false)}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 12,
                      paddingVertical: 11,
                      alignItems: 'center',
                      backgroundColor: BRAND_COLORS.white,
                      opacity: isLoggingOut ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Batal</Text>
                  </Pressable>
                  <Pressable
                    disabled={isLoggingOut}
                    onPress={confirmLogout}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#dc2626',
                      borderRadius: 12,
                      paddingVertical: 11,
                      alignItems: 'center',
                      backgroundColor: '#dc2626',
                      opacity: isLoggingOut ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.white, fontWeight: '700' }}>
                      {isLoggingOut ? 'Memproses...' : 'Logout'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </>
      ) : null}
    </View>
  );
}
