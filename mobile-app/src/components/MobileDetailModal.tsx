import { type ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_COLORS } from '../config/brand';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

type MobileDetailModalProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  iconName?: FeatherIconName;
  accentColor?: string;
  onClose: () => void;
  children: ReactNode;
};

export function MobileDetailModal({
  visible,
  title,
  subtitle,
  iconName = 'info',
  accentColor = BRAND_COLORS.blue,
  onClose,
  children,
}: MobileDetailModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
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
            maxHeight: '82%',
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
                  backgroundColor: `${accentColor}18`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Feather name={iconName} size={17} color={accentColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontSize: 18, fontWeight: '700' }}>{title}</Text>
                {subtitle ? (
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3, lineHeight: 18 }}>
                    {subtitle}
                  </Text>
                ) : null}
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

          <ScrollView showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>

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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Tutup</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default MobileDetailModal;
