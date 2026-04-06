import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
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
};

export function MobileSummaryCard({
  title,
  value,
  subtitle,
  iconName = 'bar-chart-2',
  accentColor = BRAND_COLORS.blue,
  onPress,
}: MobileSummaryCardProps) {
  const { colors, resolvedTheme } = useAppTheme();
  const content = (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: resolvedTheme === 'dark' ? colors.border : '#dbe7fb',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 86,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
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

      <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={2}>
        {title}
      </Text>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 19, marginTop: 4 }} numberOfLines={1}>
        {value}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 3 }} numberOfLines={2}>
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
