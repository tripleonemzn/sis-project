import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BRAND_COLORS } from '../config/brand';
import { useAppTheme } from '../theme/AppThemeProvider';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

type MobileSummaryCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  iconName?: FeatherIconName;
  accentColor?: string;
  onPress?: () => void;
  align?: 'start' | 'center';
  style?: StyleProp<ViewStyle>;
};

export function MobileSummaryCard({
  title,
  value,
  subtitle,
  iconName = 'bar-chart-2',
  accentColor = BRAND_COLORS.blue,
  onPress,
  align = 'start',
  style,
}: MobileSummaryCardProps) {
  const { colors, resolvedTheme } = useAppTheme();
  const isCentered = align === 'center';
  const content = (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: resolvedTheme === 'dark' ? colors.border : '#dbe7fb',
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: 86,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: onPress ? 'space-between' : isCentered ? 'center' : 'flex-start',
          width: '100%',
          marginBottom: 8,
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 11,
            backgroundColor: `${accentColor}18`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={iconName} size={15} color={accentColor} />
        </View>
        {onPress ? <Feather name="chevron-right" size={16} color={colors.textSoft} /> : null}
      </View>

      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          lineHeight: 14,
          minHeight: 28,
          textAlign: isCentered ? 'center' : 'left',
          width: '100%',
        }}
        numberOfLines={2}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.text,
          fontWeight: '700',
          fontSize: 19,
          lineHeight: 24,
          marginTop: 4,
          textAlign: isCentered ? 'center' : 'left',
          width: '100%',
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
      {subtitle ? (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 10.5,
            lineHeight: 13,
            minHeight: 26,
            marginTop: 3,
            textAlign: isCentered ? 'center' : 'left',
            width: '100%',
          }}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      {content}
    </Pressable>
  );
}

export default MobileSummaryCard;
