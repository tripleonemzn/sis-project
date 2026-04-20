import { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_COLORS } from '../config/brand';
import { useAppTextScale } from '../theme/AppTextScaleProvider';

type ExamImagePreviewModalProps = {
  visible: boolean;
  imageUri: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function ExamImagePreviewModal({
  visible,
  imageUri,
  title = 'Preview Gambar Soal',
  subtitle = 'Perbesar gambar dengan tombol zoom, lalu geser jika ingin melihat detail lain.',
  onClose,
}: ExamImagePreviewModalProps) {
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { typography } = useAppTextScale();
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!visible || !imageUri) {
      setZoom(MIN_ZOOM);
      setImageSize(null);
      return;
    }

    let isActive = true;
    Image.getSize(
      imageUri,
      (width, height) => {
        if (!isActive) return;
        if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
          setImageSize({ width, height });
        } else {
          setImageSize(null);
        }
      },
      () => {
        if (isActive) {
          setImageSize(null);
        }
      },
    );

    return () => {
      isActive = false;
    };
  }, [imageUri, visible]);

  const imageFrame = useMemo(() => {
    const maxWidth = Math.max(220, Math.min(viewportWidth - 72, 680));
    const maxHeight = Math.max(220, Math.min(viewportHeight - (insets.top + insets.bottom + 250), 620));
    if (!imageSize) {
      return {
        width: maxWidth,
        height: Math.min(360, maxHeight),
      };
    }

    const scale = Math.min(maxWidth / imageSize.width, maxHeight / imageSize.height, 1);
    return {
      width: Math.max(140, Math.round(imageSize.width * scale)),
      height: Math.max(120, Math.round(imageSize.height * scale)),
    };
  }, [imageSize, insets.bottom, insets.top, viewportHeight, viewportWidth]);

  const zoomedWidth = Math.round(imageFrame.width * zoom);
  const zoomedHeight = Math.round(imageFrame.height * zoom);
  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;

  const renderZoomButton = (
    iconName: React.ComponentProps<typeof Feather>['name'],
    label: string,
    disabled: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: disabled ? '#e2e8f0' : '#bfdbfe',
        backgroundColor: disabled ? '#f8fafc' : '#eff6ff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Feather name={iconName} size={15} color={disabled ? '#94a3b8' : '#1d4ed8'} />
      <Text style={{ color: disabled ? '#94a3b8' : '#1d4ed8', ...typography.bodyCompact, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.24)',
          justifyContent: 'center',
          paddingHorizontal: 18,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#dbe7fb',
            padding: 16,
            maxHeight: '86%',
            shadowColor: '#0f172a',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.18,
            shadowRadius: 18,
            elevation: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', flex: 1, paddingRight: 12 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 14,
                  backgroundColor: '#2563eb18',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Feather name="image" size={17} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, ...typography.sectionTitle }}>{title}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, ...typography.caption, marginTop: 3 }}>{subtitle}</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: '#dbe7fb',
                backgroundColor: '#f8fbff',
              }}
            >
              <Feather name="x" size={18} color={BRAND_COLORS.textMuted} />
            </Pressable>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {renderZoomButton('minus-circle', 'Perkecil', !canZoomOut, () =>
                setZoom((current) => Math.max(MIN_ZOOM, Number((current - ZOOM_STEP).toFixed(2)))),
              )}
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  backgroundColor: '#f8fbff',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#1e3a8a', ...typography.bodyCompact, fontWeight: '700' }}>
                  Zoom {Math.round(zoom * 100)}%
                </Text>
              </View>
              {renderZoomButton('plus-circle', 'Perbesar', !canZoomIn, () =>
                setZoom((current) => Math.min(MAX_ZOOM, Number((current + ZOOM_STEP).toFixed(2)))),
              )}
            </View>
            <Pressable
              onPress={() => setZoom(MIN_ZOOM)}
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                backgroundColor: '#fff',
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: '#334155', ...typography.bodyCompact, fontWeight: '700' }}>Reset</Text>
            </Pressable>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 16,
              backgroundColor: '#f8fbff',
              padding: 12,
              flex: 1,
              minHeight: 260,
            }}
          >
            {imageUri ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{
                    minWidth: '100%',
                    minHeight: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                  }}
                >
                  <Image
                    source={{ uri: imageUri }}
                    resizeMode="contain"
                    style={{
                      width: zoomedWidth,
                      height: zoomedHeight,
                      borderRadius: 14,
                      backgroundColor: '#ffffff',
                    }}
                  />
                </ScrollView>
              </ScrollView>
            ) : null}
          </View>

          <Pressable
            onPress={onClose}
            style={{
              marginTop: 14,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              backgroundColor: '#fff',
              borderRadius: 12,
              paddingVertical: 11,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, ...typography.bodyCompact, fontWeight: '700' }}>Tutup</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default ExamImagePreviewModal;
