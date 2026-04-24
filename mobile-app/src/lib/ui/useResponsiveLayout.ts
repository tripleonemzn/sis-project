import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export type ResponsiveLayoutState = {
  windowWidth: number;
  windowHeight: number;
  shortestSide: number;
  isTablet: boolean;
  isLandscape: boolean;
  prefersSplitPane: boolean;
  pageHorizontal: number;
  pageMaxWidth: number;
  summaryColumns: number;
};

export function useResponsiveLayout(): ResponsiveLayoutState {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const shortestSide = Math.min(width, height);
    const longestSide = Math.max(width, height);
    const isLandscape = width > height;
    const isTablet = shortestSide >= 600 || longestSide >= 900;
    const prefersSplitPane = isTablet && isLandscape;

    return {
      windowWidth: width,
      windowHeight: height,
      shortestSide,
      isTablet,
      isLandscape,
      prefersSplitPane,
      pageHorizontal: isTablet ? 32 : 24,
      pageMaxWidth: isTablet ? 1180 : 720,
      summaryColumns: prefersSplitPane ? 4 : isTablet ? 3 : 2,
    };
  }, [height, width]);
}

export function buildResponsivePageContentStyle<T extends Record<string, unknown>>(
  basePadding: T,
  layout: Pick<ResponsiveLayoutState, 'pageMaxWidth'>,
) {
  return {
    ...basePadding,
    width: '100%' as const,
    alignSelf: 'center' as const,
    maxWidth: layout.pageMaxWidth,
  };
}
