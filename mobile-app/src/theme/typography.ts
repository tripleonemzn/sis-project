import type { TextStyle } from 'react-native';

type TypographyToken = Readonly<Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight'>>;

export const MOBILE_FONT_SIZE_CEILING = 20;

export const MOBILE_FONT_SIZES = {
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

export const MOBILE_TYPOGRAPHY: Record<
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
  | 'metricHero',
  TypographyToken
> = {
  pageTitle: { fontSize: MOBILE_FONT_SIZES.pageTitle, lineHeight: 28, fontWeight: '700' },
  sectionTitle: { fontSize: MOBILE_FONT_SIZES.sectionTitle, lineHeight: 24, fontWeight: '700' },
  cardTitle: { fontSize: MOBILE_FONT_SIZES.cardTitle, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: MOBILE_FONT_SIZES.body, lineHeight: 22, fontWeight: '400' },
  bodyCompact: { fontSize: MOBILE_FONT_SIZES.bodyCompact, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: MOBILE_FONT_SIZES.label, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: MOBILE_FONT_SIZES.caption, lineHeight: 16, fontWeight: '500' },
  micro: { fontSize: MOBILE_FONT_SIZES.micro, lineHeight: 14, fontWeight: '500' },
  metricCompact: { fontSize: MOBILE_FONT_SIZES.metricCompact, lineHeight: 22, fontWeight: '700' },
  metric: { fontSize: MOBILE_FONT_SIZES.metric, lineHeight: 24, fontWeight: '700' },
  metricHero: { fontSize: MOBILE_FONT_SIZES.metricHero, lineHeight: 26, fontWeight: '700' },
};

export default MOBILE_TYPOGRAPHY;
