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

  return {
    paddingHorizontal: horizontal,
    paddingBottom: bottom,
    paddingTop: Math.max(insets.top + topOffset, topMin),
  };
}
