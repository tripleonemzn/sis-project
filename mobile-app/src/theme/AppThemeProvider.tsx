import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Appearance,
  ColorSchemeName,
} from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useAuth } from '../features/auth/AuthProvider';

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

const DARK_COLORS: AppThemeColors = {
  background: '#08111f',
  surface: '#0f172a',
  surfaceMuted: '#111c31',
  surfaceStrong: '#172554',
  border: '#22314d',
  borderSoft: '#334155',
  text: '#e5eefc',
  textMuted: '#a8b6cc',
  textSoft: '#7c8ca6',
  primary: '#60a5fa',
  primarySoft: '#1e3a8a',
  successBg: '#052e2b',
  successBorder: '#115e59',
  successText: '#99f6e4',
  warningBg: '#3b1d07',
  warningBorder: '#9a3412',
  warningText: '#fed7aa',
  dangerBg: '#3a1020',
  dangerBorder: '#9f1239',
  dangerText: '#fecdd3',
  overlay: 'rgba(2, 6, 23, 0.7)',
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeThemeMode(value: unknown): ThemeMode | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'dark') {
    return 'dark';
  }
  if (normalized === 'system' || normalized === 'light') {
    return 'system';
  }
  return null;
}

function resolveTheme(mode: ThemeMode, systemScheme: ColorSchemeName): ResolvedTheme {
  if (mode === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return mode;
}

function readPreferenceThemeMode(preferences: unknown): ThemeMode | null {
  if (!preferences || typeof preferences !== 'object') return null;
  return normalizeThemeMode((preferences as Record<string, unknown>)[THEME_MODE_PREFERENCE_KEY]);
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(MOBILE_THEME_MODE_STORAGE_KEY)
      .then((stored) => {
        if (!mounted) return;
        setModeState(normalizeThemeMode(stored) || 'system');
      })
      .finally(() => {
        if (mounted) setIsReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const preferredMode = readPreferenceThemeMode(user?.preferences);
    if (!preferredMode) return;
    setModeState(preferredMode);
    void AsyncStorage.setItem(MOBILE_THEME_MODE_STORAGE_KEY, preferredMode);
  }, [user?.id, user?.preferences]);

  const setMode = useCallback(async (nextMode: ThemeMode) => {
    setModeState(nextMode);
    await AsyncStorage.setItem(MOBILE_THEME_MODE_STORAGE_KEY, nextMode);
  }, []);

  const resolvedTheme = resolveTheme(mode, systemScheme);
  const colors = resolvedTheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;

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
