import { useEffect, useState } from 'react';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTextScale } from '../theme/AppTextScaleProvider';
import { useAppTheme } from '../theme/AppThemeProvider';

type CameraQrScanModalProps = {
  visible: boolean;
  enabled: boolean;
  title: string;
  description: string;
  guideLabel: string;
  helperText: string;
  busyText?: string;
  busy?: boolean;
  onClose: () => void;
  onScanned: (result: BarcodeScanningResult) => void;
};

export function CameraQrScanModal({
  visible,
  enabled,
  title,
  description,
  guideLabel,
  helperText,
  busyText = 'Memproses QR...',
  busy = false,
  onClose,
  onScanned,
}: CameraQrScanModalProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraKey, setCameraKey] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setCameraReady(false);
    setCameraError('');
    setCameraKey((current) => current + 1);
  }, [visible]);

  const statusText = cameraError
    ? cameraError
    : busy
      ? busyText
      : cameraReady
        ? helperText
        : 'Menyiapkan kamera...';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: '#f8fafc',
                fontSize: scaleFont(20),
                lineHeight: scaleLineHeight(28),
                fontWeight: '800',
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: '#cbd5e1',
                fontSize: fontSizes.body,
                lineHeight: scaleLineHeight(20),
                marginTop: 4,
              }}
            >
              {description}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={{ color: '#f8fafc', fontWeight: '800', fontSize: fontSizes.label }}>Tutup</Text>
          </Pressable>
        </View>

        <View style={styles.cameraFrame}>
          {visible ? (
            <CameraView
              key={cameraKey}
              style={StyleSheet.absoluteFill}
              facing="back"
              ratio="4:3"
              active={visible}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onCameraReady={() => setCameraReady(true)}
              onMountError={(event) => {
                setCameraError(event.message || 'Kamera tidak berhasil dibuka. Coba tutup lalu buka scanner lagi.');
              }}
              onBarcodeScanned={enabled && !busy ? onScanned : undefined}
            />
          ) : null}
        </View>

        <View style={styles.guidePanel}>
          <View style={styles.guideBox} />
          <Text
            style={{
              color: '#f8fafc',
              fontSize: scaleFont(18),
              lineHeight: scaleLineHeight(24),
              fontWeight: '800',
              textAlign: 'center',
              marginTop: 14,
            }}
          >
            {guideLabel}
          </Text>
          <Text
            style={{
              color: cameraError ? '#fecaca' : colors.textMuted,
              fontSize: fontSizes.body,
              lineHeight: scaleLineHeight(20),
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            {statusText}
          </Text>
          {cameraError ? (
            <Pressable
              onPress={() => {
                setCameraReady(false);
                setCameraError('');
                setCameraKey((current) => current + 1);
              }}
              style={styles.retryButton}
            >
              <Text style={{ color: '#f8fafc', fontWeight: '800', fontSize: fontSizes.label }}>Buka Ulang Kamera</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  closeButton: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
  },
  cameraFrame: {
    flex: 1,
    minHeight: 320,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  guidePanel: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 24,
    backgroundColor: '#0f172a',
    padding: 18,
    alignItems: 'center',
  },
  guideBox: {
    width: 168,
    height: 168,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#e0f2fe',
    backgroundColor: 'transparent',
  },
  retryButton: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
});
