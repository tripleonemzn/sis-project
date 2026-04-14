import { Feather } from '@expo/vector-icons';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { MobileMenuTab } from './MobileMenuTab';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

type MobileMenuTabBarProps = {
  items: Array<{
    key: string;
    label: string;
    iconName?: FeatherIconName;
  }>;
  activeKey: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  minTabWidth?: number;
  maxTabWidth?: number;
  compact?: boolean;
  layout?: 'scroll' | 'fill';
  tabVariant?: 'card' | 'plain';
  gap?: number;
};

export function MobileMenuTabBar({
  items,
  activeKey,
  onChange,
  style,
  contentContainerStyle,
  minTabWidth = 76,
  maxTabWidth = 112,
  compact = true,
  layout = 'scroll',
  tabVariant = 'plain',
  gap = 8,
}: MobileMenuTabBarProps) {
  if (layout === 'fill') {
    return (
      <View style={style}>
        <View style={[{ flexDirection: 'row', alignItems: 'flex-start' }, contentContainerStyle]}>
          {items.map((item, index) => (
            <View key={item.key} style={{ flex: 1, minWidth: 0, marginRight: index === items.length - 1 ? 0 : gap }}>
              <MobileMenuTab
                active={activeKey === item.key}
                label={item.label}
                iconName={item.iconName}
                onPress={() => onChange(item.key)}
                minWidth={0}
                compact={compact}
                variant={tabVariant}
                fill
              />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={contentContainerStyle}>
      {items.map((item, index) => (
        <View key={item.key} style={{ marginRight: index === items.length - 1 ? 0 : gap }}>
          <MobileMenuTab
            active={activeKey === item.key}
            label={item.label}
            iconName={item.iconName}
            onPress={() => onChange(item.key)}
            minWidth={minTabWidth}
            maxWidth={maxTabWidth}
            compact={compact}
            variant={tabVariant}
          />
        </View>
      ))}
    </ScrollView>
  );
}

export default MobileMenuTabBar;
