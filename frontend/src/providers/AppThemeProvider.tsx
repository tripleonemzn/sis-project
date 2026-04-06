import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../services/auth.service';

export type ThemeMode = 'system' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_MODE_STORAGE_KEY = 'sis.theme-mode';
export const THEME_MODE_PREFERENCE_KEY = 'themeMode';

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
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

function readStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  return normalizeThemeMode(window.localStorage.getItem(THEME_MODE_STORAGE_KEY)) || 'system';
}

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return resolveSystemTheme();
  return mode;
}

function readPreferenceThemeMode(preferences: unknown): ThemeMode | null {
  if (!preferences || typeof preferences !== 'object') return null;
  return normalizeThemeMode((preferences as Record<string, unknown>)[THEME_MODE_PREFERENCE_KEY]);
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredThemeMode());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredThemeMode()));

  const hasToken =
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined' &&
    Boolean(window.localStorage.getItem('token'));

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMeSafe,
    enabled: hasToken,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const nextMode = readPreferenceThemeMode(meQuery.data?.data?.preferences);
    if (!nextMode) return;
    setModeState(nextMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
    }
  }, [meQuery.data?.data?.id, meQuery.data?.data?.preferences]);

  useEffect(() => {
    const applyResolvedTheme = () => {
      setResolvedTheme(resolveTheme(mode));
    };
    applyResolvedTheme();

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (mode === 'system') {
        applyResolvedTheme();
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [mode]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.themeMode = mode;
    root.dataset.theme = resolvedTheme;
    root.classList.toggle('dark', resolvedTheme === 'dark');
  }, [mode, resolvedTheme]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedTheme,
      setMode,
    }),
    [mode, resolvedTheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme harus dipakai di dalam AppThemeProvider.');
  }
  return context;
}
