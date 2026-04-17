import type { TextStyle } from 'react-native';

type TypographyToken = Readonly<Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight'>>;

export const MOBILE_FONT_SIZE_CEILING = 20;
export const MOBILE_TEXT_SCALE_PREFERENCE_KEY = 'mobileTextScale';

export type MobileTextScaleMode = 'system' | 'large' | 'extraLarge';

export const MOBILE_TEXT_SCALE_OPTIONS: Array<{ label: string; value: MobileTextScaleMode }> = [
  { label: 'Ikuti Sistem', value: 'system' },
  { label: 'Besar', value: 'large' },
  { label: 'Sangat Besar', value: 'extraLarge' },
];

const MOBILE_TEXT_SCALE_MULTIPLIERS: Record<MobileTextScaleMode, number> = {
  system: 1,
  large: 1.12,
  extraLarge: 1.24,
};

const BASE_MOBILE_FONT_SIZES = {
  micro: 10,
  caption: 11,
  label: 12,
  bodyCompact: 13,
  body: 14,
  cardTitle: 16,
  sectionTitle: 18,
  pageTitle: MOBILE_FONT_SIZE_CEILING,
  metricCompact: 17,
  metric: 18,
  metricHero: MOBILE_FONT_SIZE_CEILING,
} as const;

type MobileFontSizeToken = keyof typeof BASE_MOBILE_FONT_SIZES;

type MobileTypographyKey =
  | 'pageTitle'
  | 'sectionTitle'
  | 'cardTitle'
  | 'body'
  | 'bodyCompact'
  | 'label'
  | 'caption'
  | 'micro'
  | 'metricCompact'
  | 'metric'
  | 'metricHero';

const BASE_MOBILE_TYPOGRAPHY: Record<MobileTypographyKey, TypographyToken> = {
  pageTitle: { fontSize: BASE_MOBILE_FONT_SIZES.pageTitle, lineHeight: 28, fontWeight: '700' },
  sectionTitle: { fontSize: BASE_MOBILE_FONT_SIZES.sectionTitle, lineHeight: 24, fontWeight: '700' },
  cardTitle: { fontSize: BASE_MOBILE_FONT_SIZES.cardTitle, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: BASE_MOBILE_FONT_SIZES.body, lineHeight: 22, fontWeight: '400' },
  bodyCompact: { fontSize: BASE_MOBILE_FONT_SIZES.bodyCompact, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: BASE_MOBILE_FONT_SIZES.label, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: BASE_MOBILE_FONT_SIZES.caption, lineHeight: 16, fontWeight: '500' },
  micro: { fontSize: BASE_MOBILE_FONT_SIZES.micro, lineHeight: 14, fontWeight: '500' },
  metricCompact: { fontSize: BASE_MOBILE_FONT_SIZES.metricCompact, lineHeight: 22, fontWeight: '700' },
  metric: { fontSize: BASE_MOBILE_FONT_SIZES.metric, lineHeight: 24, fontWeight: '700' },
  metricHero: { fontSize: BASE_MOBILE_FONT_SIZES.metricHero, lineHeight: 26, fontWeight: '700' },
};

export const MOBILE_FONT_SIZES: Record<MobileFontSizeToken, number> = { ...BASE_MOBILE_FONT_SIZES };

export const MOBILE_TYPOGRAPHY: Record<MobileTypographyKey, TypographyToken> = {
  ...BASE_MOBILE_TYPOGRAPHY,
};

export function resolveMobileTextScaleMode(preferences?: Record<string, unknown> | null): MobileTextScaleMode {
  const rawValue = String(preferences?.[MOBILE_TEXT_SCALE_PREFERENCE_KEY] || '').trim();
  if (rawValue === 'large' || rawValue === 'extraLarge') {
    return rawValue;
  }
  return 'system';
}

export function resolveMobileTextScaleMultiplier(mode: MobileTextScaleMode): number {
  return MOBILE_TEXT_SCALE_MULTIPLIERS[mode] || 1;
}

export function scaleMobileFontSize(value: number, multiplier = 1) {
  return Math.max(10, Math.round(value * multiplier));
}

export function scaleMobileLineHeight(value: number, multiplier = 1) {
  return Math.max(14, Math.round(value * multiplier));
}

export function buildMobileFontSizes(multiplier = 1): Record<MobileFontSizeToken, number> {
  return Object.fromEntries(
    Object.entries(BASE_MOBILE_FONT_SIZES).map(([key, value]) => [key, scaleMobileFontSize(value, multiplier)]),
  ) as Record<MobileFontSizeToken, number>;
}

export function buildMobileTypography(multiplier = 1): Record<MobileTypographyKey, TypographyToken> {
  return Object.fromEntries(
    Object.entries(BASE_MOBILE_TYPOGRAPHY).map(([key, value]) => [
      key,
      {
        fontSize: scaleMobileFontSize(value.fontSize || 14, multiplier),
        lineHeight: scaleMobileLineHeight(value.lineHeight || 20, multiplier),
        fontWeight: value.fontWeight,
      },
    ]),
  ) as Record<MobileTypographyKey, TypographyToken>;
}

export default MOBILE_TYPOGRAPHY;
