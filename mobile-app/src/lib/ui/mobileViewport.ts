import { Platform } from 'react-native';

const TABLET_MIN_SHORTEST_SIDE = 600;
const TABLET_MAX_WIDTH_PORTRAIT = 760;
const TABLET_MAX_WIDTH_LANDSCAPE = 1040;
const TABLET_HORIZONTAL_PADDING_PORTRAIT = 28;
const TABLET_HORIZONTAL_PADDING_LANDSCAPE = 32;

export type MobileViewportMetrics = {
  width: number;
  height: number;
  shortestSide: number;
  isLandscape: boolean;
  isTablet: boolean;
  contentMaxWidth?: number;
  recommendedHorizontalPadding: number;
};

export function getMobileViewportMetrics(width: number, height: number): MobileViewportMetrics {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
  const shortestSide = Math.min(safeWidth || safeHeight, safeHeight || safeWidth);
  const isLandscape = safeWidth > safeHeight;
  const isTablet = Platform.OS !== 'web' && shortestSide >= TABLET_MIN_SHORTEST_SIDE;

  return {
    width: safeWidth,
    height: safeHeight,
    shortestSide,
    isLandscape,
    isTablet,
    contentMaxWidth: isTablet ? (isLandscape ? TABLET_MAX_WIDTH_LANDSCAPE : TABLET_MAX_WIDTH_PORTRAIT) : undefined,
    recommendedHorizontalPadding: isTablet
      ? isLandscape
        ? TABLET_HORIZONTAL_PADDING_LANDSCAPE
        : TABLET_HORIZONTAL_PADDING_PORTRAIT
      : 24,
  };
}

export function isTabletViewport(width: number, height: number) {
  return getMobileViewportMetrics(width, height).isTablet;
}
