const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return fallback;
}

export type AcademicFeatureFlags = {
  academicPromotionV2Enabled: boolean;
};

export function getAcademicFeatureFlags(): AcademicFeatureFlags {
  return {
    academicPromotionV2Enabled: readBooleanEnv('ACADEMIC_PROMOTION_V2_ENABLED', false),
  };
}

export function isAcademicPromotionV2Enabled() {
  return getAcademicFeatureFlags().academicPromotionV2Enabled;
}
