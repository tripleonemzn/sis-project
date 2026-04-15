import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

type StandardPagePaddingOptions = {
  horizontal?: number;
  bottom?: number;
  topMin?: number;
  topOffset?: number;
};

export function getStandardPagePadding(
  insets: EdgeInsets,
  options: StandardPagePaddingOptions = {},
) {
  const horizontal = options.horizontal ?? 24;
  const bottom = options.bottom ?? 24;
  const topMin = options.topMin ?? 28;
  const topOffset = options.topOffset ?? 10;
  const safeBottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 10) : insets.bottom;

  return {
    paddingHorizontal: horizontal,
    paddingBottom: bottom + safeBottomInset,
    paddingTop: Math.max(insets.top + topOffset, topMin),
  };
}
