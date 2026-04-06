import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

export type ThemeMode = 'system' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const MOBILE_THEME_MODE_STORAGE_KEY = 'sis.mobile.theme-mode';
export const THEME_MODE_PREFERENCE_KEY = 'themeMode';

type AppThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceStrong: string;
  border: string;
  borderSoft: string;
  text: string;
  textMuted: string;
  textSoft: string;
  primary: string;
  primarySoft: string;
  successBg: string;
  successBorder: string;
  successText: string;
  warningBg: string;
  warningBorder: string;
  warningText: string;
  dangerBg: string;
  dangerBorder: string;
  dangerText: string;
  overlay: string;
};

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  colors: AppThemeColors;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const LIGHT_COLORS: AppThemeColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  surfaceStrong: '#eef2ff',
  border: '#dbe7fb',
  borderSoft: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  textSoft: '#94a3b8',
  primary: '#2563eb',
  primarySoft: '#dbeafe',
  successBg: '#ecfdf5',
  successBorder: '#a7f3d0',
  successText: '#065f46',
  warningBg: '#ffedd5',
  warningBorder: '#fdba74',
  warningText: '#9a3412',
  dangerBg: '#fff1f2',
  dangerBorder: '#fecdd3',
  dangerText: '#9f1239',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.removeItem(MOBILE_THEME_MODE_STORAGE_KEY)
      .finally(() => {
        if (mounted) setIsReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback(async (_nextMode: ThemeMode) => {
    await AsyncStorage.removeItem(MOBILE_THEME_MODE_STORAGE_KEY);
  }, []);

  const mode: ThemeMode = 'system';
  const resolvedTheme: ResolvedTheme = 'light';
  const colors = LIGHT_COLORS;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedTheme,
      colors,
      setMode,
    }),
    [colors, mode, resolvedTheme, setMode],
  );

  if (!isReady) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme harus dipakai di dalam AppThemeProvider.');
  }
  return context;
}
