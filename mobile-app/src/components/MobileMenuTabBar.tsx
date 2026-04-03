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
}: MobileMenuTabBarProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={contentContainerStyle}>
      {items.map((item, index) => (
        <View key={item.key} style={{ marginRight: index === items.length - 1 ? 0 : 8 }}>
          <MobileMenuTab
            active={activeKey === item.key}
            label={item.label}
            iconName={item.iconName}
            onPress={() => onChange(item.key)}
            minWidth={minTabWidth}
            maxWidth={maxTabWidth}
            compact={compact}
          />
        </View>
      ))}
    </ScrollView>
  );
}

export default MobileMenuTabBar;
