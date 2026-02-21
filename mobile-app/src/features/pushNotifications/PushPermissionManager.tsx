import { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { notifyInfo } from '../../lib/ui/feedback';
import {
  consumeNotificationSettingsPromptEligibility,
  ensureNotificationPermissionOnStartup,
} from './pushNotificationService';

export function PushPermissionManager() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      const permission = await ensureNotificationPermissionOnStartup();
      if (permission.granted) return;

      if (permission.canAskAgain) {
        if (permission.prompted) return;
        notifyInfo('Aktifkan notifikasi agar info update aplikasi muncul secara real-time.', {
          title: 'Notifikasi',
          durationMs: 3000,
        });
        return;
      }

      const shouldPromptSettings = await consumeNotificationSettingsPromptEligibility();
      if (!shouldPromptSettings) return;

      Alert.alert(
        'Aktifkan Notifikasi',
        'Agar update aplikasi muncul real-time, aktifkan izin notifikasi di pengaturan perangkat.',
        [
          {
            text: 'Nanti',
            style: 'cancel',
          },
          {
            text: 'Buka Pengaturan',
            onPress: () => {
              void Linking.openSettings().catch(() => {
                notifyInfo('Silakan buka Pengaturan perangkat dan aktifkan izin notifikasi aplikasi SIS KGB2.', {
                  title: 'Notifikasi',
                });
              });
            },
          },
        ],
      );
    };

    void run();
  }, []);

  return null;
}
