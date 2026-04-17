import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import {
  buildMobileFontSizes,
  buildMobileTypography,
  resolveMobileTextScaleMode,
  resolveMobileTextScaleMultiplier,
  scaleMobileFontSize,
  scaleMobileLineHeight,
  type MobileTextScaleMode,
} from './typography';

type ScaleFontOptions = {
  min?: number;
  max?: number;
};

type AppTextScaleContextValue = {
  mode: MobileTextScaleMode;
  scaleMultiplier: number;
  fontSizes: ReturnType<typeof buildMobileFontSizes>;
  typography: ReturnType<typeof buildMobileTypography>;
  setMode: (mode: MobileTextScaleMode) => void;
  scaleFont: (value: number, options?: ScaleFontOptions) => number;
  scaleLineHeight: (value: number, options?: ScaleFontOptions) => number;
};

const AppTextScaleContext = createContext<AppTextScaleContextValue | null>(null);

function clampValue(value: number, options?: ScaleFontOptions) {
  if (typeof options?.min === 'number') {
    value = Math.max(options.min, value);
  }
  if (typeof options?.max === 'number') {
    value = Math.min(options.max, value);
  }
  return value;
}

export function AppTextScaleProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const preferredMode = useMemo(() => resolveMobileTextScaleMode(user?.preferences), [user?.preferences]);
  const [mode, setMode] = useState<MobileTextScaleMode>(preferredMode);

  useEffect(() => {
    setMode(preferredMode);
  }, [preferredMode]);

  const scaleMultiplier = useMemo(() => resolveMobileTextScaleMultiplier(mode), [mode]);
  const fontSizes = useMemo(() => buildMobileFontSizes(scaleMultiplier), [scaleMultiplier]);
  const typography = useMemo(() => buildMobileTypography(scaleMultiplier), [scaleMultiplier]);

  const scaleFont = useCallback(
    (value: number, options?: ScaleFontOptions) => {
      return clampValue(scaleMobileFontSize(value, scaleMultiplier), options);
    },
    [scaleMultiplier],
  );

  const scaleLineHeight = useCallback(
    (value: number, options?: ScaleFontOptions) => {
      return clampValue(scaleMobileLineHeight(value, scaleMultiplier), options);
    },
    [scaleMultiplier],
  );

  const value = useMemo<AppTextScaleContextValue>(
    () => ({
      mode,
      scaleMultiplier,
      fontSizes,
      typography,
      setMode,
      scaleFont,
      scaleLineHeight,
    }),
    [fontSizes, mode, scaleFont, scaleLineHeight, scaleMultiplier, typography],
  );

  return <AppTextScaleContext.Provider value={value}>{children}</AppTextScaleContext.Provider>;
}

export function useAppTextScale() {
  const context = useContext(AppTextScaleContext);
  if (!context) {
    throw new Error('useAppTextScale harus dipakai di dalam AppTextScaleProvider.');
  }
  return context;
}
