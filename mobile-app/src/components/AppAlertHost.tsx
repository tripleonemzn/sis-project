import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_COLORS } from '../config/brand';
import { AppAlertPayload, type AppAlertButton, subscribeAppAlert } from '../lib/ui/appAlert';

type QueueItem = AppAlertPayload & { id: number };

type AlertTone = 'info' | 'success' | 'warning' | 'danger';

function resolveAlertTone(payload: AppAlertPayload): AlertTone {
  const title = String(payload.title || '').toLowerCase();
  const message = String(payload.message || '').toLowerCase();
  const destructive = (payload.buttons || []).some((button) => button.style === 'destructive');

  if (destructive || /hapus|gagal|tolak|bahaya|invalid|error/.test(`${title} ${message}`)) {
    return 'danger';
  }
  if (/berhasil|sukses|success/.test(title)) {
    return 'success';
  }
  if (/konfirmasi|warning|peringatan|validasi|logout|perlu perhatian/.test(`${title} ${message}`)) {
    return 'warning';
  }
  return 'info';
}

function getTonePalette(tone: AlertTone) {
  if (tone === 'success') {
    return {
      icon: 'check-circle',
      iconBg: '#ecfdf5',
      iconBorder: '#86efac',
      iconColor: '#16a34a',
      borderColor: '#bbf7d0',
      titleColor: '#14532d',
      messageColor: '#166534',
      primaryBg: '#16a34a',
      primaryBorder: '#16a34a',
      secondaryBorder: '#bbf7d0',
      secondaryText: '#166534',
    } as const;
  }

  if (tone === 'danger') {
    return {
      icon: 'alert-triangle',
      iconBg: '#fff1f2',
      iconBorder: '#fda4af',
      iconColor: '#e11d48',
      borderColor: '#fecdd3',
      titleColor: '#881337',
      messageColor: '#9f1239',
      primaryBg: '#dc2626',
      primaryBorder: '#dc2626',
      secondaryBorder: '#fecaca',
      secondaryText: '#991b1b',
    } as const;
  }

  if (tone === 'warning') {
    return {
      icon: 'alert-circle',
      iconBg: '#fff7ed',
      iconBorder: '#fdba74',
      iconColor: '#ea580c',
      borderColor: '#fed7aa',
      titleColor: '#9a3412',
      messageColor: '#9a3412',
      primaryBg: BRAND_COLORS.blue,
      primaryBorder: BRAND_COLORS.blue,
      secondaryBorder: '#fdba74',
      secondaryText: '#c2410c',
    } as const;
  }

  return {
    icon: 'info',
    iconBg: '#eff6ff',
    iconBorder: '#bfdbfe',
    iconColor: BRAND_COLORS.blue,
    borderColor: '#c7d7f7',
    titleColor: BRAND_COLORS.textDark,
    messageColor: BRAND_COLORS.textMuted,
    primaryBg: BRAND_COLORS.blue,
    primaryBorder: BRAND_COLORS.blue,
    secondaryBorder: '#cbd5e1',
    secondaryText: BRAND_COLORS.textMuted,
  } as const;
}

export function AppAlertHost() {
  const insets = useSafeAreaInsets();
  const queueRef = useRef<QueueItem[]>([]);
  const seedRef = useRef(1);
  const [activeAlert, setActiveAlert] = useState<QueueItem | null>(null);

  const showNext = useCallback(() => {
    if (activeAlert) return;
    const next = queueRef.current.shift();
    if (next) {
      setActiveAlert(next);
    }
  }, [activeAlert]);

  useEffect(() => {
    const unsubscribe = subscribeAppAlert((payload) => {
      queueRef.current.push({
        ...payload,
        id: seedRef.current,
      });
      seedRef.current += 1;
      setActiveAlert((current) => current || queueRef.current.shift() || null);
    });

    return () => {
      unsubscribe();
      queueRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!activeAlert) {
      showNext();
    }
  }, [activeAlert, showNext]);

  const buttons = useMemo<AppAlertButton[]>(
    () => (activeAlert?.buttons?.length ? activeAlert.buttons : [{ text: 'OK' }]),
    [activeAlert],
  );
  const tone = resolveAlertTone(activeAlert || {});
  const palette = getTonePalette(tone);

  const dismissWithButton = useCallback(
    (button?: AppAlertButton) => {
      setActiveAlert(null);
      if (button?.onPress) {
        setTimeout(() => {
          button.onPress?.();
        }, 0);
      }
    },
    [],
  );

  const handleBackdropPress = useCallback(() => {
    if (!activeAlert) return;
    const cancelButton = buttons.find((button) => button.style === 'cancel');
    if (cancelButton) {
      dismissWithButton(cancelButton);
      return;
    }
    if (buttons.length === 1) {
      dismissWithButton(buttons[0]);
      return;
    }
    if (activeAlert.options?.cancelable === false) {
      return;
    }
    setActiveAlert(null);
  }, [activeAlert, buttons, dismissWithButton]);

  if (!activeAlert) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleBackdropPress}>
      <Pressable
        onPress={handleBackdropPress}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          justifyContent: 'center',
          paddingHorizontal: 22,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: BRAND_COLORS.white,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: palette.borderColor,
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
              backgroundColor: palette.iconBg,
              borderWidth: 1,
              borderColor: palette.iconBorder,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
            }}
          >
            <Feather name={palette.icon} size={18} color={palette.iconColor} />
          </View>

          <Text style={{ color: palette.titleColor, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>
            {activeAlert.title || 'Informasi'}
          </Text>
          <Text style={{ color: palette.messageColor, fontSize: 14, marginBottom: 14, lineHeight: 21 }}>
            {activeAlert.message || 'Pilih aksi yang ingin dilakukan.'}
          </Text>

          <View style={{ flexDirection: buttons.length > 2 ? 'column' : 'row', gap: 10 }}>
            {buttons.map((button, index) => {
              const destructive = button.style === 'destructive';
              const cancel = button.style === 'cancel';
              const primary = destructive || (!cancel && index === buttons.length - 1);
              return (
                <Pressable
                  key={`${button.text || 'button'}-${index}`}
                  onPress={() => dismissWithButton(button)}
                  style={{
                    flex: buttons.length > 2 ? undefined : 1,
                    borderWidth: 1,
                    borderColor: primary
                      ? destructive
                        ? '#dc2626'
                        : palette.primaryBorder
                      : cancel
                        ? '#cbd5e1'
                        : palette.secondaryBorder,
                    borderRadius: 12,
                    paddingVertical: 11,
                    alignItems: 'center',
                    backgroundColor: primary ? (destructive ? '#dc2626' : palette.primaryBg) : BRAND_COLORS.white,
                  }}
                >
                  <Text
                    style={{
                      color: primary ? BRAND_COLORS.white : cancel ? BRAND_COLORS.textMuted : palette.secondaryText,
                      fontWeight: '700',
                    }}
                  >
                    {button.text || (index === buttons.length - 1 ? 'OK' : 'Batal')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default AppAlertHost;
