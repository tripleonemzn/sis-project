import { type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BRAND_COLORS } from '../config/brand';

export type MobileTabChipProps = {
  active: boolean;
  label: string;
  onPress: () => void;
  compact?: boolean;
  minWidth?: number;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function MobileTabChip({
  active,
  label,
  onPress,
  compact = false,
  minWidth,
  icon,
  style,
  textStyle,
}: MobileTabChipProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minWidth,
          borderWidth: 1,
          borderColor: active ? '#2563eb' : '#d7e3f7',
          backgroundColor: active ? '#eef4ff' : '#ffffff',
          borderRadius: 999,
          paddingHorizontal: compact ? 14 : 16,
          paddingVertical: compact ? 9 : 11,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.88 : 1,
          ...(active
            ? {
                shadowColor: '#2563eb',
                shadowOpacity: 0.12,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }
            : null),
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {icon ? <View style={{ marginRight: 6 }}>{icon}</View> : null}
        <Text
          numberOfLines={1}
          style={[
            {
              color: active ? '#1d4ed8' : BRAND_COLORS.textDark,
              fontWeight: '700',
              fontSize: compact ? 12 : 13,
              letterSpacing: 0.1,
            },
            textStyle,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
